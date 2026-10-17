import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { createDatabase } from '../lib/postgres-adapter.mjs';
import { reservationStatements, retryReservationStatements } from '../lib/inventory.ts';
import { postgresPoolOptions } from '../lib/postgres.mjs';
import { rootCertificates, createSecureContext } from 'node:tls';

test('existing PostgreSQL products migrate to key and fixed defaults', async () => {
  const engine = new PGlite();
  try {
    await engine.exec("CREATE TABLE products (id text PRIMARY KEY, name text NOT NULL); INSERT INTO products VALUES ('old', 'Existing key')");
    await engine.exec(await readFile(new URL('../db/product-types-migration.sql', import.meta.url), 'utf8'));
    const { rows } = await engine.query("SELECT product_type, price_mode FROM products WHERE id='old'");
    assert.deepEqual(rows[0], { product_type: 'key', price_mode: 'fixed' });
    await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE keys(id text PRIMARY KEY, product_id text REFERENCES products(id), order_id text);');
    await engine.exec(await readFile(new URL('../db/game-versions-migration.sql', import.meta.url), 'utf8'));
    const variants=await engine.query("SELECT rowsecurity FROM pg_tables WHERE tablename='product_variants'");
    assert.equal(variants.rows[0].rowsecurity,true);
    await engine.exec("INSERT INTO product_variants(id,product_id,name,price,quantity) VALUES('standard','old','Standard',1000,1)");
    await engine.exec("INSERT INTO keys(id,product_id,variant_id) VALUES('key','old','standard')");
  } finally { await engine.close(); }
});

test('existing PostgreSQL key products gain platform-specific key types', async () => {
  const engine=new PGlite();
  try {
    await engine.exec("CREATE TABLE products (id text PRIMARY KEY, category text NOT NULL, product_type text NOT NULL); INSERT INTO products VALUES ('s','Steam','key'),('x','Xbox','key'),('p','PlayStation','key'),('svc','Outros','service')");
    await engine.exec(await readFile(new URL('../db/key-types-migration.sql',import.meta.url),'utf8'));
    const {rows}=await engine.query('SELECT id,key_type FROM products ORDER BY id');
    assert.deepEqual(rows,[{id:'p',key_type:'psn'},{id:'s',key_type:'steam'},{id:'svc',key_type:null},{id:'x',key_type:'xbox'}]);
    await assert.rejects(engine.exec("UPDATE products SET key_type='invalid' WHERE id='s'"));
  } finally {await engine.close();}
});

test('existing PostgreSQL products default to available after coming-soon migration', async () => {
  const engine=new PGlite();
  try {
    await engine.exec("CREATE TABLE products (id text PRIMARY KEY); INSERT INTO products VALUES ('old')");
    await engine.exec(await readFile(new URL('../db/coming-soon-migration.sql',import.meta.url),'utf8'));
    assert.equal((await engine.query("SELECT coming_soon FROM products WHERE id='old'")).rows[0].coming_soon,0);
    await engine.exec("UPDATE products SET coming_soon=1 WHERE id='old'");
    await assert.rejects(engine.exec("UPDATE products SET coming_soon=2 WHERE id='old'"));
  } finally {await engine.close();}
});

test('existing services and bots move to Serviços and keep their types', async () => {
  const engine=new PGlite();
  try {
    await engine.exec("CREATE TABLE products (id text PRIMARY KEY, category text NOT NULL, product_type text NOT NULL); INSERT INTO products VALUES ('game','Steam','key'),('service','Outros','service'),('bot','Outros','bot')");
    await engine.exec(await readFile(new URL('../db/services-category-migration.sql',import.meta.url),'utf8'));
    const {rows}=await engine.query('SELECT id,category,product_type FROM products ORDER BY id');
    assert.deepEqual(rows,[{id:'bot',category:'Serviços',product_type:'bot'},{id:'game',category:'Steam',product_type:'key'},{id:'service',category:'Serviços',product_type:'service'}]);
    await assert.rejects(engine.exec("UPDATE products SET category='Outros' WHERE id='bot'"));
  } finally {await engine.close();}
});

test('Supabase CA survives pg URI parsing with TLS verification enabled', () => {
  const ca = rootCertificates[0];
  const options = postgresPoolOptions({
    DATABASE_URL: 'postgresql://postgres.project:p%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&sslrootcert=missing.crt&sslnegotiation=direct&application_name=inext',
    DATABASE_SSL_CA: ca.replaceAll('\n', '\\n'),
  });
  const client = new pg.Client(options);
  assert.equal(client.ssl.ca, ca.trim());
  assert.equal(client.ssl.rejectUnauthorized, true);
  assert.equal(client.host, 'aws-0-us-east-1.pooler.supabase.com');
  assert.equal(client.port, 6543);
  assert.equal(client.password, 'p@ss');
  assert.equal(client.connectionParameters.application_name, 'inext');
  assert.doesNotThrow(() => createSecureContext(client.ssl));
});

test('URI flags cannot disable TLS verification and public certificates still work', () => {
  for (const flags of ['sslmode=no-verify', 'sslmode=disable', 'ssl=0', 'sslmode=require&uselibpqcompat=true']) {
    const client = new pg.Client(postgresPoolOptions({ DATABASE_URL: `postgresql://user:pass@host/db?${flags}` }));
    assert.equal(client.ssl.rejectUnauthorized, true);
    assert.equal(client.ssl.ca, undefined);
  }
  assert.throws(() => postgresPoolOptions({ DATABASE_URL: 'invalid' }), /URL PostgreSQL válida/);
});

test('Vercel lazily reads DATABASE_URL and reuses its PostgreSQL pool', async () => {
  const { env } = await import('../lib/vercel-workers.mjs');
  const previous = process.env.DATABASE_URL;
  const OriginalPool = pg.Pool;
  const options = [];
  pg.Pool = class { constructor(config) { options.push(config); } on() {} };
  try {
    delete process.env.DATABASE_URL;
    assert.throws(() => env.DB, /Configure DATABASE_URL/);
    process.env.DATABASE_URL = 'postgresql://postgres:example@localhost:6543/postgres';
    const database = env.DB;
    assert.equal(env.DB, database);
    assert.equal(options.length, 1);
    assert.equal(options[0].connectionString, process.env.DATABASE_URL);
    assert.equal(options[0].ssl.rejectUnauthorized, true);
    assert.equal(options[0].max, 3);
  } finally {
    pg.Pool = OriginalPool;
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test('PostgreSQL supports catalog, Appmax reservation, cancellation, delivery and rollback', async () => {
  const engine = new PGlite();
  const originalFetch = globalThis.fetch;
  async function query(input) {
    const sql = typeof input === 'string' ? input : input.text;
    // PGlite has a single connection; lock acquisition is covered by adapter tests.
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], fields: [], rowCount: 0 };
    const result = await engine.query(sql, input.values ?? []);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  }
  const db = createDatabase({ query, connect: async () => ({ query, release() {} }) });
  try {
    await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await engine.exec(await readFile(new URL('../db/postgresql.sql', import.meta.url), 'utf8'));
    const tables = await engine.query("SELECT rowsecurity FROM pg_tables WHERE schemaname='public'");
    assert.equal(tables.rows.length, 6);
    assert.ok(tables.rows.every(row => row.rowsecurity));
    globalThis.__appmaxTestEnv = { DB: db };
    globalThis.__appmaxTestUser = null;
    const store = await import('../app/api/store/route.ts');
    const emptyResponse = await store.GET();
    assert.equal(emptyResponse.status, 200);
    assert.deepEqual((await emptyResponse.json()).products, []);
    await db.prepare('INSERT INTO products(id,name,category,description,image,price) VALUES(?,?,?,?,?,?)')
      .bind('p', 'Game', 'Steam', '', '', 1000).run();
    await db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('k', 'p', '00123').run();
    const response = await store.GET();
    assert.equal(response.status, 200);
    const catalog = await response.json();
    assert.equal(catalog.products[0].stock, 1);
    assert.equal('demo' in catalog, false);
    const reserve = (id, quantity = 1) => db.batch(reservationStatements({
      id, userId: 'u', email: 'buyer@example.com', requestKey: id, createdAt: 1791936000000,
      items: [{ id: 'p', name: 'Game', price: 1000, quantity, automatic: 1 }],
    }).map(s => db.prepare(s.sql).bind(...s.values)));
    await reserve('insufficient', 2);
    assert.equal(await db.prepare('SELECT * FROM orders').first(), null);
    await reserve('first');
    await reserve('second');
    assert.equal(await db.prepare('SELECT COUNT(*) n FROM orders').first('n'), 1);
    const order = await db.prepare('SELECT * FROM orders').first();
    assert.equal(order.created_at, 1791936000000);
    assert.equal(order.payment_provider, 'appmax');
    assert.equal(order.payment_state, 'idle');
    // A definite Pix rejection returns stock; a retry must reserve it again.
    await db.prepare('UPDATE keys SET order_id=NULL WHERE order_id=?').bind('first').run();
    const attempt = await db.batch(retryReservationStatements(order).map(s=>db.prepare(s.sql).bind(...s.values)));
    const claim = attempt.at(-1);
    assert.equal(claim.meta.changes, 1);
    assert.equal(await db.prepare('SELECT order_id FROM keys').first('order_id'), 'first');
    assert.equal((await db.prepare("UPDATE orders SET payment_state='processing' WHERE id=? AND payment_state='idle'").bind('first').run()).meta.changes, 0);
    await db.prepare("UPDATE orders SET pix_expires_at=? WHERE id=?").bind(1791936600000, 'first').run();
    assert.equal(await db.prepare('SELECT pix_expires_at FROM orders').first('pix_expires_at'), 1791936600000);
    for (const time of [10, 20]) await db.prepare('INSERT INTO appmax_webhook_jobs(order_id,received_at) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET received_at=excluded.received_at').bind('first', time).run();
    assert.equal(await db.prepare('SELECT received_at FROM appmax_webhook_jobs').first('received_at'), 20);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('new', 'p', 'NEW'),
      db.prepare('INSERT INTO keys(id,product_id,code) VALUES(?,?,?)').bind('duplicate', 'p', '00123'),
    ]));
    assert.equal(await db.prepare('SELECT * FROM keys WHERE id=?').bind('new').first(), null);
    await db.prepare("INSERT INTO settings(id,value) VALUES('store',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind('{"automatic":true}').run();
    assert.deepEqual(JSON.parse(await db.prepare("SELECT value FROM settings WHERE id='store'").first('value')), { automatic: true });
    Object.assign(globalThis.__appmaxTestEnv, { APPMAX_CLIENT_ID: 'merchant', APPMAX_CLIENT_SECRET: 'secret', APPMAX_ENVIRONMENT: 'sandbox', APPMAX_EXTERNAL_ID: 'installation' });
    const { reconcile } = await import('../lib/server.ts');
    let remote = { order: { id: 42, status: 'cancelado', total_paid: '1000.00' }, customer: { id: 10 }, payment: { method: 'pix', pix: { end_to_end_id: null } } };
    globalThis.fetch = async url => Response.json(url.includes('/oauth2/token') ? { access_token: 'test-token' } : { data: remote, errors: [] });
    await db.prepare("UPDATE orders SET payment_id='42',appmax_customer_id='10',payment_state='done',status='pending',qr='000201',qr_image='image' WHERE id='first'").run();
    // Recover a dashboard cancellation even when no webhook job exists.
    assert.equal(await db.prepare('SELECT COUNT(*) n FROM appmax_webhook_jobs').first('n'), 1);
    await db.prepare('DELETE FROM appmax_webhook_jobs').run();
    const restocked = await store.GET();
    assert.equal(restocked.status, 200);
    assert.equal((await restocked.json()).products[0].stock, 1);
    const cancelled = await db.prepare("SELECT * FROM orders WHERE id='first'").first();
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.qr, null);
    assert.equal(cancelled.pix_expires_at, null);
    assert.equal(await db.prepare("SELECT order_id FROM keys WHERE id='k'").first('order_id'), null);
    await reserve('replacement');
    await reconcile(cancelled);
    assert.equal(await db.prepare("SELECT order_id FROM keys WHERE id='k'").first('order_id'), 'replacement');
    await db.prepare("UPDATE orders SET payment_id='43',appmax_customer_id='10',payment_state='done',status='pending' WHERE id='replacement'").run();
    remote = { order: { id: 43, status: 'aprovado', total_paid: '1000.00', amounts: { sub_total: '1000.00', installment_fee: null } }, customer: { id: 10, email: 'buyer@example.com' }, payment: { method: 'pix' } };
    await reconcile(await db.prepare("SELECT * FROM orders WHERE id='replacement'").first());
    const delivered = await db.prepare("SELECT * FROM orders WHERE id='replacement'").first();
    assert.equal(delivered.status, 'approved');
    assert.ok(delivered.paid_at);
    assert.ok(delivered.delivered_at);
    remote = { order: { id: 43, status: 'cancelado', total_paid: '0.00' } };
    await assert.rejects(reconcile(delivered), /pagamento ou entrega registrados/);
    assert.equal(await db.prepare("SELECT order_id FROM keys WHERE id='k'").first('order_id'), 'replacement');
  } finally { globalThis.fetch = originalFetch; await engine.close(); }
});
