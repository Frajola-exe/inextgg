import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes de executar a migração.');
const sql = await readFile(new URL('../migrations/0001_postgresql.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(1768842616, 2)');
  await client.query(`CREATE TABLE IF NOT EXISTS inext_schema_migrations (
    id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const previous = await client.query('SELECT checksum FROM inext_schema_migrations WHERE id=$1', ['0001_postgresql']);
  if (previous.rows.length) {
    if (previous.rows[0].checksum !== checksum) throw new Error('A migração aplicada foi modificada.');
    console.log('Migração já aplicada.');
  } else {
    await client.query(sql);
    await client.query('INSERT INTO inext_schema_migrations(id,checksum) VALUES($1,$2)', ['0001_postgresql', checksum]);
    console.log('Estrutura PostgreSQL criada.');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }
