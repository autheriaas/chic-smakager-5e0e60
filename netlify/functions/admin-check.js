/**
 * Netlify Function — admin session check
 * Lives at: /.netlify/functions/admin-check
 * The admin dashboard calls this on load. Returns { ok: true } if the
 * browser's admin_session cookie is present, correctly signed, and not
 * expired — otherwise { ok: false }, and the dashboard sends the visitor
 * back to the login page.
 */

const crypto = require("crypto");


function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

/**
 * Builds CORS headers for the admin endpoints. These all read/write an
 * httpOnly cookie, which browsers only forward for credentialed requests
 * (`credentials: 'include'`) — and per the CORS spec, a credentialed
 * request is REFUSED by the browser if the server answers with a
 * wildcard `Access-Control-Allow-Origin: *`. Every admin function here
 * used to send that exact combination, which is silently invalid: it
 * happened to still "work" only because the admin dashboard calls these
 * from the same origin (where CORS doesn't apply at all), but it would
 * quietly break the moment the dashboard was ever called cross-origin.
 * Reflecting the actual request Origin is the standard, correct fix.
 */
function corsHeaders(event, extra) {
  const origin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || "";
  var headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return Object.assign(headers, extra || {});
}

function verifySession(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch (err) {
    return false;
  }
}

exports.handler = async function (event) {
  const headers = corsHeaders(event);

  if (!process.env.SESSION_SECRET) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Admin is not configured." }) };
  }

  const cookies = parseCookies(event.headers.cookie);
  const ok = verifySession(cookies.admin_session, process.env.SESSION_SECRET);

  return { statusCode: 200, headers, body: JSON.stringify({ ok }) };
};

module.exports.verifySession = verifySession;
module.exports.parseCookies = parseCookies;
module.exports.corsHeaders = corsHeaders;
