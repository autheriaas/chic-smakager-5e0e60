/** Admin login. Requires ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET
 * in the Netlify environment. No built-in credentials are accepted. */

var { corsHeaders } = require("./admin-check");

const crypto = require("crypto");

const SESSION_HOURS = 12;

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length so failed attempts on a
    // wrong-length guess take the same time as a right-length one.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function signSession(secret) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + sig;
}

exports.handler = async function (event) {
  const headers = corsHeaders(event, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST." }) };
  }

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!adminUser || !adminPass || !sessionSecret) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Admin is not configured." }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request." }) };
  }

  const userOk = timingSafeEqualStr(body.username || "", adminUser);
  const passOk = timingSafeEqualStr(body.password || "", adminPass);

  if (!userOk || !passOk) {
    // Deliberately vague about *which* field was wrong — never confirms a
    // typo'd username is real, so it can't be used to guess valid logins.
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Wrong attempt — check your username and password." }) };
  }

  const token = signSession(sessionSecret);
  // The "Secure" attribute tells the browser to withhold the cookie on any
  // non-HTTPS request. That's the right call in production, but it also
  // means the cookie silently never gets stored while testing over plain
  // http:// (e.g. `netlify dev`'s default local server, or a custom domain
  // before SSL is provisioned) — login would report success and then the
  // very next request back to the dashboard would find no cookie at all,
  // bouncing straight back to the login page. Only add "Secure" when the
  // request actually arrived over https, so local/plain-http testing keeps
  // working while production (always https on Netlify) is unaffected.
  const proto = (event.headers && (event.headers["x-forwarded-proto"] || event.headers["X-Forwarded-Proto"])) || "https";
  const isHttps = proto.split(",")[0].trim() === "https";
  const cookieParts = [
    `admin_session=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_HOURS * 3600}`,
  ];
  if (isHttps) cookieParts.splice(1, 0, "Secure");
  const cookie = cookieParts.join("; ");

  return {
    statusCode: 200,
    headers: { ...headers, "Set-Cookie": cookie },
    body: JSON.stringify({ status: "ok" }),
  };
};
