import test from "node:test";
import assert from "node:assert/strict";
import { createD1HttpDatabase } from "../lib/d1-http.mjs";

const config = () => ({ accountId: "account", databaseId: "database", token: "secret-token" });
const result = results => ({ success: true, results, meta: { changes: 1 } });
const response = results => Response.json({ success: true, result: results });

test("D1 binds values separately and reads rows and columns", async () => {
  const calls = [];
  const db = createD1HttpDatabase(config, async (url, options) => {
    calls.push({ url, ...options });
    return response([result([{ id: "key-1", price: 100 }])]);
  });
  const statement = db.prepare("SELECT * FROM products WHERE id=?");
  assert.deepEqual(await statement.bind("key-1").first(), { id: "key-1", price: 100 });
  assert.equal(await statement.bind("key-1").first("price"), 100);
  assert.deepEqual(JSON.parse(calls[0].body), { batch: [{ sql: statement.sql, params: ["key-1"] }] });
  assert.equal(calls[0].headers.Authorization, "Bearer secret-token");
  assert.match(calls[0].url, /^https:\/\/api.cloudflare.com\/client\/v4\/accounts\/account\/d1\/database\/database\/query$/);
  assert.deepEqual(statement.params, []);
});

test("D1 sends the whole reservation batch in a single request", async () => {
  const calls = [];
  const db = createD1HttpDatabase(config, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return response([result([]), result([])]);
  });
  const statements = [db.prepare("INSERT INTO orders(id) VALUES(?)").bind("order-1"), db.prepare("UPDATE keys SET order_id=? WHERE id=?").bind("order-1", "key-1")];
  assert.equal((await db.batch(statements)).length, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].batch.map(s => s.params), [["order-1"], ["order-1", "key-1"]]);
  assert.deepEqual(await db.batch([]), []);
  assert.equal(calls.length, 1);
});

test("D1 handles empty results and raw rows", async () => {
  let rows = [];
  const db = createD1HttpDatabase(config, async () => response([result(rows)]));
  assert.equal(await db.prepare("SELECT id FROM products").first(), null);
  rows = [{ id: "key-1", price: 100 }];
  assert.deepEqual(await db.prepare("SELECT id, price FROM products").raw({ columnNames: true }), [["id", "price"], ["key-1", 100]]);
});

test("D1 fails before network access without credentials", async () => {
  const db = createD1HttpDatabase(() => ({}), () => assert.fail("must not fetch"));
  await assert.rejects(db.prepare("SELECT 1").all(), /CLOUDFLARE_D1_API_TOKEN/);
});

test("D1 propagates failures without leaking provider details or retrying writes", async () => {
  for (const reply of [
    () => Response.json({ success: false, errors: [{ message: "secret-token" }] }, { status: 403 }),
    () => response([{ success: false, error: "secret-token" }]),
    () => response([]),
  ]) {
    let calls = 0;
    const db = createD1HttpDatabase(config, async () => { calls++; return reply(); });
    await assert.rejects(db.prepare("UPDATE keys SET order_id=?").bind("order-1").run(), error => !error.message.includes("secret-token") && /Falha/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("D1 rejects statements from a different database", async () => {
  const db = createD1HttpDatabase(config, () => assert.fail("must not fetch"));
  const other = createD1HttpDatabase(config);
  await assert.rejects(db.batch([other.prepare("SELECT 1")]), /outro banco/);
});
