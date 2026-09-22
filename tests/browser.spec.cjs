const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const { backend } = require('./sheets-mock.cjs');
const orders = require('../netlify/functions/orders').handler;
const reviews = require('../netlify/functions/reviews').handler;

async function fixture(page) {
  const b = backend(); b.setup();
  Object.assign(process.env, { APPS_SCRIPT_URL: 'https://script.google.com/macros/s/test/exec', SITE_URL: 'https://example.test', BACKEND_SECRET: b.properties.get('BACKEND_SECRET') });
  const state = { b, loseNextResponse: false, loseNextRecoveryResponse: false, requests: [], reviewDelayMs: 0 };
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/.netlify/functions/')) return route.continue();
    if (url.pathname.endsWith('/chat')) return route.fulfill({ status: 503, json: { error: 'Test environment' } });
    if (url.pathname.endsWith('/reviews') && req.method() === 'GET' && state.reviewDelayMs) await new Promise(resolve => setTimeout(resolve, state.reviewDelayMs));
    const original = global.fetch;
    global.fetch = async (_url, options) => {
      const data = JSON.parse(options.body);
      return { ok: true, json: async () => b.post(data.action, data) };
    };
    try {
      const body = req.postData();
      if (body) state.requests.push(JSON.parse(body));
      const handler = url.pathname.endsWith('/orders') ? orders : reviews;
      const result = await handler({ httpMethod: req.method(), headers: { 'x-nf-client-connection-ip': '192.0.2.20' }, body });
      if (state.loseNextRecoveryResponse && body && JSON.parse(body).action === 'recover') {
        state.loseNextRecoveryResponse = false;
        return route.fulfill({ status: 502, json: { error: 'Confirmation was lost. Check your email before retrying.' } });
      }
      if (state.loseNextResponse && body && JSON.parse(body).action === 'create') {
        state.loseNextResponse = false;
        return route.fulfill({ status: 502, json: { error: 'Connection interrupted. Retry with the same details.' } });
      }
      return route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
    } finally { global.fetch = original; }
  });
  return state;
}
async function fillCommission(page) {
  await page.goto('/');
  await page.getByLabel('Your name', { exact: true }).fill('Test Client');
  await page.getByLabel('Your email', { exact: true }).fill('client@example.test');
  await page.getByLabel('Character description').fill('A blue character portrait.');
  await page.locator('#terms-checkbox').check();
}
test('submit, retry after lost response, then view and refresh only public order details', async ({ page }) => {
  const state = await fixture(page), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  state.loseNextResponse = true;
  await fillCommission(page);
  await page.getByRole('button', { name: 'Send commission request' }).click();
  await expect(page.locator('#commission-result')).toContainText('Connection interrupted');
  await expect(page.locator('#commission-name')).toHaveValue('Test Client');
  await page.getByRole('button', { name: 'Send commission request' }).click();
  await expect(page.locator('#commission-result')).toContainText('is saved');
  expect(state.b.records('Orders')).toHaveLength(1);
  const creates = state.requests.filter(r => r.action === 'create');
  expect(creates[0].requestId).toBe(creates[1].requestId);
  const token = state.b.mail[0].body.match(/#token=([\w-]+)/)[1];
  await page.goto('/track.html#token=' + token);
  await expect(page.locator('link[rel="icon"][href="/assets/meta/favicon.ico"]')).toHaveCount(1);
  await expect(page.locator('.site-header .logo')).toHaveAttribute('href', '/');
  await expect(page.locator('.nav-links a')).toHaveCount(4);
  await expect(page.locator('footer a[href="/terms.html"]')).toHaveCount(1);
  await expect(page.locator('#order-number')).toHaveText('ART-00001');
  expect(page.url()).not.toContain(token);
  state.b.set('Orders', 0, 'Status', 'In progress');
  state.b.set('Orders', 0, 'ClientMessage', 'Your sketch is ready! <img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.locator('#order-status')).toHaveText('In progress');
  await expect(page.locator('#order-message')).toContainText('<img');
  await expect(page.locator('#order-message img')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('client@example.test');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'reports/tracking-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-menu')).toHaveClass(/open/);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-menu')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'reports/tracking-mobile.png', fullPage: true });
});
test('recovery requires confirmation, rotates access and preserves the save link', async ({ page }) => {
  const { b, requests } = await fixture(page);
  await fillCommission(page);
  await page.getByRole('button', { name: 'Send commission request' }).click();
  await expect(page.locator('#commission-result')).toContainText('is saved');
  const oldToken = b.mail[0].body.match(/#token=([\w-]+)/)[1];
  await page.goto('/track.html');
  await page.getByLabel('Your email').fill('client@example.test');
  await page.getByRole('button', { name: 'Send recovery email' }).click();
  await expect(page.locator('#recovery-status')).toContainText('If there are orders');
  b.ctx.processRecoveryQueue();
  const recovery = b.mail.at(-1).body.match(/#recover=([\w-]+)/)[1];
  await page.goto('/track.html#recover=' + recovery);
  await expect(page.getByRole('button', { name: 'Confirm recovery' })).toBeVisible();
  expect(requests.filter(r => r.action === 'confirm')).toHaveLength(0);
  expect(b.post('trackOrder', { tokenHash: b.hash(oldToken) }).status).toBe('ok');
  await page.getByRole('button', { name: 'Confirm recovery' }).click();
  await expect(page.locator('#order-card')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Save this tracking link' })).toHaveAttribute('href', /#token=/);
  expect(b.post('trackOrder', { tokenHash: b.hash(oldToken) }).code).toBe(404);
  await page.goto('/track.html#recover=' + recovery);
  await page.getByRole('button', { name: 'Confirm recovery' }).click();
  await expect(page.locator('#tracking-status')).toContainText('invalid or expired');
});
test('mail failure does not ask for a duplicate order; invalid links show recovery', async ({ page }) => {
  const { b } = await fixture(page); b.setMailFails(true);
  await fillCommission(page);
  await page.getByRole('button', { name: 'Send commission request' }).click();
  await expect(page.locator('#commission-result')).toContainText('do not submit it again');
  expect(b.records('Orders')).toHaveLength(1);
  await page.goto('/track.html#token=' + crypto.randomBytes(32).toString('base64url'));
  await expect(page.locator('#tracking-status')).toContainText('invalid or expired');
  await expect(page.locator('#order-card')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Send recovery email' })).toBeVisible();
});

test('existing reviews load even when Google takes longer than the old eight-second timeout', async ({ page }) => {
  const state = await fixture(page);
  state.b.post('createReview', { requestId: crypto.randomUUID(), name: 'Existing Client', rating: 5, text: 'A review already saved in the sheet.' });
  state.reviewDelayMs = 9000;
  await page.goto('/');
  await expect(page.locator('#reviews-status')).toContainText('Loading reviews');
  await expect(page.locator('#reviews-empty')).toBeHidden();
  await expect(page.locator('#reviews-list')).toContainText('A review already saved in the sheet.', { timeout: 15000 });
  await expect(page.locator('#reviews-status')).toBeEmpty();
});
test('recovery retries reuse the same request after the queue accepted it but the response was lost', async ({ page }) => {
  const state=await fixture(page);
  state.loseNextRecoveryResponse=true;
  await page.goto('/track.html');
  await page.getByLabel('Your email').fill('client@example.test');
  await page.getByRole('button',{name:'Send recovery email'}).click();
  await expect(page.locator('#recovery-status')).toContainText('Confirmation was lost');
  await page.getByRole('button',{name:'Send recovery email'}).click();
  await expect(page.locator('#recovery-status')).toContainText('If there are orders');
  const attempts=state.requests.filter(r=>r.action==='recover');
  expect(attempts).toHaveLength(2); expect(attempts[0].requestId).toBe(attempts[1].requestId);
  expect(state.b.records('_RecoveryQueue')).toHaveLength(1);
});
