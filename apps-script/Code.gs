/**
 * Claudia's Community — commission form + live ratings & reviews backend.
 *
 * SETUP:
 * 1. Open the Google Sheet your form saves into.
 * 2. Extensions -> Apps Script.
 * 3. Delete whatever is in Code.gs and paste this whole file in.
 * 4. Save, then Deploy -> Manage deployments -> edit (pencil) your existing
 *    web app deployment -> set "Version" to "New version" -> Deploy.
 *    (Reusing the existing deployment keeps the same /exec URL, so you do
 *    NOT need to change SHEET_ENDPOINT in index.html.)
 * 5. First run will ask you to authorize Sheets access — allow it.
 * 6. For the admin "delete feedback" and "manage orders" features to work:
 *    Project Settings (gear icon on the left) -> Script Properties ->
 *    Add property ADMIN_SECRET with a strong secret configured separately.
 *    Set the same value in the Netlify ADMIN_DELETE_SECRET environment variable.
 *    Never put the value in source code or comments.
 *
 * WHAT THIS DOES:
 * - A "Stats" tab is created automatically the first time this runs, holding
 *   RatingSum and RatingCount (both seeded at 0). Open that tab any time and
 *   edit those numbers directly if you ever need to correct them. Both the
 *   quick star-only ratings and full written reviews feed into this same
 *   running average.
 * - A "Ratings" tab logs every star rating submitted (timestamp + value).
 * - A "Reviews" tab logs every written review (timestamp, name, rating,
 *   text, a hidden id used for deleting it later). doGet() returns the
 *   most recent reviews plus the live average, so the homepage's rating
 *   stat and review cards update automatically — no re-deploy needed
 *   after someone submits one.
 * - The commission form's "Reference image URL(s)" field is just stored as
 *   plain text in the sheet — no file uploads or Drive storage involved.
 * - The "Projects delivered" figure on the homepage is a fixed number typed
 *   into index.html, NOT tracked here — edit it there when you want to
 *   change it.
 * - An "Orders" tab is created automatically the first time someone sends
 *   the commission form. Each row gets its own Id and a Status column
 *   ("New" by default). The admin dashboard reads/writes this tab to show
 *   requests and let you move a client's Status along (New -> Contacted ->
 *   In Progress -> Done, or whatever wording you use — the dashboard's
 *   status buttons are just plain text, edit them there if you want
 *   different stage names). You can also edit the Status cell directly in
 *   the sheet at any time; the dashboard just reads whatever's there.
 * - Clients can edit their own already-sent request (from the "Edit your
 *   request" box on the site) using the Request ID they were shown after
 *   submitting, plus the same email they submitted with. Both must match
 *   the row or the edit is refused — this is what keeps one client from
 *   editing someone else's request.
 */

var SEED_RATING_SUM = 0;
var SEED_RATING_COUNT = 0;
var MAX_REVIEWS_RETURNED = 30;
var ORDERS_HEADER = ['Timestamp', 'Id', 'Status', 'Name', 'Email', 'Type', 'Budget', 'Description', 'Reference', 'LastUpdated'];

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {};

  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ status: 'error', message: 'Bad payload' });
  }

  if (data.action === 'rating') {
    recordRating(ss, data.rating);
    return jsonOut({ status: 'ok' });
  }

  if (data.action === 'review') {
    recordReview(ss, data.name, data.rating, data.text);
    return jsonOut({ status: 'ok' });
  }

  if (data.action === 'deleteReview') {
    return handleDeleteReview(ss, data);
  }

  if (data.action === 'updateOrder') {
    return handleUpdateOrder(ss, data);
  }

  if (data.action === 'adminUpdateStatus') {
    return handleAdminUpdateStatus(ss, data);
  }

  // Default: a new commission form submission.
  var sheet = getOrdersSheet(ss);
  var id = Utilities.getUuid();
  var now = new Date();
  sheet.appendRow([
    now,
    id,
    'New',
    data.name || '',
    data.email || '',
    data.type || '',
    data.budget || '',
    data.description || '',
    data.reference || '',
    now
  ]);

  return jsonOut({ status: 'ok', id: id });
}

// How long the public stats+reviews payload is cached inside Apps Script
// itself (CacheService), in seconds. This is what makes repeat homepage
// loads fast: instead of re-reading the Sheet on every single visitor,
// most requests are answered straight from cache. A new rating/review
// invalidates the cache immediately, so nobody ever sees stale data for
// longer than this window even on a slow news day.
var STATS_CACHE_SECONDS = 20;
var STATS_CACHE_KEY = 'public_stats_v1';

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = (e && e.parameter) || {};

  if (params.action === 'getOrder') {
    return handleGetOrder(ss, params);
  }

  if (params.action === 'findOrder') {
    return handleFindOrder(ss, params);
  }

  if (params.action === 'adminOrders') {
    return handleAdminOrders(ss, params);
  }

  // Public stats + reviews — by far the most frequently hit path (every
  // homepage visitor triggers this). Serve from cache when possible.
  var cache = CacheService.getScriptCache();
  var cached = cache.get(STATS_CACHE_KEY);
  if (cached) {
    return jsonOut(JSON.parse(cached));
  }

  var stats = getStatsSheet(ss);
  var sumCount = stats.getRange('B1:B2').getValues()[0]; // one call instead of two
  var ratingSum = sumCount[0];
  var ratingCount = sumCount[1];
  var avgRating = ratingCount > 0 ? (ratingSum / ratingCount) : 0;

  var payload = {
    avgRating: Math.round(avgRating * 10) / 10,
    ratingCount: ratingCount,
    reviews: getRecentReviews(ss)
  };
  cache.put(STATS_CACHE_KEY, JSON.stringify(payload), STATS_CACHE_SECONDS);
  return jsonOut(payload);
}

/** Call this any time the Stats or Reviews tab changes, so the next
 *  doGet() doesn't serve a stale cached snapshot for the rest of the
 *  cache window. */
function invalidateStatsCache() {
  CacheService.getScriptCache().remove(STATS_CACHE_KEY);
}

/** Gets (or creates) the dedicated "Orders" tab for commission requests. */
function getOrdersSheet(ss) {
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) {
    sheet = ss.insertSheet('Orders');
    sheet.appendRow(ORDERS_HEADER);
    sheet.getRange(1, 1, 1, ORDERS_HEADER.length).setFontWeight('bold');
  }
  return sheet;
}

/** Finds the Orders row index (1-based, includes header) for a given id. Returns -1 if not found. */
function findOrderRow(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return -1;
  var numRows = sheet.getLastRow() - 1;
  var ids = sheet.getRange(2, 2, numRows, 1).getValues(); // column B = Id
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

/**
 * A CLIENT editing their own already-sent request. Requires both the id
 * AND the email on file to match, so someone can't edit a stranger's
 * request just by guessing/finding an id.
 */
function handleUpdateOrder(ss, data) {
  if (!data.id || !data.email) {
    return jsonOut({ status: 'error', message: 'Missing id or email' });
  }
  var sheet = getOrdersSheet(ss);
  var row = findOrderRow(sheet, data.id);
  if (row === -1) {
    return jsonOut({ status: 'error', message: 'Request not found \u2014 double check the request ID' });
  }
  var onFileEmail = String(sheet.getRange(row, 5).getValue() || '').toLowerCase().trim();
  if (onFileEmail !== String(data.email).toLowerCase().trim()) {
    return jsonOut({ status: 'error', message: 'That email doesn\u2019t match this request' });
  }

  sheet.getRange(row, 4).setValue(data.name || '');
  sheet.getRange(row, 6).setValue(data.type || '');
  sheet.getRange(row, 7).setValue(data.budget || '');
  sheet.getRange(row, 8).setValue(data.description || '');
  sheet.getRange(row, 9).setValue(data.reference || '');
  sheet.getRange(row, 10).setValue(new Date());

  return jsonOut({ status: 'ok' });
}

/** A client looking up their own request (id + email) to prefill the edit form. */
function handleGetOrder(ss, params) {
  var sheet = getOrdersSheet(ss);
  var row = findOrderRow(sheet, params.id);
  if (row === -1) {
    return jsonOut({ status: 'error', message: 'Request not found \u2014 double check the request ID' });
  }
  var onFileEmail = String(sheet.getRange(row, 5).getValue() || '').toLowerCase().trim();
  if (!params.email || onFileEmail !== String(params.email).toLowerCase().trim()) {
    return jsonOut({ status: 'error', message: 'That email doesn\u2019t match this request' });
  }
  var vals = sheet.getRange(row, 1, 1, ORDERS_HEADER.length).getValues()[0];
  return jsonOut({
    status: 'ok',
    order: {
      id: vals[1], statusValue: vals[2], name: vals[3], email: vals[4],
      type: vals[5], budget: vals[6], description: vals[7], reference: vals[8]
    }
  });
}

/**
 * A client who doesn't have their Request ID handy — just their name and
 * email. Finds the MOST RECENT order matching both (case-insensitive), so
 * if the same person has sent more than one request over time, this pulls
 * up the latest one to edit.
 */
function handleFindOrder(ss, params) {
  if (!params.name || !params.email) {
    return jsonOut({ status: 'error', message: 'Enter both your name and email' });
  }
  var sheet = getOrdersSheet(ss);
  if (sheet.getLastRow() < 2) {
    return jsonOut({ status: 'error', message: 'No request found with that name and email' });
  }
  var numRows = sheet.getLastRow() - 1;
  var rows = sheet.getRange(2, 1, numRows, ORDERS_HEADER.length).getValues();
  var wantName = String(params.name).toLowerCase().trim();
  var wantEmail = String(params.email).toLowerCase().trim();
  var match = null;
  for (var i = 0; i < rows.length; i++) {
    var rowName = String(rows[i][3] || '').toLowerCase().trim();
    var rowEmail = String(rows[i][4] || '').toLowerCase().trim();
    if (rowName === wantName && rowEmail === wantEmail) {
      match = rows[i]; // keep looping so the LAST (most recent) match wins
    }
  }
  if (!match) {
    return jsonOut({ status: 'error', message: 'No request found with that name and email \u2014 double check the spelling' });
  }
  return jsonOut({
    status: 'ok',
    order: {
      id: match[1], statusValue: match[2], name: match[3], email: match[4],
      type: match[5], budget: match[6], description: match[7], reference: match[8]
    }
  });
}

/** ADMIN changing an order's status. Requires the shared ADMIN_SECRET. */
function handleAdminUpdateStatus(ss, data) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  if (!expected || data.secret !== expected) {
    return jsonOut({ status: 'error', message: 'Unauthorized' });
  }
  if (!data.id || !data.status) {
    return jsonOut({ status: 'error', message: 'Missing id or status' });
  }
  var sheet = getOrdersSheet(ss);
  var row = findOrderRow(sheet, data.id);
  if (row === -1) {
    return jsonOut({ status: 'error', message: 'Order not found' });
  }
  sheet.getRange(row, 3).setValue(data.status);
  sheet.getRange(row, 10).setValue(new Date());
  return jsonOut({ status: 'ok' });
}

/** ADMIN dashboard's full order list. Requires the shared ADMIN_SECRET. */
function handleAdminOrders(ss, params) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  if (!expected || params.secret !== expected) {
    return jsonOut({ status: 'error', message: 'Unauthorized' });
  }
  var sheet = getOrdersSheet(ss);
  if (sheet.getLastRow() < 2) return jsonOut({ status: 'ok', orders: [] });

  var numRows = sheet.getLastRow() - 1;
  var rows = sheet.getRange(2, 1, numRows, ORDERS_HEADER.length).getValues();
  var orders = rows.map(function (r) {
    return {
      timestamp: r[0], id: r[1], status: r[2] || 'New', name: r[3], email: r[4],
      type: r[5], budget: r[6], description: r[7], reference: r[8], lastUpdated: r[9]
    };
  });
  orders.reverse(); // newest first
  return jsonOut({ status: 'ok', orders: orders });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Gets (or creates + seeds) the "Stats" tab. */
function getStatsSheet(ss) {
  var sheet = ss.getSheetByName('Stats');
  if (!sheet) {
    sheet = ss.insertSheet('Stats');
    sheet.getRange('A1').setValue('RatingSum');
    sheet.getRange('B1').setValue(SEED_RATING_SUM);
    sheet.getRange('A2').setValue('RatingCount');
    sheet.getRange('B2').setValue(SEED_RATING_COUNT);
    sheet.getRange('A1:A2').setFontWeight('bold');
  }
  return sheet;
}

/** Adds one star rating (1-5) into the running average, and logs it. */
function recordRating(ss, rating) {
  rating = Number(rating);
  if (!rating || rating < 1 || rating > 5) return;

  var stats = getStatsSheet(ss);
  var sumCountRange = stats.getRange('B1:B2');
  var sumCount = sumCountRange.getValues()[0];
  sumCountRange.setValues([[sumCount[0] + rating, sumCount[1] + 1]]); // one read, one write instead of four calls

  var log = ss.getSheetByName('Ratings');
  if (!log) {
    log = ss.insertSheet('Ratings');
    log.appendRow(['Timestamp', 'Rating']);
    log.getRange('A1:B1').setFontWeight('bold');
  }
  log.appendRow([new Date(), rating]);
  invalidateStatsCache();
}

/**
 * Logs a written review (name + rating + text) into the "Reviews" tab, and
 * folds its star rating into the same running average as quick ratings.
 */
function recordReview(ss, name, rating, text) {
  rating = Number(rating);
  if (!rating || rating < 1 || rating > 5) return;

  recordRating(ss, rating); // keep one shared average across quick ratings + written reviews

  var sheet = ss.getSheetByName('Reviews');
  if (!sheet) {
    sheet = ss.insertSheet('Reviews');
    sheet.appendRow(['Timestamp', 'Name', 'Rating', 'Text', 'Id']);
    sheet.getRange('A1:E1').setFontWeight('bold');
  }
  sheet.appendRow([
    new Date(),
    (name || '').toString().slice(0, 80) || 'Anonymous',
    rating,
    (text || '').toString().slice(0, 1000),
    Utilities.getUuid()
  ]);
}

/** Returns the most recent written reviews, newest first. */
function getRecentReviews(ss) {
  var sheet = ss.getSheetByName('Reviews');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var numRows = Math.min(MAX_REVIEWS_RETURNED, sheet.getLastRow() - 1);
  var startRow = sheet.getLastRow() - numRows + 1;
  var lastCol = Math.max(sheet.getLastColumn(), 5);
  var rows = sheet.getRange(startRow, 1, numRows, lastCol).getValues();

  var reviews = rows.map(function (row) {
    return { timestamp: row[0], name: row[1], rating: row[2], text: row[3], id: row[4] || '' };
  });
  reviews.reverse(); // newest first
  return reviews;
}

/**
 * Deletes one review by id — only if the request carries the matching
 * ADMIN_SECRET Script Property. Also removes that review's rating from
 * the running average so the homepage stat stays accurate.
 */
function handleDeleteReview(ss, data) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  if (!expected || data.secret !== expected) {
    return jsonOut({ status: 'error', message: 'Unauthorized' });
  }
  if (!data.id) {
    return jsonOut({ status: 'error', message: 'Missing id' });
  }

  var sheet = ss.getSheetByName('Reviews');
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonOut({ status: 'error', message: 'No reviews to delete' });
  }

  var numRows = sheet.getLastRow() - 1;
  var idCol = sheet.getRange(2, 5, numRows, 1).getValues();
  var rowIndex = -1;
  for (var i = 0; i < idCol.length; i++) {
    if (idCol[i][0] === data.id) { rowIndex = i + 2; break; }
  }
  if (rowIndex === -1) {
    return jsonOut({ status: 'error', message: 'Review not found (already deleted?)' });
  }

  var rating = Number(sheet.getRange(rowIndex, 3).getValue()) || 0;
  sheet.deleteRow(rowIndex);

  if (rating > 0) {
    var stats = getStatsSheet(ss);
    var sumCountRange = stats.getRange('B1:B2');
    var sumCount = sumCountRange.getValues()[0];
    sumCountRange.setValues([[Math.max(0, sumCount[0] - rating), Math.max(0, sumCount[1] - 1)]]);
  }

  invalidateStatsCache();
  return jsonOut({ status: 'ok' });
}
