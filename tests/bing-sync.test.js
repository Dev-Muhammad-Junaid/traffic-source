import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import util from 'node:util';
import Database from 'better-sqlite3';
import { createSqliteClient } from '../src/lib/database/client';
import { runMigrations } from '../src/lib/migrations';

let client;
let previousKey;

vi.mock('../src/lib/db', () => ({ getDb: async () => client }));
vi.mock('../src/lib/auth', () => ({ getAuthUser: () => ({ userId: 1, email: 'a@b.c' }) }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('not in a worker');
  },
}));

const { syncAllBing, syncBingSite, CRON_RUN_BUDGET_MS, SITE_SYNC_BUDGET_MS, BACKGROUND_RUN_BUDGET_MS } = await import('../src/lib/bing-sync');
const { listBingSites } = await import('../src/lib/bing');
const { default: credentialsHandler } = await import('../src/pages/api/settings/integrations/bing/credentials');
const { default: cronHandler } = await import('../src/pages/api/cron/bing-sync');

function bingReplies(handler) {
  globalThis.fetch = vi.fn(async (url) => {
    const method = new URL(url).pathname.split('/').pop();
    const { status = 200, body } = handler(method);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}

const throttled = () => ({ status: 400, body: { ErrorCode: 17, Message: 'ERROR!!! ThrottleIP' } });

function link(siteId) {
  return client.raw.prepare('SELECT status, last_error, last_sync_at FROM bing_site_links WHERE site_id = ?').get(siteId);
}

function assertNoSecret(value, secret) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const encoded = encodeURIComponent(secret);
  expect(text).not.toContain(secret);
  if (encoded !== secret) expect(text).not.toContain(encoded);
  const form = encoded.replace(/%20/g, '+');
  if (form !== encoded) expect(text).not.toContain(form);
}

function loggedText(spy) {
  return spy.mock.calls.flat().map((part) => (part instanceof Error ? util.inspect(part) : String(part))).join(' ');
}

function hangUntilAbort(url, init) {
  const method = new URL(url).pathname.split('/').pop();
  if (method === 'GetUserSites') {
    return Promise.resolve(new Response(JSON.stringify({
      d: [
        { Url: 'https://getbanksheet.com/', IsVerified: true },
        { Url: 'https://widgetsflow.com/', IsVerified: true },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener('abort', abort, { once: true });
  });
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  const raw = new Database(':memory:');
  runMigrations(raw);
  client = createSqliteClient(raw);
  raw.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (1, 'a@b.c', 'x', 'A')").run();
  raw.prepare("INSERT INTO sites (id, user_id, name, domain) VALUES (3, 1, 'BankSheet', 'getbanksheet.com')").run();
  raw.prepare(`INSERT INTO bing_site_links (site_id, bing_url, status, last_sync_at)
               VALUES (3, 'https://getbanksheet.com/', 'active', '2026-10-30 04:16:15')`).run();
  previousKey = process.env.BING_WEBMASTER_API_KEY;
  process.env.BING_WEBMASTER_API_KEY = 'test-key';
});

afterEach(() => {
  if (previousKey === undefined) delete process.env.BING_WEBMASTER_API_KEY;
  else process.env.BING_WEBMASTER_API_KEY = previousKey;
  client?.raw?.close();
  client = null;
  vi.restoreAllMocks();
});

describe('Bing sync failures are recorded, not swallowed', () => {
  it('cron run: ThrottleIP on GetUserSites marks the link as error with a message', async () => {
    bingReplies(throttled);
    const started = Date.now();
    const result = await syncAllBing();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toMatch(/ThrottleIP/);
    expect(link(3)).toMatchObject({ status: 'error', last_sync_at: '2026-10-30 04:16:15' });
    expect(link(3).last_error).toMatch(/ThrottleIP/);
  });

  it('cron route returns 502 with that message instead of a generic 500', async () => {
    bingReplies(throttled);
    const res = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/ThrottleIP/);
    expect(String(JSON.stringify(res.body))).not.toContain('test-key');
    expect(link(3).status).toBe('error');
  });

  it('manual Sync now: ThrottleIP finishes quickly and leaves an error, not a stuck syncing row', async () => {
    bingReplies(throttled);
    const started = Date.now();
    const result = await syncBingSite(3);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toMatch(/ThrottleIP/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_error).toMatch(/ThrottleIP/);
    expect(link(3).last_sync_at).toBe('2026-10-30 04:16:15');
  });

  it('does not retry ThrottleIP, and the error text does not include the API key', async () => {
    bingReplies(throttled);
    const started = Date.now();
    let thrown;
    try {
      await listBingSites('pasted-key');
    } catch (err) {
      thrown = err;
    }
    expect(Date.now() - started).toBeLessThan(5000);
    expect(thrown?.message).toMatch(/ThrottleIP/);
    expect(thrown.message).not.toContain('pasted-key');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('settings save returns the Bing error quickly and does not store the key', async () => {
    bingReplies(throttled);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();
    const res = mockRes();
    await credentialsHandler(
      { method: 'POST', body: { apiKey: 'pasted-key' }, headers: {} },
      res,
    );
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ThrottleIP/);
    expect(res.body.error).toMatch(/will not fix it/);
    expect(res.body.error).not.toContain('pasted-key');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const saved = client.raw.prepare("SELECT value FROM app_settings WHERE key = 'bing_api_key'").get();
    expect(saved).toBeUndefined();
    const flat = logged.mock.calls.flat().map((part) => (part instanceof Error ? part.message : String(part))).join(' ');
    expect(flat).toMatch(/ThrottleIP/);
    expect(flat).not.toContain('pasted-key');
  });

  it('a hung Bing call aborts and reports a timeout instead of retrying', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      }, 20);
      return controller.signal;
    });
    globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort, { once: true });
    }));
    const started = Date.now();
    const result = await syncBingSite(3);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.error).toMatch(/did not answer within 15s/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_error).toMatch(/did not answer within 15s/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('InvalidApiKey is stored without a retry', async () => {
    bingReplies(() => ({ status: 400, body: { ErrorCode: 3, Message: 'ERROR!!! InvalidApiKey' } }));
    const result = await syncAllBing();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toMatch(/InvalidApiKey/);
    expect(link(3)).toMatchObject({ status: 'error' });
    expect(link(3).last_error).toMatch(/InvalidApiKey/);
  });

  it('no API key: the skip is written to last_error and the cron stays a 200', async () => {
    delete process.env.BING_WEBMASTER_API_KEY;
    const result = await syncAllBing();
    expect(result.skipped).toBe('not configured');
    expect(link(3)).toMatchObject({ status: 'error', last_error: 'Bing Webmaster API key is not configured' });

    const manual = await syncBingSite(3);
    expect(manual).toMatchObject({ reason: 'no api key', error: 'Bing Webmaster API key is not configured' });
    expect(link(3).status).toBe('error');

    const res = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Bing Webmaster API key is not configured');
  });

  it('a per-user sync records GetUserSites failure only on that user\'s links', async () => {
    client.raw.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (2, 'b@b.c', 'x', 'B')").run();
    client.raw.prepare("INSERT INTO sites (id, user_id, name, domain) VALUES (4, 2, 'Other', 'widgetsflow.com')").run();
    client.raw.prepare(`INSERT INTO bing_site_links (site_id, bing_url, status, last_sync_at)
                        VALUES (4, 'https://widgetsflow.com/', 'active', '2026-10-30 04:15:00')`).run();
    bingReplies(throttled);
    const result = await syncAllBing({ userId: 1 });
    expect(result.error).toMatch(/ThrottleIP/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_error).toMatch(/ThrottleIP/);
    expect(link(4)).toMatchObject({ status: 'active', last_error: null, last_sync_at: '2026-10-30 04:15:00' });
  });

  it('ThrottleIP on one site does not clear last_error on sites not yet synced', async () => {
    client.raw.prepare("INSERT INTO sites (id, user_id, name, domain) VALUES (4, 1, 'Other', 'widgetsflow.com')").run();
    client.raw.prepare(`INSERT INTO bing_site_links (site_id, bing_url, status, last_error, last_sync_at)
                        VALUES (4, 'https://widgetsflow.com/', 'error', 'previous ThrottleIP', '2026-10-30 04:15:00')`).run();
    bingReplies((method) => {
      if (method === 'GetUserSites') {
        return {
          body: {
            d: [
              { Url: 'https://getbanksheet.com/', IsVerified: true },
              { Url: 'https://widgetsflow.com/', IsVerified: true },
            ],
          },
        };
      }
      return throttled();
    });
    const result = await syncAllBing({ force: true });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ siteId: 3 });
    expect(result.results[0].error).toMatch(/ThrottleIP/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_error).toMatch(/ThrottleIP/);
    expect(link(4)).toMatchObject({
      status: 'error',
      last_error: 'previous ThrottleIP',
      last_sync_at: '2026-10-30 04:15:00',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('a database write failure is stored on the link instead of leaving it syncing', async () => {
    bingReplies((method) => {
      if (method === 'GetCrawlStats') client.raw.exec('DROP TABLE bing_daily');
      if (method === 'GetRankAndTrafficStats') {
        return { body: { d: [{ Date: '/Date(1793000000000-0700)/', Clicks: 1, Impressions: 2 }] } };
      }
      return { body: { d: [] } };
    });
    const result = await syncBingSite(3);
    expect(result.error).toMatch(/Saving Bing data failed/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_error).toMatch(/Saving Bing data failed/);
  }, 15000);

  it('healthy Bing: sync succeeds and clears the error', async () => {
    client.raw.prepare("UPDATE bing_site_links SET status = 'error', last_error = 'old'").run();
    bingReplies((method) => {
      if (method === 'GetUserSites') return { body: { d: [{ Url: 'https://getbanksheet.com/', IsVerified: true }] } };
      if (method === 'GetRankAndTrafficStats') {
        return { body: { d: [{ Date: '/Date(1793000000000-0700)/', Clicks: 1, Impressions: 5 }] } };
      }
      return { body: { d: [] } };
    });
    const result = await syncAllBing({ force: true });
    expect(result.results[0]).toMatchObject({ siteId: 3, ok: true, traffic: 1 });
    expect(link(3)).toMatchObject({ status: 'active', last_error: null });
    const daily = client.raw.prepare('SELECT clicks, impressions FROM bing_daily WHERE site_id = 3').get();
    expect(daily).toEqual({ clicks: 1, impressions: 5 });
  }, 15000);

  it('cron route: a healthy sync returns 200 and clears the error', async () => {
    client.raw.prepare("UPDATE bing_site_links SET status = 'error', last_error = 'old'").run();
    bingReplies((method) => {
      if (method === 'GetUserSites') return { body: { d: [{ Url: 'https://getbanksheet.com/', IsVerified: true }] } };
      if (method === 'GetRankAndTrafficStats') {
        return { body: { d: [{ Date: '/Date(1793000000000-0700)/', Clicks: 4, Impressions: 9 }] } };
      }
      return { body: { d: [] } };
    });
    const res = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeUndefined();
    expect(link(3)).toMatchObject({ status: 'active', last_error: null });
    expect(link(3).status).not.toBe('syncing');
    assertNoSecret(res.body, 'test-key');
    const daily = client.raw.prepare('SELECT clicks, impressions FROM bing_daily WHERE site_id = 3').get();
    expect(daily).toEqual({ clicks: 4, impressions: 9 });
  }, 20000);

  it('cron route: ThrottleIP on a stats call, after GetUserSites succeeded, is 502 and not syncing', async () => {
    bingReplies((method) => {
      if (method === 'GetUserSites') return { body: { d: [{ Url: 'https://getbanksheet.com/', IsVerified: true }] } };
      return throttled();
    });
    const res = mockRes();
    const started = Date.now();
    await cronHandler({ method: 'POST', headers: {} }, res);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/ThrottleIP/);
    assertNoSecret(res.body, 'test-key');
    expect(link(3)).toMatchObject({ status: 'error', last_sync_at: '2026-10-30 04:16:15' });
    expect(link(3).last_error).toMatch(/ThrottleIP/);
    expect(link(3).status).not.toBe('syncing');
  });

  it('cron route: InvalidApiKey is 502 with that message and the key is not stored or returned', async () => {
    const secret = 'abc+def/g==';
    process.env.BING_WEBMASTER_API_KEY = secret;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    bingReplies(() => ({
      status: 400,
      body: {
        ErrorCode: 3,
        Message: `ERROR!!! InvalidApiKey ${secret} https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=${encodeURIComponent(secret)}`,
      },
    }));
    const res = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/InvalidApiKey/);
    assertNoSecret(res.body, secret);
    assertNoSecret(link(3).last_error, secret);
    expect(link(3).status).toBe('error');
    expect(loggedText(logged)).not.toMatch(/abc\+def|abc%2Bdef/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('a transport error that echoes the request URL does not reveal the API key', async () => {
    const secret = 'abc+def/g==';
    process.env.BING_WEBMASTER_API_KEY = secret;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (url) => {
      throw new TypeError(`connect ECONNREFUSED ${url}`);
    });
    const res = mockRes();
    await credentialsHandler({ method: 'POST', body: { apiKey: secret }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/request failed/);
    assertNoSecret(res.body, secret);
    assertNoSecret(loggedText(logged), secret);
    const saved = client.raw.prepare("SELECT value FROM app_settings WHERE key = 'bing_api_key'").get();
    expect(saved).toBeUndefined();

    const cron = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, cron);
    expect(cron.statusCode).toBe(502);
    assertNoSecret(cron.body, secret);
    assertNoSecret(link(3).last_error, secret);
    expect(link(3).status).toBe('error');
  });

  it('cron route: a call that stays open past 15s returns 502 and does not leave the row syncing', async () => {
    globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort, { once: true });
    }));
    const started = Date.now();
    const res = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, res);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(14900);
    expect(elapsed).toBeLessThan(22000);
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/did not answer within 15s/);
    assertNoSecret(res.body, 'test-key');
    expect(link(3)).toMatchObject({ status: 'error', last_sync_at: '2026-10-30 04:16:15' });
    expect(link(3).last_error).toMatch(/did not answer within 15s/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  }, 30000);

  it('a stats timeout is one attempt, and the next site is not marked syncing', async () => {
    client.raw.prepare("INSERT INTO sites (id, user_id, name, domain) VALUES (4, 1, 'Other', 'widgetsflow.com')").run();
    client.raw.prepare(`INSERT INTO bing_site_links (site_id, bing_url, status, last_error, last_sync_at)
                        VALUES (4, 'https://widgetsflow.com/', 'active', 'keep me', '2026-10-30 04:15:00')`).run();
    const timeouts = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      timeouts.push(ms);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), 20);
      return controller.signal;
    });
    globalThis.fetch = vi.fn(hangUntilAbort);
    const started = Date.now();
    const result = await syncAllBing({ force: true });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(timeouts[0]).toBe(15000);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].error).toMatch(/did not answer within 15s/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_error).toMatch(/did not answer within 15s/);
    expect(link(4)).toMatchObject({ status: 'active', last_error: 'keep me', last_sync_at: '2026-10-30 04:15:00' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('the cron keeps going after a timeout so a later site is still recorded', async () => {
    client.raw.prepare("INSERT INTO sites (id, user_id, name, domain) VALUES (4, 1, 'Other', 'widgetsflow.com')").run();
    client.raw.prepare(`INSERT INTO bing_site_links (site_id, bing_url, status, last_sync_at)
                        VALUES (4, 'https://widgetsflow.com/', 'active', '2026-10-30 04:15:00')`).run();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), 20);
      return controller.signal;
    });
    globalThis.fetch = vi.fn(hangUntilAbort);
    const res = mockRes();
    await cronHandler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/did not answer within 15s/);
    assertNoSecret(res.body, 'test-key');
    expect(link(3).status).toBe('error');
    expect(link(4).status).toBe('error');
    expect(link(3).status).not.toBe('syncing');
    expect(link(4).status).not.toBe('syncing');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  }, 10000);

  it('stops a slow site with an error instead of leaving it syncing', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return new Response(JSON.stringify({ d: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await syncBingSite(3, { budgetMs: 2000 });
    expect(result.error).toMatch(/Worker time limit/);
    expect(link(3).status).toBe('error');
    expect(link(3).last_sync_at).toBe('2026-10-30 04:16:15');
    expect(calls).toBeLessThan(4);
  });

  it('does not mark a site syncing when the run budget is already gone', async () => {
    bingReplies((method) => {
      if (method === 'GetUserSites') return { body: { d: [{ Url: 'https://getbanksheet.com/', IsVerified: true }] } };
      return { body: { d: [] } };
    });
    const result = await syncAllBing({ force: true, budgetMs: 1000 });
    expect(result.skipped).toEqual([{ siteId: 3, reason: 'time limit' }]);
    expect(link(3)).toMatchObject({ status: 'active', last_sync_at: '2026-10-30 04:16:15' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('settings save still stores a valid key after one check, without a retry delay', async () => {
    const secret = 'pasted-key-ok';
    bingReplies(() => ({ body: { d: [{ Url: 'https://example.com/', IsVerified: true }] } }));
    const started = Date.now();
    const res = mockRes();
    await credentialsHandler({ method: 'POST', body: { apiKey: secret }, headers: {} }, res);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const saved = client.raw.prepare("SELECT value FROM app_settings WHERE key = 'bing_api_key'").get();
    expect(saved?.value).toBeTruthy();
    assertNoSecret(saved.value, secret);
    assertNoSecret(res.body, secret);
  });

  it('the cron budget finishes three sites inside the 15 minute Worker wall limit', () => {
    const sites = 3;
    const worstMs = 15000 + sites * (SITE_SYNC_BUDGET_MS + 2000);
    expect(worstMs).toBeLessThan(CRON_RUN_BUDGET_MS);
    expect(CRON_RUN_BUDGET_MS).toBeLessThan(15 * 60 * 1000);
    expect(SITE_SYNC_BUDGET_MS).toBeLessThan(30 * 1000);
    expect(BACKGROUND_RUN_BUDGET_MS).toBeLessThan(30 * 1000);
  });
});
