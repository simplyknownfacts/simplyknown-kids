// A minimal stand-in for a Cloudflare D1 binding, so workers/sync/src/index.js
// can be imported and driven directly in `node --test` -- no network, no
// Cloudflare account, no wrangler, matching how tests/backup-auth.test.mjs
// already fakes its own (much simpler) D1 binding.
//
// This is NOT a SQL engine. It recognises exactly the query shapes
// workers/sync/src/index.js actually sends (CREATE TABLE IF NOT EXISTS,
// single/multi-column equality + `>` WHERE clauses joined by AND, INSERT /
// INSERT OR REPLACE, UPDATE ... SET col = ? | NULL, DELETE) and throws on
// anything else -- so a new, un-mocked query shape fails loudly in the test
// that added it rather than silently returning nothing.

function parseWhere(whereSql, args, argIdx) {
  const preds = whereSql.split(/\s+AND\s+/i).map((clause) => {
    const m = clause.trim().match(/^(\w+)\s*(=|>|>=|<|<=)\s*\?$/);
    if (!m) throw new Error('fake-d1: unsupported WHERE clause: ' + clause);
    const [, col, op] = m;
    const val = args[argIdx++];
    return (row) => {
      const rv = row[col];
      switch (op) {
        case '=': return rv === val;
        case '>': return rv > val;
        case '>=': return rv >= val;
        case '<': return rv < val;
        case '<=': return rv <= val;
        default: return false;
      }
    };
  });
  return { test: (row) => preds.every((p) => p(row)), nextArgIdx: argIdx };
}

export function makeFakeD1() {
  const tables = new Map();
  const ensureTable = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };
  // Test-only failure injection, for proving atomic-batch behavior: the next
  // run() whose normalised SQL matches `pattern` throws instead of applying.
  // One-shot, so a test controls exactly which statement in a batch fails.
  let failOnce = null;
  const maybeFail = (norm) => {
    if (failOnce && failOnce.pattern.test(norm)) {
      const e = failOnce.error || new Error('fake-d1: injected failure for test');
      failOnce = null;
      throw e;
    }
  };

  return {
    prepare(sql) {
      const norm = sql.trim().replace(/\s+/g, ' ');

      async function run(args) {
        maybeFail(norm);
        let m;
        if ((m = norm.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i))) {
          ensureTable(m[1]);
          return { success: true };
        }
        if ((m = norm.match(/^INSERT( OR REPLACE)?\s+INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i))) {
          const replace = !!m[1];
          const table = ensureTable(m[2]);
          const cols = m[3].split(',').map((s) => s.trim());
          const row = {};
          cols.forEach((c, i) => { row[c] = args[i]; });
          if (replace) {
            const keyCol = cols[0];
            const idx = table.findIndex((r) => r[keyCol] === row[keyCol]);
            if (idx >= 0) table.splice(idx, 1);
          }
          table.push(row);
          return { success: true };
        }
        if ((m = norm.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i))) {
          const table = ensureTable(m[1]);
          let argIdx = 0;
          const setters = m[2].split(',').map((part) => {
            const mm = part.trim().match(/^(\w+)\s*=\s*(\?|NULL)$/i);
            if (!mm) throw new Error('fake-d1: unsupported SET clause: ' + part);
            if (mm[2].toUpperCase() === 'NULL') { const col = mm[1]; return (row) => { row[col] = null; }; }
            const col = mm[1];
            const val = args[argIdx++];
            return (row) => { row[col] = val; };
          });
          const where = parseWhere(m[3], args, argIdx);
          table.filter(where.test).forEach((row) => setters.forEach((s) => s(row)));
          return { success: true };
        }
        if ((m = norm.match(/^DELETE FROM (\w+) WHERE (.+)$/i))) {
          const table = ensureTable(m[1]);
          const where = parseWhere(m[2], args, 0);
          const keep = table.filter((r) => !where.test(r));
          table.length = 0; table.push(...keep);
          return { success: true };
        }
        throw new Error('fake-d1: unsupported run() query: ' + norm);
      }

      async function first(args) {
        let m;
        if ((m = norm.match(/^SELECT COUNT\(\*\) AS n FROM (\w+)(?:\s+WHERE (.+))?$/i))) {
          const table = ensureTable(m[1]);
          if (!m[2]) return { n: table.length };
          const where = parseWhere(m[2], args, 0);
          return { n: table.filter(where.test).length };
        }
        if ((m = norm.match(/^SELECT (.+?) FROM (\w+) WHERE (.+)$/i))) {
          const cols = m[1].trim();
          const table = ensureTable(m[2]);
          const where = parseWhere(m[3], args, 0);
          const row = table.find(where.test);
          if (!row) return undefined;
          if (cols === '*') return { ...row };
          const out = {};
          cols.split(',').map((s) => s.trim()).forEach((c) => { out[c] = row[c]; });
          return out;
        }
        throw new Error('fake-d1: unsupported first() query: ' + norm);
      }

      async function all() {
        throw new Error('fake-d1: all() is not implemented — not exercised by index.js yet');
      }

      // Real D1's prepare() result is usable directly (.run()/.first()/.all())
      // for parameter-less statements -- index.js's CREATE TABLE calls never
      // call .bind() first -- so both the no-bind and the bind() path share
      // the same three methods, exactly like the real binding does.
      return {
        run: () => run([]),
        first: () => first([]),
        all: () => all([]),
        bind: (...args) => ({ run: () => run(args), first: () => first(args), all: () => all(args) }),
      };
    },
    // Mirrors D1's real batch(): runs every prepared statement as one atomic
    // unit. If any statement throws, every mutation made earlier IN THIS
    // BATCH is rolled back and the error propagates -- unlike calling .run()
    // on each statement separately, where an earlier statement's effect is
    // already permanent by the time a later one fails.
    async batch(stmts) {
      const snapshot = new Map([...tables].map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
      try {
        const results = [];
        for (const stmt of stmts) results.push(await stmt.run());
        return results;
      } catch (e) {
        tables.clear();
        for (const [k, v] of snapshot) tables.set(k, v);
        throw e;
      }
    },
    // Test-only escape hatch to inspect raw table state.
    _dump: () => Object.fromEntries([...tables].map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    // Test-only failure injection -- see maybeFail() above.
    _failNextRunMatching(pattern, error) { failOnce = { pattern, error }; },
  };
}
