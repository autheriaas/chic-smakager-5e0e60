/** Admin operation. Requires SESSION_SECRET and ADMIN_DELETE_SECRET in Netlify.
 * ADMIN_DELETE_SECRET must match the Apps Script ADMIN_SECRET property. */

const { verifySession, parseCookies, corsHeaders } = require("./admin-check");

const SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwNp6z4T4IK0rc4pDov04K_e34LGcBSRyInJakBvnW5J8_N0YDDqU6dahdMqWWXX-f3/exec";

const UPSTREAM_TIMEOUT_MS = 10000;

exports.handler = async function (event) {
  const headers = corsHeaders(event);

  if (!process.env.SESSION_SECRET || !process.env.ADMIN_DELETE_SECRET) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Admin is not configured." }) };
  }

  const cookies = parseCookies(event.headers.cookie);
  if (!verifySession(cookies.admin_session, process.env.SESSION_SECRET)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Not logged in." }) };
  }

  const secret = process.env.ADMIN_DELETE_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const url = `${SHEET_ENDPOINT}?action=adminOrders&secret=${encodeURIComponent(secret)}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (data.status !== "ok") {
      return { statusCode: 502, headers, body: JSON.stringify({ error: data.message || "Sheet backend refused the request." }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ orders: data.orders || [] }) };
  } catch (err) {
    clearTimeout(timeout);
    console.error("admin-orders error", err);
    const timedOut = err && err.name === "AbortError";
    return { statusCode: 502, headers, body: JSON.stringify({ error: timedOut ? "The order server took too long to respond." : "Could not reach the order server." }) };
  }
};
