const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function backend(seed = {}) {
  const sheets = new Map(), properties = new Map([
    ['BACKEND_SECRET', 'test-only-backend-secret-with-more-than-32-chars'],
    ['SITE_URL', 'https://example.test'],
  ]);
  const mail = [], triggers = [], reads = [];
  let locked = false, quota = 100, mailFails = false;
  class Range {
    constructor(sheet, row, column, height = 1, width = 1) { Object.assign(this, { sheet, row, column, height, width }); }
    getValues() { return Array.from({ length: this.height }, (_, i) => Array.from({ length: this.width }, (_, j) => this.sheet.data[this.row + i - 1]?.[this.column + j - 1] ?? '')); }
    getValue() { return this.getValues()[0][0]; }
    setValue(value) { return this.setValues([[value]]); }
    setValues(values) {
      if (values.length !== this.height || values.some(r => r.length !== this.width)) throw new Error('Range dimensions mismatch');
      values.forEach((r, i) => r.forEach((v, j) => { this.sheet.data[this.row + i - 1] ||= []; this.sheet.data[this.row + i - 1][this.column + j - 1] = v; }));
      return this;
    }
    setDataValidation() { return this; }
    protect() { return this.sheet.protect(); }
    getSheet() { return this.sheet; }
    getColumn() { return this.column; }
    getRow() { return this.row; }
    getLastRow() { return this.row + this.height - 1; }
    getNumColumns() { return this.width; }
  }
  class Sheet {
    constructor(name, data = []) { this.name = name; this.data = data.map(r => [...r]); this.protections = []; }
    getName() { return this.name; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => r.length)); }
    getMaxRows() { return Math.max(1000, this.data.length); }
    getRange(...args) { return new Range(this, ...args); }
    appendRow(values) { this.data.push([...values]); }
    deleteRow(row) { this.data.splice(row - 1, 1); }
    setFrozenRows() {}
    hideSheet() {}
    getProtections() { return this.protections.slice(); }
    protect() {
      const sheet = this;
      const p = { description: '', getDescription() { return this.description; }, setDescription(s) { this.description = s; return this; }, setWarningOnly() { return this; }, remove() { sheet.protections.splice(sheet.protections.indexOf(this), 1); } };
      this.protections.push(p); return p;
    }
  }
  for (const [name, rows] of Object.entries(seed)) sheets.set(name, new Sheet(name, rows));
  const spreadsheet = {
    getId: () => 'test-spreadsheet-id',
    getSheetByName(name) { reads.push(name); return sheets.get(name); },
    insertSheet(name) { const s = new Sheet(name); sheets.set(name, s); return s; },
  };
  const chain = new Proxy({}, { get(_, key) { if (key === 'build') return () => ({}); return () => chain; } });
  const context = vm.createContext({
    Date, console, SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: id => { if (id !== 'test-spreadsheet-id') throw Error('Wrong sheet'); return spreadsheet; }, flush() {}, newDataValidation: () => chain, ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties.get(k), setProperty: (k, v) => properties.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock() { if (locked) return false; locked = true; return true; }, releaseLock() { locked = false; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: body => ({ body, setMimeType() { return this; } }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()], computeHmacSha256Signature: (s, k) => [...crypto.createHmac('sha256', k).update(s).digest()], base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'), getUuid: () => crypto.randomUUID() },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail(data) { if (mailFails) throw Error('Mail unavailable'); quota--; mail.push(data); } },
    ScriptApp: { getProjectTriggers: () => triggers.map(name => ({ getHandlerFunction: () => name })), newTrigger(name) { const t = { timeBased: () => t, everyMinutes: () => t, forSpreadsheet: () => t, onEdit: () => t, create: () => triggers.push(name) }; return t; } },
  });
  vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8').replace(/^\uFEFF/, ''), context);
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  return {
    ctx: context, sheets, spreadsheet, properties, mail, reads, hash, triggers,
    setup: () => context.setup(),
    setQuota: n => { quota = n; }, setMailFails: v => { mailFails = v; }, setLocked: v => { locked = v; },
    records(name) { const s = sheets.get(name); return s.data.slice(1).map(r => Object.fromEntries(s.data[0].map((h, i) => [h, r[i] ?? '']))); },
    set(name, rowIndex, key, value) { const s = sheets.get(name); s.getRange(rowIndex + 2, s.data[0].indexOf(key) + 1).setValue(value); },
    post(action, data = {}) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ secret: properties.get('BACKEND_SECRET'), clientKey: hash('test-client'), action, ...data }) } }).body); },
  };
}
module.exports = { backend };
