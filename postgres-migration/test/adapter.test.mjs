import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, parameterize } from '../src/adapter.mjs';

test('parameters ignore question marks in SQL literals and comments', () => {
  const query = parameterize("SELECT '?' AS literal, ? AS value, $$?$$ AS body -- ?\n/* ? */", ['secret']);
  assert.equal(query.text, "SELECT '?' AS literal, $1 AS value, $$?$$ AS body -- ?\n/* ? */");
  assert.deepEqual(query.values, ['secret']);
  assert.throws(() => parameterize('SELECT ?', []));
});

test('numeric aggregates and millisecond timestamps preserve API types', async () => {
  const db = createDatabase({ query: async () => ({ rows: [{ n: '2', created_at: '1791936000000', code: '00123' }], fields: [
    { name: 'n', dataTypeID: 20 }, { name: 'created_at', dataTypeID: 20 }, { name: 'code', dataTypeID: 25 }
  ], rowCount: 1 }) });
  assert.deepEqual(await db.prepare('SELECT COUNT(*) n').first(), { n: 2, created_at: 1791936000000, code: '00123' });
});

test('empty first result is null', async () => {
  const db = createDatabase({ query: async () => ({ rows: [], fields: [], rowCount: 0 }) });
  assert.equal(await db.prepare('SELECT 1').first(), null);
});

test('failed batch rolls back and releases the same connection', async () => {
  const calls = [];
  const client = {
    async query(query) {
      calls.push(typeof query === 'string' ? query : query.text);
      if (query.text === 'INSERT bad') throw new Error('failure');
      return { rows: [], fields: [], rowCount: 1 };
    },
    release() { calls.push('RELEASE'); }
  };
  const db = createDatabase({ connect: async () => client });
  await assert.rejects(db.batch([db.prepare('INSERT good'), db.prepare('INSERT bad')]), /failure/);
  assert.deepEqual(calls, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'SELECT pg_advisory_xact_lock(1768842616, 1)', 'INSERT good', 'INSERT bad', 'ROLLBACK', 'RELEASE']);
});

test('individual writes also acquire the inventory lock', async () => {
  const calls = [];
  const client = { query: async query => {
    calls.push(typeof query === 'string' ? query : query.text);
    return { rows: [], fields: [], rowCount: 1 };
  }, release() { calls.push('RELEASE'); } };
  const db = createDatabase({ connect: async () => client });
  assert.equal((await db.prepare('UPDATE keys SET order_id=?').bind('order').run()).meta.changes, 1);
  assert.deepEqual(calls, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'SELECT pg_advisory_xact_lock(1768842616, 1)', 'UPDATE keys SET order_id=$1', 'COMMIT', 'RELEASE']);
});
