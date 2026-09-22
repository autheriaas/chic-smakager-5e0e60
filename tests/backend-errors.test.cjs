const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../server/backend');

test('upstream failures distinguish timeout, transport, invalid response and authentication without logging payloads', async () => {
  const originalEnv = { ...process.env }, originalFetch = global.fetch, originalWarn = console.warn;
  const logs = [];
  Object.assign(process.env, { APPS_SCRIPT_URL: 'https://script.google.com/macros/s/test/exec', BACKEND_SECRET: 'test-only-secret-not-for-production-1234', SITE_URL: 'https://example.test' });
  console.warn = (...args) => logs.push(args.join(' '));
  const event = { headers: {} };
  async function check(fetch, status, code) {
    global.fetch = fetch;
    try { await b.upstream('queueRecovery', { email: 'private@example.test', token: 'private-test-token' }, event); assert.fail('Expected rejection'); }
    catch (error) { const response = b.failure(error); assert.equal(response.statusCode, status); assert.equal(JSON.parse(response.body).code, code); }
  }
  try {
    await check(async () => { throw new DOMException('private-test-token', 'TimeoutError'); }, 504, 'UPSTREAM_TIMEOUT');
    await check(async () => { throw new TypeError('private@example.test'); }, 502, 'UPSTREAM_NETWORK_ERROR');
    await check(async () => ({ ok: true, json: async () => { throw new SyntaxError('private-test-token'); } }), 502, 'UPSTREAM_NON_JSON');
    await check(async () => ({ ok: true, json: async () => ({ status: 'error', code: 403 }) }), 502, 'UPSTREAM_AUTH_REJECTED');
    await check(async () => ({ ok: true, json: async () => ({ status: 'error', code: 503, reason: 'BACKEND_BUSY' }) }), 503, 'BACKEND_BUSY');
    const output = logs.join('\n');
    for (const value of ['private@example.test', 'private-test-token', process.env.BACKEND_SECRET, process.env.APPS_SCRIPT_URL]) assert(!output.includes(value));
  } finally { process.env = originalEnv; global.fetch = originalFetch; console.warn = originalWarn; }
});
