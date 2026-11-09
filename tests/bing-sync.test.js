import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { syncAllBing, syncBingSite } = await import('../src/lib/bing-sync');
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
});
