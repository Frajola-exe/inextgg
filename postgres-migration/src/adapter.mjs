// Compatibility for the D1 methods found in the compiled INEXT routes.
// Not a general SQLite-to-PostgreSQL translator.
export function parameterize(sql, values) {
  let count = 0;
  // Preserve strings, quoted identifiers, comments and dollar-quoted literals.
  const text = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$(\w*)\$[\s\S]*?\$\1\$|\?/g,
    token => token === '?' ? `$${++count}` : token);
  if (count !== values.length) throw new Error('Quantidade de parâmetros SQL inválida.');
  return { text, values };
}

function normalize(result) {
  // PostgreSQL returns int8 (COUNT and bigint timestamps) as strings.
  const integers = new Set((result.fields ?? []).filter(f => f.dataTypeID === 20).map(f => f.name));
  const results = result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (integers.has(key) && value !== null) {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error(`Inteiro fora do limite JavaScript: ${key}`);
      return [key, number];
    }
    return [key, value];
  })));
  return { results, success: true, meta: { changes: result.rowCount ?? 0 } };
}

export function createDatabase(pool) {
  const owner = Symbol('database');
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; this.owner = owner; }
    bind(...values) { return new Statement(this.sql, values); }
    async execute(client) { return normalize(await client.query(parameterize(this.sql, this.values))); }
    async all() { return this.execute(pool); }
    async first(column) {
      const row = (await this.all()).results[0] ?? null;
      return column === undefined ? row : row?.[column] ?? null;
    }
    async run() { return (await database.batch([this]))[0]; }
  }
  const database = {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      if (statements.some(s => !(s instanceof Statement) || s.owner !== owner)) {
        throw new Error('O lote contém uma operação de outro banco.');
      }
      const client = await pool.connect();
      let began = false;
      let releaseError;
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        began = true;
        // All writes through this adapter share the lock, across server instances.
        // Serializes the existing stock-count + reservation batch before it reads.
        await client.query('SELECT pg_advisory_xact_lock(1768842616, 1)');
        const results = [];
        for (const statement of statements) results.push(await statement.execute(client));
        await client.query('COMMIT');
        return results;
      } catch (error) {
        if (began) {
          try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
        }
        throw error;
      } finally { client.release(releaseError); }
    }
  };
  return database;
}
