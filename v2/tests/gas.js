// Nạp các file .gs của app mới vào một môi trường giả lập Google Apps Script để chạy thử bằng Node.
// Giả lập chỉ đủ những gì tầng dữ liệu dùng: file Sheets, thuộc tính dự án, khoá ghi.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

class FakeRange {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
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
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  getRange(row, col, rows = 1, cols = 1) { return new FakeRange(this, row, col, rows, cols); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  setFrozenRows(n) { this.frozen = n; }
  setTabColor(c) { this.tabColor = c; }
  protect() {
    this.protectedTab = true;
    const p = { setDescription: () => p, getEditors: () => [], removeEditors: () => p, canDomainEdit: () => false, setDomainEdit: () => p };
    return p;
  }
}

class FakeSpreadsheet {
  constructor(id) { this.id = id; this.sheets = [new FakeSheet('Sheet1')]; }
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
  const files_ = {};
  let nextId = 1;
  const lockCalls = { taken: 0, released: 0 };
  const pad = (n) => String(n).padStart(2, '0');
  const ctx = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; }
      })
    },
    SpreadsheetApp: {
      create: () => { const ss = new FakeSpreadsheet('file' + nextId++); files_[ss.id] = ss; return ss; },
      openById: (id) => { if (!files_[id]) throw new Error('not found'); return files_[id]; },
      flush: () => {},
      newDataValidation: () => ({ requireCheckbox() { return this; }, build: () => ({}) })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => { lockCalls.taken++; return true; }, releaseLock: () => { lockCalls.released++; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'clb@example.com' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: {
      formatDate: (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
  ctx.__files = files_;
  ctx.__props = props;
  ctx.__lock = lockCalls;
  return ctx;
}

module.exports = { loadApp, FakeSpreadsheet };
