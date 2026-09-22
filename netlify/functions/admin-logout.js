/**
 * Netlify Function — admin logout
 * Lives at: /.netlify/functions/admin-logout
 * Clears the admin_session cookie set by admin-login.
 */

const { corsHeaders } = require("./admin-check");

exports.handler = async function (event) {
  const headers = corsHeaders(event, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  const cookie = "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";

  return {
    statusCode: 200,
    headers: { ...headers, "Set-Cookie": cookie },
    body: JSON.stringify({ status: "ok" }),
  };
};
