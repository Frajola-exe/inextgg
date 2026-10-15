import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.__appmaxTestEnv = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-test-key', SITE_URL: 'https://store.test', ADMIN_EMAILS: ' Admin@example.com ' };
globalThis.__appmaxTestUser = null;
const auth = await import('../lib/auth.ts');
const paths = await import('../lib/auth-path.ts');
const route = await import('../app/api/auth/[action]/route.ts');
const server = await import('../lib/server.ts');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function setup({ confirmed = true, email = 'buyer@example.com', status = 200 } = {}) {
 globalThis.__authCookies = new Map(); globalThis.__authCookieWrites = [];
 globalThis.__appmaxTestUser = null;
 const calls = [];
 const user = { id: 'user-id', email, ...(confirmed ? { email_confirmed_at: '2026-10-15' } : {}), user_metadata: { name: 'Ana', role: 'admin', isAdmin: true } };
 globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  if (status !== 200) return Response.json({ code: 'invalid_credentials' }, { status });
  if (url.includes('/user')) return Response.json(user);
  if (url.includes('/logout')) return new Response(null, { status: 204 });
  if (url.includes('/signup')) return Response.json({ user });
  return Response.json({ access_token: 'verified-access', refresh_token: 'rotated-refresh', expires_in: 3600, user });
 };
 const post = (action, body = {}, origin = 'https://store.test') => route.POST(new Request(`https://store.test/api/auth/${action}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ action }) });
 return { post, calls, user };
}

test('signup sends only allowed data, requires confirmation, returns no tokens or admin claims', async () => {
 const { post, calls } = setup();
 const response = await post('signup', { name: 'Ana Silva', email: ' Admin@Example.com ', password: 'long-password-123', isAdmin: true });
 assert.equal(response.status, 200);
 assert.match((await response.json()).message, /confirmação/);
 const payload = JSON.parse(calls[0].options.body);
 assert.deepEqual(payload, { email: 'admin@example.com', password: 'long-password-123', data: { name: 'Ana Silva' } });
 assert.equal(globalThis.__authCookieWrites.length, 0);
 assert.ok(calls[0].url.includes(encodeURIComponent('https://store.test/entrar')));
});

test('signup rejects weak passwords, malformed email, and empty names before provider calls', async () => {
 const { post, calls } = setup();
 for (const body of [{ name: 'Ana', email: 'a@b.com', password: 'short' }, { name: 'Ana', email: 'invalid', password: 'long-password' }, { email: 'a@b.com', password: 'long-password' }]) assert.equal((await post('signup', body)).status, 400);
 assert.equal(calls.length, 0);
});

test('login verifies the token server-side and stores tokens only in HttpOnly cookies', async () => {
 const { post, calls } = setup();
 const response = await post('login', { email: 'buyer@example.com', password: 'password' });
 assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
 assert.equal(response.headers.get('cache-control'), 'private, no-store');
 assert.ok(calls[1].url.endsWith('/user'));
 assert.equal(globalThis.__authCookieWrites.length, 2);
 for (const write of globalThis.__authCookieWrites) { assert.equal(write.options.httpOnly, true); assert.equal(write.options.sameSite, 'lax'); }
 const user = await auth.currentUser();
 assert.equal(user.userId, 'supabase:user-id');
 assert.equal(auth.isAdmin(user), false); // Editable metadata cannot grant admin.
 await assert.rejects(server.identity(true), /FORBIDDEN/);
});

test('unconfirmed email cannot log in or gain admin access', async () => {
 const { post } = setup({ confirmed: false, email: 'admin@example.com' });
 assert.equal((await post('login', { email: 'admin@example.com', password: 'password' })).status, 401);
 assert.equal(globalThis.__authCookieWrites.length, 0);
 globalThis.__authCookies.set('inext-access', 'unconfirmed');
 assert.equal(await auth.currentUser(), null);
 await assert.rejects(server.identity(true), /AUTH/);
});

test('confirmed allowlisted email gets admin; forged access token is rejected', async () => {
 const { post } = setup({ email: 'admin@example.com' });
 await post('login', { email: 'admin@example.com', password: 'password' });
 assert.equal(auth.isAdmin(await server.identity(true)), true);
 globalThis.__authCookies.set('inext-access', 'forged'); globalThis.__authCookies.delete('inext-refresh');
 globalThis.fetch = async () => Response.json({}, { status: 401 });
 assert.equal(await auth.currentUser(), null);
 assert.equal(globalThis.__authCookies.size, 0);
});

test('expired access refreshes the session, verifies the user and rotates both cookies', async () => {
 const { user, calls } = setup();
 const goodFetch = globalThis.fetch;
 globalThis.__authCookies.set('inext-access', 'expired'); globalThis.__authCookies.set('inext-refresh', 'old-refresh');
 globalThis.fetch = async (url, options) => options.headers.Authorization === 'Bearer expired' ? Response.json({}, { status: 401 }) : goodFetch(url, options);
 assert.equal((await auth.currentUser()).email, user.email);
 assert.equal(globalThis.__authCookies.get('inext-refresh'), 'rotated-refresh');
 assert.ok(calls.some(call => call.url.endsWith('token?grant_type=refresh_token')));
});

test('logout revokes provider session, clears cookies, and removes identity', async () => {
 const { post, calls } = setup();
 await post('login', { email: 'buyer@example.com', password: 'password' });
 assert.equal((await post('logout')).status, 200);
 assert.ok(calls.some(call => call.url.endsWith('/logout')));
 assert.equal(globalThis.__authCookies.size, 0); assert.equal(await auth.currentUser(), null);
});

test('logout also revokes a session whose access cookie has expired', async () => {
 const { post, calls } = setup();
 globalThis.__authCookies.set('inext-refresh', 'old-refresh');
 assert.equal((await post('logout')).status, 200);
 assert.ok(calls.some(call => call.url.endsWith('token?grant_type=refresh_token')));
 assert.ok(calls.some(call => call.url.endsWith('/logout') && call.options.headers.Authorization === 'Bearer verified-access'));
 assert.equal(globalThis.__authCookies.size, 0);
});

test('store sends no admin access for guests or ordinary users, and marks only allowlisted accounts', async () => {
 setup();
 const store = await import('../app/api/store/route.ts');
 globalThis.__appmaxTestEnv.DB = { prepare: () => ({ all: async () => ({ results: [] }), first: async () => null }) };
 for (const [user, expected] of [[null, null], [{ userId: 'buyer', email: 'buyer@example.com', isAdmin: true }, false], [{ userId: 'admin', email: 'admin@example.com' }, true]]) {
  globalThis.__appmaxTestUser = user;
  const response = await store.GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.json();
  if (expected === null) assert.equal(result.user, null);
  else assert.equal(result.user.isAdmin, expected);
 }
});

test('cross-origin mutations are rejected before contacting provider', async () => {
 const { post, calls } = setup();
 for (const action of ['signup', 'login', 'logout']) assert.equal((await post(action, {}, 'https://evil.test')).status, 403);
 assert.equal(calls.length, 0);
});

test('provider failures fail closed without leaking provider details', async () => {
 const { post } = setup({ status: 429 });
 assert.equal((await post('login', { email: 'buyer@example.com', password: 'password' })).status, 429);
 globalThis.fetch = async () => { throw new Error('secret provider configuration'); };
 const response = await post('login', { email: 'buyer@example.com', password: 'password' });
 assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /secret/);
 assert.equal(globalThis.__authCookieWrites.length, 0);
});

test('Sites identity remains supported and return paths cannot redirect off-site or loop through auth', async () => {
 setup(); globalThis.__appmaxTestUser = { userId: 'sites-user', email: 'admin@example.com' };
 assert.equal(auth.isAdmin(await auth.currentUser()), true);
 for (const path of ['//evil.test', '/\\evil.test', 'https://evil.test', '/entrar', '/api/auth/logout']) assert.equal(paths.safeReturnTo(path), '/');
 assert.equal(paths.safeReturnTo('/admin'), '/admin');
 assert.equal(paths.safeReturnTo('/jogo/game?ref=home#details'), '/jogo/game?ref=home#details');
});
