/**
 * Netlify Function — public reviews + rating stats (cached)
 * -------------------------------------------------------------
 * Lives at: /.netlify/functions/reviews
 *
 * WHY THIS EXISTS:
 * Both the homepage and the admin dashboard used to call the Apps Script
 * web app directly from the browser for this data. Apps Script is not
 * fast (cold starts routinely add 1-3+ seconds), and every single visitor
 * was paying that cost on every page load.
 *
 * This function sits in front of Apps Script and tells Netlify's CDN to
 * cache the response for a short window. The FIRST visitor after the
 * cache expires still pays the Apps Script round trip; everyone else
 * within that window gets served instantly from the edge, and the cache
 * quietly refreshes in the background (stale-while-revalidate) so nobody
 * is ever stuck waiting on a slow re-fetch.
 *
 * A new rating or review is still visible within the cache window (a few
 * seconds) — see MAX_AGE_SECONDS below. Lower it if you want fresher
 * numbers at the cost of more Apps Script traffic; raise it for more
 * speed. Apps Script also caches this same payload on its side (see
 * STATS_CACHE_SECONDS in Code.gs), so even an uncached hit here is
 * usually fast.
 */

const SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwNp6z4T4IK0rc4pDov04K_e34LGcBSRyInJakBvnW5J8_N0YDDqU6dahdMqWWXX-f3/exec";

const MAX_AGE_SECONDS = 20;
const STALE_WHILE_REVALIDATE_SECONDS = 300;
const UPSTREAM_TIMEOUT_MS = 8000;

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=${MAX_AGE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(SHEET_ENDPOINT, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => null);
    if (!data) {
      return { statusCode: 502, headers: { ...headers, "Cache-Control": "no-store" }, body: JSON.stringify({ error: "Sheet backend returned something unexpected." }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    clearTimeout(timeout);
    console.error("reviews proxy error", err);
    // Don't let Netlify's CDN cache an error response.
    return {
      statusCode: 502,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Could not reach the review server." }),
    };
  }
};
