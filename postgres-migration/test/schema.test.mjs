import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../src/adapter.mjs';

test('PostgreSQL schema supports existing stock, order and settings queries', async () => {
  const engine = new PGlite();
  // Embedded PostgreSQL validates real SQL and constraints. Advisory locking is
  // tested separately: PGlite has one connection and no multi-instance lock test.
  async function query(input) {
    const sql = typeof input === 'string' ? input : input.text;
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], fields: [], rowCount: 0 };
    const result = await engine.query(sql, input.values ?? []);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  }
  const db = createDatabase({ query, connect: async () => ({ query, release() {} }) });
  try {
    await engine.exec(await readFile(new URL('../migrations/0001_postgresql.sql', import.meta.url), 'utf8'));
    await db.prepare('INSERT INTO products(id,name,category,description,image,price) VALUES(?,?,?,?,?,?)').bind('p','Game','Steam','','',1000).run();
    await db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('k','p','00123').run();
    const reserve = id => db.batch([
      db.prepare('INSERT INTO orders(id,user_id,email,items,total,request_key,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM keys WHERE product_id=? AND order_id IS NULL)>=?').bind(id,'u','a@example.com','[]',1000,id,1791936000000,'p',1),
      db.prepare('UPDATE keys SET order_id=? WHERE id IN (SELECT id FROM keys WHERE product_id=? AND order_id IS NULL LIMIT ?) AND EXISTS(SELECT 1 FROM orders WHERE id=?)').bind(id,'p',1,id)
    ]);
    await reserve('o1');
    await reserve('o2');
    assert.equal((await db.prepare('SELECT * FROM orders WHERE id=?').bind('o1').first()).created_at, 1791936000000);
    assert.equal(await db.prepare('SELECT * FROM orders WHERE id=?').bind('o2').first(), null);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM keys WHERE order_id=?').bind('o1').first()).n, 1);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('k2','p','new'),
      db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('k3','p','00123')
    ]));
    assert.equal(await db.prepare('SELECT * FROM keys WHERE id=?').bind('k2').first(), null);
    await assert.rejects(db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('bad','missing','code').run());
    await db.prepare("INSERT INTO settings(id,value) VALUES('store',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind('{"automatic":true}').run();
    assert.deepEqual(JSON.parse((await db.prepare("SELECT value FROM settings WHERE id='store'").first()).value), { automatic: true });
  } finally { await engine.close(); }
});
