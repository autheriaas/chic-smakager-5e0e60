/**
 * Claudia's Community backend v2. See docs/OPERATIONS-AND-PUBLISHING.md.
 * Required Script Properties: BACKEND_SECRET, SITE_URL.
 * Run setup() manually once after backing up the spreadsheet.
 * All HTTP operations require the server secret; no legacy client editing.
 */
var ORDER_HEADERS = ['Timestamp', 'Id', 'Status', 'Name', 'Email', 'Type', 'Budget', 'Description', 'Reference', 'LastUpdated', 'Number', 'ClientMessage', 'AccessHash', 'RecoveryHash', 'RecoveryExpires', 'RequestId', 'Fingerprint', 'MailState', 'AccessEnabled'];
var REVIEW_HEADERS = ['Timestamp', 'Name', 'Rating', 'Text', 'Id', 'Visible', 'RequestId', 'Fingerprint'];
var QUEUE_HEADERS = ['Timestamp', 'RequestId', 'Email', 'State', 'Attempts', 'Prepared', 'LeaseUntil'];
var RATE_HEADERS = ['Key', 'Window', 'Count'];
var STATUSES = ['Received', 'Contacted', 'In progress', 'Completed'];
var TYPES = ['PFP / Banner', '3D Model', 'Streaming Assets / Emotes', 'Character Art', 'Animation', 'Couple Art'];
var RECOVERY_PENDING_PROPERTY = 'RECOVERY_QUEUE_PENDING';

function props_() { return PropertiesService.getScriptProperties(); }
function spreadsheet_() {
  var id = props_().getProperty('SPREADSHEET_ID');
  if (!id) error_(503, 'SHEET_ID_MISSING');
  return SpreadsheetApp.openById(id);
}
function error_(code, reason) { var e = new Error('Request refused'); e.code = code; e.reason = reason; throw e; }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function sha_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function mac_(value) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, props_().getProperty('BACKEND_SECRET'), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function validHash_(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function validId_(value) { return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value); }
function validEmail_(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function safe_(value) { var text = String(value == null ? '' : value); return /^[\s]*[=+@-]/.test(text) ? "'" + text : text; }
function text_(value, max, required) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) error_(400); return value.trim(); }
function enabled_(value) { return value !== false && String(value).toLowerCase() !== 'false'; }
function site_() {
  var value = props_().getProperty('SITE_URL') || '';
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(value)) error_(503);
  return value.replace(/\/$/, '');
}
function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) error_(503, 'BACKEND_BUSY');
  try { return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}
function doGet() { return json_({ status: 'error', code: 405 }); }
function doPost(e) {
  var phase = 'configuration';
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 20000) error_(400);
    var data; try { data = JSON.parse(raw); } catch (_) { error_(400); }
    var secret = props_().getProperty('BACKEND_SECRET');
    if (!secret || secret.length < 32) error_(503, 'SECRET_MISSING');
    if (props_().getProperty('SCHEMA_VERSION') !== '2') error_(503, 'SETUP_REQUIRED');
    if (!data || data.secret !== secret) error_(403);
    var actions = { createOrder: createOrder_, trackOrder: trackOrder_, queueRecovery: queueRecovery_, confirmRecovery: confirmRecovery_, listReviews: listReviews_, createReview: createReview_ };
    if (!Object.prototype.hasOwnProperty.call(actions, data.action)) error_(400);
    if (!validHash_(data.clientKey)) error_(400);
    // Public reads do not mutate state and must not wait behind email delivery/writes.
    if (data.action === 'listReviews') {
      phase = 'spreadsheet';
      var reviewsSpreadsheet = spreadsheet_();
      phase = 'operation';
      return json_(listReviews_(reviewsSpreadsheet));
    }
    return json_(locked_(function () {
      phase = 'spreadsheet';
      var ss = spreadsheet_();
      phase = 'operation';
      if (data.action !== 'listReviews') {
        var max = data.action === 'trackOrder' ? 120 : data.action === 'queueRecovery' ? 20 : 30;
        if (!rate_(ss, data.action + ':' + data.clientKey, max)) error_(429);
      }
      return actions[data.action](ss, data);
    }));
  } catch (err) {
    // Only fixed diagnostic codes cross the HTTP boundary, never exception text or data.
    return json_({ status: 'error', code: err.code || 503, reason: err.reason || (phase === 'spreadsheet' ? 'SHEET_ACCESS_FAILED' : 'BACKEND_ERROR') });
  }
}

/** Run manually in the editor to inspect setup/read access without writing rows or sending mail. */
function diagnoseSetup() {
  var p = props_();
  var report = { schemaReady: p.getProperty('SCHEMA_VERSION') === '2', secretConfigured: (p.getProperty('BACKEND_SECRET') || '').length >= 32, spreadsheetIdConfigured: !!p.getProperty('SPREADSHEET_ID') };
  try {
    site_();
    var ss = spreadsheet_(), sheet = ss.getSheetByName('Reviews');
    report.spreadsheetAccessible = true;
    report.reviewsSheetExists = !!sheet;
    report.reviewRows = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    if (sheet) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      report.reviewHeadersReady = REVIEW_HEADERS.every(function (h) { return headers.indexOf(h) !== -1; });
    }
  } catch (err) {
    report.error = String(err.message || err.name);
    ['BACKEND_SECRET', 'SPREADSHEET_ID'].forEach(function (key) { var value = p.getProperty(key); if (value) report.error = report.error.split(value).join('[redacted]'); });
  }
  console.log(JSON.stringify(report));
  return report;
}
function table_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); }
  var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach(function (h) { if (actual.indexOf(h) === -1) { actual.push(h); sheet.getRange(1, actual.length).setValue(h); } });
  return { sheet: sheet, headers: actual };
}
function readTable_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet || !sheet.getLastColumn()) error_(503, 'SETUP_REQUIRED');
  var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.every(function (h) { return actual.indexOf(h) !== -1; })) error_(503, 'SETUP_REQUIRED');
  return { sheet: sheet, headers: actual };
}
function rows_(t) {
  if (t.sheet.getLastRow() < 2) return [];
  return t.sheet.getRange(2, 1, t.sheet.getLastRow() - 1, t.headers.length).getValues().map(function (values, i) {
    var row = { _row: i + 2 }; t.headers.forEach(function (h, j) { row[h] = values[j]; }); return row;
  });
}
function append_(t, record) { t.sheet.appendRow(t.headers.map(function (h) { return record[h] == null ? '' : record[h]; })); record._row = t.sheet.getLastRow(); return record; }
function prepend_(t, record) {
  t.sheet.insertRowBefore(2);
  t.sheet.getRange(2, 1, 1, t.headers.length).setValues([t.headers.map(function (h) { return record[h] == null ? '' : record[h]; })]);
  record._row = 2;
  return record;
}
function update_(t, row, fields) { Object.keys(fields).forEach(function (key) { t.sheet.getRange(row._row, t.headers.indexOf(key) + 1).setValue(fields[key]); row[key] = fields[key]; }); }
function rate_(ss, key, max) {
  var t = table_(ss, '_RateLimits', RATE_HEADERS), now = Date.now(), window = Math.floor(now / 3600000);
  var rows = rows_(t), item = rows.filter(function (r) { return r.Key === key && Number(r.Window) === window; })[0];
  if (item) { if (Number(item.Count) >= max) return false; update_(t, item, { Count: Number(item.Count) + 1 }); return true; }
  // Keep persistent limits bounded; expired buckets no longer authorize requests.
  rows.slice().reverse().forEach(function (r) { if (Number(r.Window) < window) t.sheet.deleteRow(r._row); });
  if (t.sheet.getLastRow() > 5000) return false;
  append_(t, { Key: key, Window: window, Count: 1 }); return true;
}
function createOrder_(ss, data) {
  var o = data.order || {};
  ['name', 'type', 'description'].forEach(function (key) { text_(o[key], key === 'description' ? 4000 : 80, true); });
  text_(o.budget, 120); text_(o.reference, 2000);
  if (!validEmail_(o.email) || TYPES.indexOf(o.type) === -1 || !validId_(data.requestId) || !validHash_(data.fingerprint) || !/^[\w-]{43}$/.test(data.accessToken || '')) error_(400);
  var t = table_(ss, 'Orders', ORDER_HEADERS), all = rows_(t);
  var row = all.filter(function (r) { return r.RequestId === data.requestId; })[0];
  if (row && row.Fingerprint !== data.fingerprint) error_(409);
  if (!row) {
    if (!rate_(ss, 'create-email:' + sha_(o.email), 5)) error_(429);
    var now = new Date();
    row = prepend_(t, { Timestamp: now, Id: Utilities.getUuid(), Status: 'Received', Name: safe_(o.name), Email: safe_(o.email), Type: o.type, Budget: safe_(o.budget), Description: safe_(o.description), Reference: safe_(o.reference), LastUpdated: now, Number: nextNumber_(all), ClientMessage: '', AccessHash: sha_(data.accessToken), RequestId: data.requestId, Fingerprint: data.fingerprint, MailState: 'Pending', AccessEnabled: true });
    SpreadsheetApp.flush(); // Persist before attempting delivery.
  }
  // A replay of the original submission must never restore a rotated/revoked token.
  if (row.MailState !== 'Sent' && enabled_(row.AccessEnabled) && row.AccessHash === sha_(data.accessToken)) {
    try {
      sendMail_(String(row.Email), 'Your commission request ' + row.Number,
        'Your request has been received. Keep this private link to follow its progress:\n\n' + site_() + '/track.html#token=' + data.accessToken + '\n\nAnyone with this link can view the status. For changes, contact Claudia.');
      update_(t, row, { MailState: 'Sent' });
    } catch (_) { update_(t, row, { MailState: 'Failed - use recovery' }); }
  }
  return { status: 'ok', number: row.Number, emailSent: row.MailState === 'Sent' };
}
function nextNumber_(rows) {
  var max = rows.reduce(function (n, row) { var m = /^ART-(\d+)$/.exec(String(row.Number)); return m ? Math.max(n, Number(m[1])) : n; }, 0);
  var next = Math.max(max, Number(props_().getProperty('ORDER_SEQUENCE')) || 0) + 1;
  props_().setProperty('ORDER_SEQUENCE', String(next));
  return 'ART-' + String(next).padStart(5, '0');
}
function publicOrder_(row) {
  var updated = row.LastUpdated instanceof Date ? row.LastUpdated.toISOString() : '';
  return { number: String(row.Number), type: String(row.Type), status: String(row.Status), message: String(row.ClientMessage || ''), updatedAt: updated };
}
function trackOrder_(ss, data) {
  if (!validHash_(data.tokenHash)) error_(404);
  var row = rows_(table_(ss, 'Orders', ORDER_HEADERS)).filter(function (r) { return enabled_(r.AccessEnabled) && r.AccessHash === data.tokenHash; })[0];
  if (!row) error_(404);
  return { status: 'ok', order: publicOrder_(row) };
}
function queueRecovery_(ss, data) {
  if (!validEmail_(data.email) || !validId_(data.requestId)) error_(400);
  var queue = table_(ss, '_RecoveryQueue', QUEUE_HEADERS);
  var previous = rows_(queue).filter(function (r) { return r.RequestId === data.requestId; })[0];
  if (previous) {
    if (String(previous.Email).trim().toLowerCase() !== data.email) error_(409);
    return { status: 'ok' };
  }
  // No lookup of Orders here. Known/unknown email addresses follow the same path.
  if (rate_(ss, 'recover-email:' + sha_(data.email), 3)) {
    append_(queue, { Timestamp: new Date(), RequestId: data.requestId, Email: safe_(data.email), State: 'Pending', Attempts: 0 });
    props_().setProperty(RECOVERY_PENDING_PROPERTY, '1');
  }
  return { status: 'ok' };
}
function confirmRecovery_(ss, data) {
  if (!validHash_(data.tokenHash) || !validHash_(data.accessHash)) error_(404);
  var t = table_(ss, 'Orders', ORDER_HEADERS);
  var row = rows_(t).filter(function (r) { return enabled_(r.AccessEnabled) && r.RecoveryHash === data.tokenHash && Number(r.RecoveryExpires) > Date.now(); })[0];
  if (!row) error_(404);
  // Under ScriptLock: no second request can consume the same recovery token.
  // One contiguous write covers access + recovery hash + expiry together.
  var first = t.headers.indexOf('AccessHash');
  if (t.headers[first + 1] !== 'RecoveryHash' || t.headers[first + 2] !== 'RecoveryExpires') error_(503);
  t.sheet.getRange(row._row, first + 1, 1, 3).setValues([[data.accessHash, '', '']]);
  return { status: 'ok' };
}
function sendMail_(to, subject, body) {
  if (MailApp.getRemainingDailyQuota() < 1) error_(503);
  MailApp.sendEmail({ to: to, subject: subject, body: body, name: "Claudia's Community" });
}
function setRecoveryPending_(pending) {
  if (pending) props_().setProperty(RECOVERY_PENDING_PROPERTY, '1');
  else props_().deleteProperty(RECOVERY_PENDING_PROPERTY);
}
function refreshRecoveryPending_(queueRows) {
  setRecoveryPending_(queueRows.some(function (r) { return r.State === 'Pending' || r.State === 'Processing'; }));
}
function claimRecoveryJobs_() {
  return locked_(function () {
    var ss = spreadsheet_(), queue = table_(ss, '_RecoveryQueue', QUEUE_HEADERS), orders = table_(ss, 'Orders', ORDER_HEADERS);
    var now = Date.now(), queueRows = rows_(queue), orderRows = rows_(orders), jobs = [];
    queueRows.forEach(function (item) {
      var age = now - new Date(item.Timestamp).getTime();
      if (age > 86400000) { item.State = 'Expired'; return; }
      if (item.State === 'Processing' && Number(item.LeaseUntil) <= now) {
        var staleAttempts = Number(item.Attempts) + 1;
        update_(queue, item, { State: staleAttempts >= 3 ? 'Failed' : 'Pending', Attempts: staleAttempts, LeaseUntil: '' });
      }
      if (item.State === 'Pending' && age > 30 * 60000) update_(queue, item, { State: 'Expired', LeaseUntil: '' });
    });
    queueRows.filter(function (r) { return r.State === 'Pending'; }).slice(0, 2).forEach(function (item) {
      try {
        var matches = orderRows.filter(function (r) { return enabled_(r.AccessEnabled) && String(r.Email).trim().toLowerCase() === String(item.Email).trim().toLowerCase(); });
        var links = [];
        matches.forEach(function (row) {
          // HMAC of a stable request/order pair keeps retries idempotent.
          // Only its hash is persisted; raw tokens live only in this job and the email.
          var token = mac_('recovery:' + item.RequestId + ':' + row.Id), tokenHash = sha_(token);
          if (item.Prepared === true && row.RecoveryHash !== tokenHash) return;
          var expires = row.RecoveryHash === tokenHash && Number(row.RecoveryExpires) > now ? Number(row.RecoveryExpires) : now + 15 * 60000;
          update_(orders, row, { RecoveryHash: tokenHash, RecoveryExpires: expires });
          links.push(row.Number + ': ' + site_() + '/track.html#recover=' + token);
        });
        if (!links.length) {
          update_(queue, item, { State: 'Processed', Attempts: Number(item.Attempts) + 1, LeaseUntil: '' });
          return;
        }
        update_(queue, item, { State: 'Processing', Prepared: true, LeaseUntil: now + 5 * 60000 });
        jobs.push({
          requestId: String(item.RequestId),
          to: String(item.Email),
          subject: 'Recover your commission tracking links',
          body: 'Open the link for the order you want to follow and confirm recovery. Links expire in 15 minutes and work once. Confirming replaces the previous tracking link for that order.\n\n' + links.join('\n\n') + '\n\nIf you did not request this, ignore this email. Your existing tracking links remain valid until recovery is confirmed.'
        });
      } catch (_) {
        var attempts = Number(item.Attempts) + 1;
        update_(queue, item, { Attempts: attempts, State: attempts >= 3 ? 'Failed' : 'Pending', LeaseUntil: '' });
      }
    });
    // Queue contains email addresses: remove completed/abandoned work after 24h.
    queueRows.slice().reverse().forEach(function (r) { if (now - new Date(r.Timestamp).getTime() > 86400000) queue.sheet.deleteRow(r._row); });
    refreshRecoveryPending_(queueRows);
    return jobs;
  });
}
function finishRecoveryJob_(job, sent) {
  locked_(function () {
    var queue = table_(spreadsheet_(), '_RecoveryQueue', QUEUE_HEADERS), queueRows = rows_(queue);
    var item = queueRows.filter(function (r) { return r.RequestId === job.requestId && r.State === 'Processing'; })[0];
    if (item) {
      var attempts = Number(item.Attempts) + 1;
      update_(queue, item, { State: sent ? 'Processed' : attempts >= 3 ? 'Failed' : 'Pending', Attempts: attempts, LeaseUntil: '' });
    }
    refreshRecoveryPending_(queueRows);
  });
}
/** Time-driven trigger: claims at most two requests, then sends mail without holding ScriptLock. */
function processRecoveryQueue() {
  if (props_().getProperty('SCHEMA_VERSION') !== '2' || props_().getProperty(RECOVERY_PENDING_PROPERTY) !== '1') return;
  var jobs = claimRecoveryJobs_();
  jobs.forEach(function (job) {
    var sent = false;
    try { sendMail_(job.to, job.subject, job.body); sent = true; } catch (_) {}
    try { finishRecoveryJob_(job, sent); } catch (_) {
      // The lease and pending flag allow a later run to recover if finalization is interrupted.
    }
  });
}
function createReview_(ss, data) {
  if (!validId_(data.requestId) || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) error_(400);
  var name = text_(data.name, 80, true), text = text_(data.text, 600, true);
  if (text.length < 3) error_(400);
  var t = table_(ss, 'Reviews', REVIEW_HEADERS);
  var fingerprint = sha_(JSON.stringify([name, data.rating, text]));
  var existing = rows_(t).filter(function (r) { return r.RequestId === data.requestId; })[0];
  if (existing && existing.Fingerprint !== fingerprint) error_(409);
  if (!existing) append_(t, { Timestamp: new Date(), Name: safe_(name), Rating: data.rating, Text: safe_(text), Id: Utilities.getUuid(), Visible: true, RequestId: data.requestId, Fingerprint: fingerprint });
  return { status: 'ok' };
}
function listReviews_(ss) {
  // Ratings/Stats are retained as historical records, not added to review scores:
  // the old recordReview wrote the same rating into Ratings too.
  var visible = rows_(readTable_(ss, 'Reviews', REVIEW_HEADERS)).filter(function (r) { return enabled_(r.Visible) && Number.isInteger(Number(r.Rating)) && Number(r.Rating) >= 1 && Number(r.Rating) <= 5; });
  var sum = visible.reduce(function (n, r) { return n + Number(r.Rating); }, 0);
  return { status: 'ok', avgRating: visible.length ? Math.round(sum / visible.length * 10) / 10 : 0, ratingCount: visible.length,
    reviews: visible.slice(-30).reverse().map(function (r) { return { timestamp: r.Timestamp, name: String(r.Name), rating: Number(r.Rating), text: String(r.Text), id: String(r.Id) }; }) };
}
function protect_(sheet, column, description) {
  var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(function (p) { return p.getDescription() === description; });
  existing.forEach(function (p) { p.remove(); });
  sheet.getRange(1, column, sheet.getMaxRows(), 1).protect().setDescription(description).setWarningOnly(true);
}
/** Explicit, repeatable migration. Run in the editor, not via HTTP. Sends no email. */
function setup() {
  if ((props_().getProperty('BACKEND_SECRET') || '').length < 32) error_(503);
  site_();
  // Bound-container methods are available in the editor, not in web-app requests.
  var bound = SpreadsheetApp.getActiveSpreadsheet();
  if (!bound) throw new Error('Run setup from the spreadsheet-bound script editor.');
  props_().setProperty('SPREADSHEET_ID', bound.getId());
  locked_(function () {
    var ss = spreadsheet_();
    var orders = table_(ss, 'Orders', ORDER_HEADERS), reviews = table_(ss, 'Reviews', REVIEW_HEADERS);
    var all = rows_(orders), mapping = { New: 'Received', Contacted: 'Contacted', 'In Progress': 'In progress', Done: 'Completed' };
    all.forEach(function (row) {
      var fields = {};
      if (!row.Id) fields.Id = Utilities.getUuid();
      if (!row.Number) { fields.Number = nextNumber_(all); row.Number = fields.Number; }
      if (mapping[row.Status]) fields.Status = mapping[row.Status];
      if (row.AccessEnabled === '') fields.AccessEnabled = true;
      update_(orders, row, fields);
    });
    rows_(reviews).forEach(function (row) { var fields = {}; if (row.Visible === '') fields.Visible = true; if (!row.Id) fields.Id = Utilities.getUuid(); update_(reviews, row, fields); });
    orders.sheet.getRange(2, orders.headers.indexOf('Status') + 1, orders.sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
    var checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();
    orders.sheet.getRange(2, orders.headers.indexOf('AccessEnabled') + 1, orders.sheet.getMaxRows() - 1, 1).setDataValidation(checkbox);
    reviews.sheet.getRange(2, reviews.headers.indexOf('Visible') + 1, reviews.sheet.getMaxRows() - 1, 1).setDataValidation(checkbox);
    ['Id', 'Number', 'AccessHash', 'RecoveryHash', 'RecoveryExpires', 'RequestId', 'Fingerprint', 'MailState'].forEach(function (h) { protect_(orders.sheet, orders.headers.indexOf(h) + 1, 'Autheria technical: ' + h); });
    protect_(reviews.sheet, reviews.headers.indexOf('RequestId') + 1, 'Autheria review request');
    ['_RateLimits', '_RecoveryQueue'].forEach(function (name) {
      var t = table_(ss, name, name === '_RateLimits' ? RATE_HEADERS : QUEUE_HEADERS);
      var p = t.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(function (p) { return p.getDescription() === 'Autheria internal'; });
      if (!p.length) t.sheet.protect().setDescription('Autheria internal').setWarningOnly(true);
      t.sheet.hideSheet();
    });
    refreshRecoveryPending_(rows_(table_(ss, '_RecoveryQueue', QUEUE_HEADERS)));
    orders.sheet.setFrozenRows(1); reviews.sheet.setFrozenRows(1);
    props_().setProperty('SCHEMA_VERSION', '2');
  });
  var triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(function (t) { return t.getHandlerFunction() === 'processRecoveryQueue'; })) ScriptApp.newTrigger('processRecoveryQueue').timeBased().everyMinutes(1).create();
  if (!triggers.some(function (t) { return t.getHandlerFunction() === 'onSheetEdit'; })) ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(bound).onEdit().create();
  // Requests permission for mail without sending any messages.
  MailApp.getRemainingDailyQuota();
}
function onSheetEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== 'Orders') return;
  var t = table_(e.source, 'Orders', ORDER_HEADERS), start = e.range.getColumn(), end = start + e.range.getNumColumns() - 1;
  var relevant = ['Status', 'ClientMessage', 'Type'].some(function (h) { var col = t.headers.indexOf(h) + 1; return col >= start && col <= end; });
  if (!relevant) return;
  var first = Math.max(2, e.range.getRow()), last = Math.min(t.sheet.getLastRow(), e.range.getLastRow());
  if (last < first) return;
  t.sheet.getRange(first, t.headers.indexOf('LastUpdated') + 1, last - first + 1, 1).setValues(Array.from({ length: last - first + 1 }, function () { return [new Date()]; }));
}
