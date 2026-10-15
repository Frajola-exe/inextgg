import pg from "pg";
import { createDatabase } from "./postgres-adapter.mjs";

let pool;
let database;

// Initialize on the first server request, after runtime secrets are available.
// Reuse a small pool across warm Vercel invocations; queries are unnamed so they
// work with Supabase's transaction pooler.
export function postgresDatabase() {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configure DATABASE_URL na Vercel para acessar o PostgreSQL.");
  pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  // Idle connection failures must not crash the process or print credentials.
  pool.on("error", () => console.error("Conexão PostgreSQL ociosa interrompida."));
  database = createDatabase(pool);
  return database;
}
