// Nạp các file .gs của app mới vào một môi trường giả lập Google Apps Script để chạy thử bằng Node.
// Giả lập chỉ đủ những gì app dùng: file Sheets, thuộc tính dự án, khoá ghi, băm SHA-256, bộ nhớ tạm, gửi mail, gọi web.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

class FakeRange {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
    // Định dạng (màu, viền, gộp ô...) không ảnh hưởng dữ liệu: hàm nào giả lập không có thì bỏ qua và trả lại vùng.
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => t.proxy : undefined) });
  }
  get proxy() { return this.sheet.getRange(this.row, this.col, this.rows, this.cols); }
  getValue() { return this.getValues()[0][0]; }
  setValue(v) { return this.setValues([[v]]); }
  getBackground() { return '#ffffff'; }
  insertCheckboxes() {
    this.setValues(this.getValues().map((l) => l.map((v) => (v === '' ? false : v))));
    return this;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = this.sheet.data[this.row - 1 + r] || [];
      const vals = [];
      for (let c = 0; c < this.cols; c++) {
        const v = line[this.col - 1 + c];
        vals.push(v === undefined ? '' : v);
      }
      out.push(vals);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.rows || values.some((l) => l.length !== this.cols)) throw new Error('Số dòng hoặc cột không khớp với vùng ghi.');
    if (this.row + this.rows - 1 > this.sheet.maxRows || this.col + this.cols - 1 > this.sheet.maxCols) {
      throw new Error('Vùng ghi nằm ngoài sheet.');
    }
    values.forEach((line, r) => {
      const i = this.row - 1 + r;
      while (this.sheet.data.length <= i) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[i][this.col - 1 + c] = v; });
    });
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setDataValidation() { return this; }
}

class FakeSheet {
  constructor(name) {
    Object.assign(this, { name, data: [], maxRows: 1000, maxCols: 26, frozen: 0, tabColor: null, protectedTab: false });
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length; r > 0; r--) if ((this.data[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r;
    return 0;
  }
  getLastColumn() {
    let n = 0;
    this.data.forEach((l) => l.forEach((v, c) => { if (v !== '' && v !== undefined) n = Math.max(n, c + 1); }));
    return n;
  }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(_after, n) { this.maxRows += n; }
  deleteRow(row) { this.data.splice(row - 1, 1); }
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  getRange(row, col, rows = 1, cols = 1) { return new FakeRange(this, row, col, rows, cols); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  setFrozenRows(n) { this.frozen = n; }
  setFrozenColumns() {}
  setName(n) { this.name = n; return this; }
  clear() { this.data = []; return this; }
  appendRow(line) { this.data.splice(this.getLastRow(), 0, line.slice()); this.data.length = Math.max(this.data.length, this.getLastRow()); return this; }
  insertColumnBefore(col) { this.maxCols++; this.data.forEach((l) => { if (l.length >= col) l.splice(col - 1, 0, ''); }); return this; }
  setTabColor(c) { this.tabColor = c; }
  protect() {
    this.protectedTab = true;
    const p = { setDescription: () => p, setWarningOnly: () => p, setUnprotectedRanges: () => p, getEditors: () => [], removeEditors: () => p, canDomainEdit: () => false, setDomainEdit: () => p };
    return p;
  }
}

class FakeSpreadsheet {
  constructor(id, name) { this.id = id; this.name = name || ''; this.sheets = [new FakeSheet('Sheet1')]; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(name, index) {
    const sh = new FakeSheet(name);
    this.sheets.splice(index === undefined ? this.sheets.length : Math.min(index, this.sheets.length), 0, sh);
    return sh;
  }
  deleteSheet(sh) { this.sheets = this.sheets.filter((s) => s !== sh); }
}

/** Tạo một môi trường mới (file dữ liệu trống) và nạp các file .gs vào. */
function loadApp(files = ['schema.gs', 'records.gs', 'db.gs']) {
  const props = {};
  const cache = {};
  const mails = [];
  const files_ = {};
  const folders = [];
  const blobs = {};
  let nextId = 1;
  const lockCalls = { taken: 0, released: 0 };
  const pad = (n) => String(n).padStart(2, '0');
  const ctx = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: (k) => { delete cache[k]; }
      })
    },
    MailApp: { sendEmail: (to, subject, body) => { mails.push({ to, subject, body }); }, getRemainingDailyQuota: () => ctx.__quota },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/app/exec' }),
      getProjectTriggers: () => ctx.__triggers.map((h) => ({ getHandlerFunction: () => (typeof h === 'string' ? h : h.handler),
        getUniqueId: () => (typeof h === 'string' ? 'trg-' + h : h.id), __ref: h })),
      deleteTrigger: (t) => { const i = ctx.__triggers.indexOf(t.__ref); if (i >= 0) ctx.__triggers.splice(i, 1); },
      newTrigger: (h) => {
        const spec = { handler: h, id: 'trg' + (ctx.__trgSeq = (ctx.__trgSeq || 0) + 1) };
        const b = { timeBased: () => b, everyMinutes: (n) => { spec.everyMinutes = n; return b; }, everyDays: (n) => { spec.everyDays = n; return b; },
          atHour: (n) => { spec.hour = n; return b; }, forSpreadsheet: () => b, onOpen: () => b, nearMinute: (n) => { spec.minute = n; return b; }, inTimezone: () => b,
          create: () => { ctx.__triggers.push(spec.everyMinutes || spec.hour === undefined ? h : spec); return { getUniqueId: () => spec.id }; } };
        return b;
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => { const o = { text, setMimeType: () => o }; return o; }
    },
    // Google Calendar: mỗi lịch là { id, name, series: [...] }; sự kiện lặp hằng năm nên getEvents trả về mọi chuỗi còn lại.
    CalendarApp: {
      getCalendarById: (id) => ctx.__calendars[id] || null,
      newRecurrence: () => ({ addYearlyRule() { return this; } })
    },
    __calendars: {},
    __makeCalendar: (id, name) => {
      const cal = { id, name, series: [], seq: 0, getId: () => id, getName: () => name };
      cal.createAllDayEventSeries = (title, date, _rec, opts) => {
        const s = { id: id + '-ev' + ++cal.seq, title, date, description: (opts || {}).description || '', tags: {}, reminders: true };
        cal.series.push(s);
        return seriesOf(s);
      };
      const seriesOf = (s) => ({ getId: () => s.id, removeAllReminders: () => { s.reminders = false; }, setTag: (k, v) => { s.tags[k] = String(v); },
        deleteEventSeries: () => { cal.series = cal.series.filter((x) => x !== s); } });
      cal.getEvents = () => cal.series.slice().map((s) => ({ getTag: (k) => (k in s.tags ? s.tags[k] : null), getEventSeries: () => seriesOf(s) }));
      ctx.__calendars[id] = cal;
      return cal;
    },
    __quota: 100,
    __triggers: [],
    UrlFetchApp: { fetch: (url, opts) => ctx.__fetch(url, opts) },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createTemplateFromFile: (name) => {
        const t = {
          evaluate: () => {
            const out = { name, vars: Object.assign({}, t), setTitle: () => out, addMetaTag: () => out, setXFrameOptionsMode: () => out };
            delete out.vars.evaluate;
            return out;
          }
        };
        return t;
      },
      createHtmlOutputFromFile: (name) => ({ getContent: () => fs.readFileSync(path.join(SRC, name + '.html'), 'utf8') })
    },
    SpreadsheetApp: {
      create: (name) => { const ss = new FakeSpreadsheet('file' + nextId++ + 'xxxxxxxxxxxxxxxxxxxx', name); files_[ss.id] = ss; return ss; },
      openById: (id) => { if (!files_[id]) throw new Error('not found'); return files_[id]; },
      flush: () => {},
      newDataValidation: () => ({ requireCheckbox() { return this; }, requireValueInList() { return this; }, build: () => ({}) })
    },
    // Drive: thư mục là { id, name, files }, file trong Drive là chính file Sheets giả.
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone_with_link' },
      Permission: { EDIT: 'edit', VIEW: 'view' },
      getFileById: (id) => {
        if (blobs[id]) {
          const b = blobs[id];
          return { getId: () => id, getName: () => b.name, getSize: () => b.bytes.length, getBlob: () => ctx.Utilities.newBlob(b.bytes, b.type, b.name),
            setSharing: (a, p) => { b.sharing = a + ':' + p; }, setTrashed: (t) => { b.trashed = !!t; }, __blob: b };
        }
        const ss = files_[id];
        if (!ss) throw new Error('not found');
        return {
          getId: () => id,
          getName: () => ss.name,
          setName: (n) => { ss.name = n; },
          setTrashed: (t) => { ss.trashed = !!t; },
          setSharing: (a, p) => { ss.sharing = a + ':' + p; },
          moveTo: (folder) => { ss.folder = folder.name; },
          makeCopy: (name, folder) => {
            const copy = new FakeSpreadsheet('file' + nextId++ + 'xxxxxxxxxxxxxxxxxxxx', name);
            copy.sheets = ss.sheets.map((sh) => Object.assign(new FakeSheet(sh.name), { data: JSON.parse(JSON.stringify(sh.data)), maxRows: sh.maxRows, maxCols: sh.maxCols }));
            copy.folder = folder ? folder.name : '';
            files_[copy.id] = copy;
            return ctx.DriveApp.getFileById(copy.id);
          }
        };
      },
      getRootFolder: () => ({ id: 'root', name: '' }),
      getFolderById: (id) => { const f = folders.find((x) => x.id === id); if (!f) throw new Error('not found'); return f; },
      getFoldersByName: (name) => { const list = folders.filter((x) => x.name === name); return { hasNext: () => list.length > 0, next: () => list.shift() }; },
      createFolder: (name) => {
        const f = { id: 'folder' + nextId++ + 'xxxxxxxxxxxxxxxxxxxx', name, getName: () => name,
          createFile: (blob) => { const id = 'blob' + nextId++ + 'xxxxxxxxxxxxxxxxxxxx'; blobs[id] = { name: blob.getName(), type: blob.getContentType(), bytes: blob.getBytes(), folder: name }; return ctx.DriveApp.getFileById(id); } };
        folders.push(f);
        return f;
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => { lockCalls.taken++; return true; }, releaseLock: () => { lockCalls.released++; } }) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => 'clb@example.com' }),
      getActiveUser: () => ({ getEmail: () => ctx.__viewer }),
      getScriptTimeZone: () => 'Asia/Ho_Chi_Minh'
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      // Giống Google: trả về mảng byte có dấu (-128..127)
      computeDigest: (alg, s, charset) => Array.from(crypto.createHash(alg).update(String(s), charset || 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      base64DecodeWebSafe: (s) => Array.from(Buffer.from(s, 'base64url')).map((b) => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (value, key) => {
        const buf = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => b & 255)));
        return Array.from(crypto.createHmac('sha256', buf(key)).update(buf(value)).digest()).map((b) => (b > 127 ? b - 256 : b));
      },
      newBlob: (bytes, type, name) => {
        if (typeof bytes === 'string') bytes = Array.from(Buffer.from(bytes, 'utf8')).map((x) => (x > 127 ? x - 256 : x));
        const b = { bytes: Array.from(bytes), type, name };
        const o = { getBytes: () => b.bytes, getContentType: () => b.type, getName: () => b.name, setName: (n) => { b.name = n; return o; }, getSize: () => b.bytes.length };
        return o;
      },
      getUuid: () => crypto.randomUUID(),
      formatDate: (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
  ctx.__viewer = '';
  ctx.__fetch = () => { throw new Error('Chưa giả lập gọi web.'); };
  ctx.__cache = cache;
  ctx.__mails = mails;
  ctx.__files = files_;
  ctx.__folders = folders;
  ctx.__blobs = blobs;
  ctx.__props = props;
  ctx.__lock = lockCalls;
  return ctx;
}

module.exports = { loadApp, FakeSpreadsheet };
