import pg from 'pg';
import { createDatabase } from './adapter.mjs';

let pool;
let database;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL na hospedagem.');
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true
  });
  database ??= createDatabase(pool);
  return database;
}
