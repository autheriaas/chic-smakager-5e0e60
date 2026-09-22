const { createHash, createHmac, randomBytes, randomUUID } = require('node:crypto');
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('base64url');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const types = ['PFP / Banner', '3D Model', 'Streaming Assets / Emotes', 'Character Art', 'Animation', 'Couple Art'];
function config() {
  const { APPS_SCRIPT_URL: endpoint, BACKEND_SECRET: secret, SITE_URL: site } = process.env;
  if (!endpoint || !secret || secret.length < 32 || !site) throw new HttpError(503, 'Service is not configured. Please contact Claudia.');
  let url, siteUrl;
  try { url = new URL(endpoint); siteUrl = new URL(site); } catch { throw new HttpError(503, 'Service is not configured.'); }
  if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) || url.search || url.hash ||
      siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password || siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash) throw new HttpError(503, 'Service is not configured.');
  return { endpoint, secret, site: siteUrl.origin };
}
function text(value, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new HttpError(400, 'Check the form fields.');
  return value.trim();
}
function email(value) {
  const result = text(value, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Enter a valid email address.');
  return result;
}
function requestId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) throw new HttpError(400, 'Invalid request identifier. Reload the page.');
  return value;
}
function token(value) {
  if (typeof value !== 'string' || !tokenPattern.test(value)) throw new HttpError(404, 'This link is invalid or expired.');
  return value;
}
function body(event) {
  if (event.isBase64Encoded || !event.body || Buffer.byteLength(event.body) > 16000) throw new HttpError(400, 'Invalid request.');
  try {
    const data = JSON.parse(event.body);
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch { throw new HttpError(400, 'Invalid request.'); }
}
function response(statusCode, data, extra = {}) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...extra }, body: JSON.stringify(data) };
}
function guard(event, methods) {
  if (!methods.includes(event.httpMethod)) throw new HttpError(405, 'Method not allowed.');
  if (event.headers?.['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Request not allowed.');
}
async function upstream(action, data, event) {
  const c = config();
  // Netlify supplies this header; X-Forwarded-For is not trusted.
  const clientKey = hash(hmac(c.secret, 'ip:' + (event.headers?.['x-nf-client-connection-ip'] || 'local')));
  const started = Date.now();
  function upstreamError(status, code, message) {
    // Safe diagnostics only: never include URLs, request bodies, tokens or email.
    console.warn('[backend]', JSON.stringify({ action, code, elapsedMs: Date.now() - started }));
    return new HttpError(status, message, code);
  }
  let res, result;
  try {
    res = await fetch(c.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...data, action, secret: c.secret, clientKey }),
      signal: AbortSignal.timeout(50000), redirect: 'follow',
    });
    if (!res.ok) throw upstreamError(502, 'UPSTREAM_HTTP_ERROR', 'The service could not confirm the request. Please try again later.');
    try { result = await res.json(); }
    catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
      throw upstreamError(502, 'UPSTREAM_NON_JSON', 'The Google service returned an unexpected response. Check the web app deployment and its access settings.');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw upstreamError(504, 'UPSTREAM_TIMEOUT', 'The Google service took too long to confirm the request. It may still have been received. Please wait before trying again.');
    throw upstreamError(502, 'UPSTREAM_NETWORK_ERROR', 'Could not connect to the Google service. Please try again later.');
  }
  if (result?.status !== 'ok') {
    const diagnostics = {
      SECRET_MISSING: 'The Google backend secret is missing or invalid.',
      SETUP_REQUIRED: 'The Google backend needs setup() to be run.',
      SHEET_ID_MISSING: 'The Google backend has no spreadsheet configured. Run setup() again.',
      SHEET_ACCESS_FAILED: 'The Google backend cannot open the configured spreadsheet. Check deployment permissions and run diagnoseSetup().',
      BACKEND_BUSY: 'The spreadsheet is busy. Please try again shortly.',
      BACKEND_ERROR: 'The Google backend could not complete the operation. Run diagnoseSetup() and check the published version.',
    };
    if (result?.code === 503 && diagnostics[result.reason]) throw upstreamError(503, result.reason, diagnostics[result.reason]);
    if (result?.code === 403) throw upstreamError(502, 'UPSTREAM_AUTH_REJECTED', 'The Google backend rejected authentication. Check that BACKEND_SECRET matches in both environments.');
    const code = [400, 404, 409, 429, 503].includes(result?.code) ? result.code : 502;
    throw new HttpError(code, ({400:'Check the form fields.',404:'This link is invalid or expired.',409:'This request has already been used with different details.',429:'Too many requests. Please try again later.',503:'Service temporarily unavailable.'})[code] || 'The service could not confirm the request. Please retry.');
  }
  return result;
}
function failure(error) {
  // Do not log upstream URLs, request bodies, email addresses or tokens.
  return response(error instanceof HttpError ? error.status : 502, { error: error instanceof HttpError ? error.message : 'The service could not confirm the request. Please retry.', ...(error instanceof HttpError && error.code ? { code: error.code } : {}) });
}
module.exports = { HttpError, hash, hmac, randomBytes, randomUUID, types, config, text, email, requestId, token, body, response, guard, upstream, failure };
