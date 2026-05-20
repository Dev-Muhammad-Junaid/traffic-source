/**
 * Async database client — compatible with better-sqlite3 call patterns.
 * Works with local SQLite (dev) and Cloudflare D1 (production).
 */

function bindParams(stmt, params) {
  if (params.length === 0) return stmt;
  return stmt.bind(...params);
}

function normalizeRunResult(result) {
  return {
    changes: result?.meta?.changes ?? result?.changes ?? 0,
    lastInsertRowid: result?.meta?.last_row_id ?? result?.lastInsertRowid ?? 0,
  };
}

export function createSqliteClient(rawDb) {
  return {
    driver: 'sqlite',
    raw: rawDb,

    prepare(sql) {
      const stmt = rawDb.prepare(sql);
      return {
        get: (...params) => Promise.resolve(stmt.get(...params)),
        all: (...params) => Promise.resolve(stmt.all(...params)),
        run: (...params) => Promise.resolve(normalizeRunResult(stmt.run(...params))),
      };
    },

    async exec(sql) {
      rawDb.exec(sql);
    },

    async transaction(fn) {
      const trx = rawDb.transaction(() => fn(createSqliteClient(rawDb)));
      trx();
    },

    async batch(statements) {
      for (const { sql, params = [] } of statements) {
        await this.prepare(sql).run(...params);
      }
    },
  };
}

export function createD1Client(d1) {
  return {
    driver: 'd1',
    raw: d1,

    prepare(sql) {
      return {
        get: async (...params) => {
          const result = await bindParams(d1.prepare(sql), params).first();
          return result ?? null;
        },
        all: async (...params) => {
          const result = await bindParams(d1.prepare(sql), params).all();
          return result.results ?? [];
        },
        run: async (...params) => {
          const result = await bindParams(d1.prepare(sql), params).run();
          return normalizeRunResult(result);
        },
      };
    },

    async exec(sql) {
      await d1.exec(sql);
    },

    async transaction(fn) {
      await fn(createD1Client(d1));
    },

    async batch(statements, chunkSize = 100) {
      for (let i = 0; i < statements.length; i += chunkSize) {
        const chunk = statements.slice(i, i + chunkSize);
        await d1.batch(
          chunk.map(({ sql, params = [] }) => bindParams(d1.prepare(sql), params))
        );
      }
    },
  };
}
