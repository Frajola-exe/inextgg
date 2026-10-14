// D1's HTTP API accepts a batch in one request, preserving transaction boundaries.
// https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
export function createD1HttpDatabase(readConfig, request = fetch) {
  async function query(statements) {
    const { accountId, databaseId, token } = readConfig();
    if (!accountId || !databaseId || !token) {
      throw new Error("Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_D1_API_TOKEN na Vercel para acessar o banco D1.");
    }
    const response = await request(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ batch: statements }),
      },
    );
    const body = await response.json();
    if (!response.ok || body.success !== true || !Array.isArray(body.result) ||
        body.result.length !== statements.length || body.result.some(result => result.success !== true)) {
      // Do not expose provider responses, SQL, customer data, or API tokens.
      throw new Error("Falha ao executar a operação no banco D1.");
    }
    return body.result;
  }

  class Statement {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...params) { return new Statement(this.sql, params); }
    async all() { return (await query([{ sql: this.sql, params: this.params }]))[0]; }
    async run() { return this.all(); }
    async first(column) {
      const row = (await this.all()).results?.[0] ?? null;
      if (row === null || column === undefined) return row;
      if (!Object.hasOwn(row, column)) throw new Error("Coluna inexistente no resultado D1.");
      return row[column];
    }
    async raw({ columnNames = false } = {}) {
      const rows = (await this.all()).results ?? [];
      if (!rows.length) return [];
      const columns = Object.keys(rows[0]);
      const values = rows.map(row => columns.map(column => row[column]));
      return columnNames ? [columns, ...values] : values;
    }
  }

  return {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      if (!statements.length) return [];
      if (statements.some(statement => !(statement instanceof Statement))) {
        throw new Error("O lote D1 contém uma instrução de outro banco.");
      }
      return query(statements.map(({ sql, params }) => ({ sql, params })));
    },
  };
}
