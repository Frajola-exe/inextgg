import pg from "pg";
import { createDatabase } from "./postgres-adapter.mjs";

let pool;
let database;

export function postgresPoolOptions(environment = process.env) {
  if (!environment.DATABASE_URL) throw new Error("Configure DATABASE_URL na Vercel para acessar o PostgreSQL.");
  let url;
  try {
    url = new URL(environment.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("DATABASE_URL deve ser uma URL PostgreSQL válida.");
  }
  // pg replaces the entire ssl object when SSL options appear in the URI.
  // Configure TLS in one place so sslmode=require cannot discard our CA.
  for (const parameter of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey", "sslnegotiation", "uselibpqcompat"]) {
    url.searchParams.delete(parameter);
  }
  const ca = environment.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim();
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
}

// Initialize on the first server request, after runtime secrets are available.
// Reuse a small pool across warm Vercel invocations; queries are unnamed so they
// work with Supabase's transaction pooler.
export function postgresDatabase() {
  if (database) return database;
  pool = new pg.Pool(postgresPoolOptions());
  // Idle connection failures must not crash the process or print credentials.
  pool.on("error", () => console.error("Conexão PostgreSQL ociosa interrompida."));
  database = createDatabase(pool);
  return database;
}
