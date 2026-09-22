/** Admin operation. Requires SESSION_SECRET and ADMIN_DELETE_SECRET in Netlify.
 * ADMIN_DELETE_SECRET must match the Apps Script ADMIN_SECRET property. */

const { verifySession, parseCookies, corsHeaders } = require("./admin-check");

const SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwNp6z4T4IK0rc4pDov04K_e34LGcBSRyInJakBvnW5J8_N0YDDqU6dahdMqWWXX-f3/exec";

const UPSTREAM_TIMEOUT_MS = 10000;

exports.handler = async function (event) {
  const headers = corsHeaders(event, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST." }) };
  }

  if (!process.env.SESSION_SECRET || !process.env.ADMIN_DELETE_SECRET) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Admin is not configured." }) };
  }

  const cookies = parseCookies(event.headers.cookie);
  if (!verifySession(cookies.admin_session, process.env.SESSION_SECRET)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Not logged in." }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request." }) };
  }
  if (!body.id || !body.status) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id or status." }) };
  }

  const secret = process.env.ADMIN_DELETE_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(SHEET_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ action: "adminUpdateStatus", id: body.id, status: body.status, secret: secret }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (data.status !== "ok") {
      return { statusCode: 502, headers, body: JSON.stringify({ error: data.message || "Sheet backend refused the update." }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };
  } catch (err) {
    clearTimeout(timeout);
    console.error("admin-update-order error", err);
    const timedOut = err && err.name === "AbortError";
    return { statusCode: 502, headers, body: JSON.stringify({ error: timedOut ? "The order server took too long to respond." : "Could not reach the order server." }) };
  }
};
