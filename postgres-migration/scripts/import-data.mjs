// Input: one JSON object containing arrays named products, orders, keys, settings.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createDatabase } from '../src/adapter.mjs';

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) throw new Error('Use DATABASE_URL e node scripts/import-data.mjs arquivo.json');
const data = JSON.parse(await readFile(file, 'utf8'));
const columns = {
  products: ['id','name','category','description','image','price','old_price','active','automatic','deleted'],
  orders: ['id','user_id','email','items','total','status','payment_id','request_key','qr','qr_image','created_at','paid_at','delivered_at'],
  keys: ['id','product_id','code','order_id'],
  settings: ['id','value']
};
if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !Object.hasOwn(columns, k))) {
  throw new Error('Formato da exportação inválido.');
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = createDatabase(pool);
try {
  const statements = [];
  for (const [table, fields] of Object.entries(columns)) {
    if (!Array.isArray(data[table])) throw new Error(`Falta o array ${table}.`);
    for (const row of data[table]) {
      if (!row || fields.some(f => !Object.hasOwn(row, f)) || Object.keys(row).some(f => !fields.includes(f))) {
        throw new Error(`Colunas inválidas em ${table}. Exporte todas as colunas originais.`);
      }
      statements.push(db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).bind(...fields.map(f => row[f])));
    }
  }
  await db.batch(statements);
  console.log('Dados importados em uma transação.');
} finally { await pool.end(); }
