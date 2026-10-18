/**
 * Tầng dữ liệu: mở file dữ liệu, tạo đủ 29 tab, đọc ghi theo tên tab và tên cột, khoá ghi, Nhật ký, Cài đặt.
 *
 * File dữ liệu là một file Google Sheets riêng trên Drive CLB, mở theo ID cất trong thuộc tính của dự án
 * (DATA_FILE_ID). Chỉ app ghi vào file này; riêng tab Cài đặt người sửa tay được.
 *
 * Cách dùng ở các bước sau:
 *   readTable_('tasks')                                  → danh sách bản ghi
 *   insertRecords_('tasks', [{ name: ... }], { termId })  → thêm dòng, tự cấp mã T-2627-...
 *   updateRecord_('tasks', 'T-2627-0042', { deadline: d }, { actorId, action: 'change_deadline' })
 *                                                         → sửa dòng, ghi Nhật ký mỗi cột đổi
 *   withLock_(function () { ... })                        → đọc rồi ghi mà không ai chen vào giữa
 */

var DATA_FILE_PROP = 'DATA_FILE_ID';
var SCHEMA_PROP = 'SCHEMA_SIGNATURE';
var DATA_FILE_NAME = '[ECO] Dữ liệu app';
var CELL_FORMATS = { text: '@', num: 'General', date: 'dd/MM/yyyy', time: 'dd/MM/yyyy HH:mm' };

/* ===================== File dữ liệu ===================== */

var dataFileCache_ = null;

function hasDataFile_() {
  return !!PropertiesService.getScriptProperties().getProperty(DATA_FILE_PROP);
}

/** File dữ liệu. Chưa tạo thì báo lỗi NOT_SET_UP để trang web hiện bước cài đặt. */
function dataFile_() {
  if (dataFileCache_) return dataFileCache_;
  var id = PropertiesService.getScriptProperties().getProperty(DATA_FILE_PROP);
  if (!id) throw new Error('NOT_SET_UP');
  try { dataFileCache_ = SpreadsheetApp.openById(id); }
  catch (e) {
    throw new Error('Không mở được file dữ liệu của app. Có thể file đã bị xoá hoặc tài khoản CLB mất quyền. ' +
      'Khôi phục file trong Thùng rác Google Drive, hoặc chọn lại file ở Cài đặt, Hệ thống.');
  }
  return dataFileCache_;
}

/** Dùng một file dữ liệu khác (lúc cài đặt, hoặc khôi phục từ bản sao lưu). */
function useDataFile_(id) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(DATA_FILE_PROP, String(id));
  props.deleteProperty(SCHEMA_PROP);
  dataFileCache_ = null;
  schemaChecked_ = false;
  memo_ = {};
}

/**
 * Chạy tay một lần trong trình sửa Apps Script (chọn hàm này rồi bấm Chạy): tạo file dữ liệu nếu chưa có,
 * tạo đủ tab và cột. Chạy lại nhiều lần không sao. Link file in ra ở Nhật ký thực thi.
 */
function setupDataFile() {
  if (!hasDataFile_()) useDataFile_(SpreadsheetApp.create(DATA_FILE_NAME).getId());
  ensureSchema_(true);
  Logger.log('File dữ liệu: ' + dataFile_().getUrl());
}

/* ===================== Tạo tab, cột ===================== */

var schemaChecked_ = false;

/**
 * Tạo các tab còn thiếu, thêm cột còn thiếu, tô màu tab theo nhóm, khoá tab, thêm dòng mặc định.
 * Chỉ chạy khi cấu trúc trong schema.gs khác lần trước (hoặc force), nên các lần mở app sau không tốn thời gian.
 */
function ensureSchema_(force) {
  if (schemaChecked_ && !force) return;
  schemaChecked_ = true;
  var props = PropertiesService.getScriptProperties();
  // Đổi cấu trúc tab hoặc thêm dòng mặc định mới thì chạy lại
  var signature = JSON.stringify([TABLES.map(function (t) { return [t.name, t.columns]; }),
    DEFAULT_SETTINGS.map(function (s) { return s.key; }), DEFAULT_ACTIVITIES.map(function (a) { return a.name; })]);
  if (!force && props.getProperty(SCHEMA_PROP) === signature) return;

  withLock_(function () {
    var ss = dataFile_();
    TABLES.forEach(function (t, i) { ensureTab_(ss, tableDef_(t.name), i); });
    seedDefaults_();
    ['Sheet1', 'Trang tính1'].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });
  });
  props.setProperty(SCHEMA_PROP, signature);
}

function ensureTab_(ss, def, index) {
  var sh = ss.getSheetByName(def.name);
  var isNew = !sh;
  if (isNew) sh = ss.insertSheet(def.name, index);
  var header = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  while (header.length && !header[header.length - 1]) header.pop();
  var missing = def.cols.filter(function (c) { return header.indexOf(c.name) < 0; });
  if (missing.length) {
    var start = header.length + 1;
    if (sh.getMaxColumns() < start + missing.length - 1) sh.insertColumnsAfter(sh.getMaxColumns(), start + missing.length - 1 - sh.getMaxColumns());
    sh.getRange(1, start, 1, missing.length).setValues([missing.map(function (c) { return c.name; })]);
    missing.forEach(function (c, j) { formatColumn_(sh, start + j, c.type); });
    sh.getRange(1, 1, 1, start + missing.length - 1).setFontWeight('bold');
  }
  if (isNew) {
    sh.setFrozenRows(1);
    var group = GROUPS.filter(function (g) { return g.id === def.group; })[0];
    if (group) sh.setTabColor(group.color);
    if (!def.handEditable) protectTab_(sh);
  }
}

/** Định dạng cả cột (trừ dòng tên cột) theo kiểu: chữ, số, ngày, hay ô tick. */
function formatColumn_(sh, col, type) {
  var rows = sh.getMaxRows() - 1;
  if (rows < 1) return;
  var range = sh.getRange(2, col, rows, 1);
  if (type === 'bool') range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  else range.setNumberFormat(CELL_FORMATS[type] || '@');
}

/** Chỉ tài khoản CLB (chủ file, cũng là tài khoản chạy app) sửa được tab. Người mở file chỉ xem. */
function protectTab_(sh) {
  var p = sh.protect().setDescription('Chỉ app được ghi vào tab này. Muốn sửa thì sửa trong app.');
  var me = Session.getEffectiveUser().getEmail();
  var others = p.getEditors().filter(function (u) { return u.getEmail() !== me; });
  if (others.length) p.removeEditors(others);
  if (p.canDomainEdit()) p.setDomainEdit(false);
}

/** Dòng có sẵn: các ban, các mức trong quy chế, thang điểm. Không ghi đè dòng đã có. */
function seedDefaults_() {
  if (!readTable_('departments').length) insertRecords_('departments', DEFAULT_DEPARTMENTS);
  var have = readTable_('settings').map(function (s) { return s.key; });
  var add = DEFAULT_SETTINGS.filter(function (s) { return have.indexOf(s.key) < 0; });
  if (add.length) insertRecords_('settings', add);
  if (readTable_('activities').length) return;
  var added = insertRecords_('activities', DEFAULT_ACTIVITIES.map(function (a) {
    return { name: a.name, points: a.points, limit_note: a.limit_note, added_date: new Date(), is_active: true };
  }));
  DEFAULT_ACTIVITIES.forEach(function (a, i) {
    if (a.auto && !getSetting_(a.auto + '_activity_id')) updateRecord_('settings', a.auto + '_activity_id', { value: added[i].activity_id });
  });
}

/* ===================== Đọc ===================== */

/**
 * Bản ghi đã đọc trong lần chạy này, theo tab. Mỗi tab chỉ đọc từ sheet một lần mỗi lần chạy;
 * lấy khoá ghi hay ghi vào tab nào thì đọc lại.
 */
var memo_ = {};

function sheet_(name) {
  ensureSchema_();
  var sh = dataFile_().getSheetByName(name);
  if (!sh) { ensureSchema_(true); sh = dataFile_().getSheetByName(name); } // lỡ tay xoá tab thì tạo lại
  if (!sh) throw new Error('Thiếu tab ' + name + ' trong file dữ liệu.');
  return sh;
}

/** Cả tab thành danh sách bản ghi { tên cột: giá trị }. Sửa bản ghi trả về không làm đổi sheet. */
function readTable_(name) {
  var def = tableDef_(name);
  if (!memo_[name]) memo_[name] = rowsToRecords_(def, sheet_(name).getDataRange().getValues());
  return memo_[name].map(function (r) {
    var c = {};
    Object.keys(r).forEach(function (k) { c[k] = r[k]; });
    return c;
  });
}

/** Một bản ghi theo khoá. key: chuỗi nếu khoá một cột, hoặc { cột: giá trị } nếu khoá ghép. Không có thì null. */
function findRecord_(name, key) {
  var def = tableDef_(name);
  var want = keyString_(def, normalizeKey_(def, key));
  var hit = readTable_(name).filter(function (r) { return keyString_(def, r) === want; });
  return hit.length ? hit[0] : null;
}

function normalizeKey_(def, key) {
  if (key !== null && typeof key === 'object') return key;
  if (def.key.length !== 1) throw new Error('Tab ' + def.name + ' có khoá ghép, cần đủ ' + def.key.join(', ') + '.');
  var o = {};
  o[def.key[0]] = key;
  return o;
}

/* ===================== Khoá ghi ===================== */

/**
 * Hai người bấm lưu cùng lúc thì lần lượt từng người ghi, không ai ghi đè hay chen vào dòng của người kia.
 * Gọi lồng nhau trong cùng một lần chạy vẫn được: chỉ lần ngoài cùng mới thật sự khoá.
 */
var lockDepth_ = 0;

function withLock_(work) {
  if (lockDepth_) {
    lockDepth_++;
    try { return work(); } finally { lockDepth_--; }
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Đang có nhiều người lưu cùng lúc. Bạn đợi vài giây rồi thử lại nhé.');
  lockDepth_ = 1;
  memo_ = {}; // người khác có thể vừa ghi trước mình
  try { return work(); }
  finally {
    lockDepth_ = 0;
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

/* ===================== Ghi ===================== */

/** Đảm bảo sheet đủ dòng trước khi ghi xuống cuối (sheet không tự nới khi ghi quá số dòng đang có). */
function ensureRows_(sh, lastRowNeeded) {
  var max = sh.getMaxRows();
  if (lastRowNeeded > max) sh.insertRowsAfter(max, lastRowNeeded - max + 100);
}

/**
 * Thêm dòng. Cột khoá đầu tiên để trống thì app tự cấp mã (cần opts.termId với mã có nhiệm kỳ).
 * Trả về các bản ghi đã thêm, có mã.
 */
function insertRecords_(name, records, opts) {
  if (!records.length) return [];
  opts = opts || {};
  return withLock_(function () {
    var def = tableDef_(name), sh = sheet_(name);
    var values = sh.getDataRange().getValues();
    var header = values[0];
    var added = prepareInsert_(def, rowsToRecords_(def, values), records, opts.termId);
    var rows = added.map(function (rec) { return recordToRow_(def, header, rec); });
    var start = sh.getLastRow() + 1;
    ensureRows_(sh, start + rows.length - 1);
    sh.getRange(start, 1, rows.length, header.length).setValues(rows);
    delete memo_[name];
    return added;
  });
}

/**
 * Sửa một dòng theo khoá. patch: { cột: giá trị mới }; cột khoá không đổi được.
 * opts.action (mã việc trong Nhật ký, ví dụ change_deadline) và opts.actorId: ghi Nhật ký mỗi cột thật sự đổi.
 * Trả về bản ghi sau khi sửa. Không tìm thấy dòng thì báo lỗi.
 */
function updateRecord_(name, key, patch, opts) {
  opts = opts || {};
  return withLock_(function () {
    var def = tableDef_(name), sh = sheet_(name);
    var values = sh.getDataRange().getValues();
    var header = values[0];
    var want = keyString_(def, normalizeKey_(def, key));
    // rowsToRecords_ bỏ dòng trống, nên tìm số dòng thật bằng cách đọc lại từng dòng
    var rowIndex = -1, before = null;
    for (var r = 1; r < values.length && rowIndex < 0; r++) {
      var one = rowsToRecords_(def, [header, values[r]])[0];
      if (one && keyString_(def, one) === want) { rowIndex = r; before = one; }
    }
    if (rowIndex < 0) throw new Error('Không tìm thấy dòng ' + want.split('\u0001').join(' / ') + ' trong tab ' + def.name + '.');
    var changes = diffRecord_(def, before, patch);
    if (!changes.length) return before;
    var after = {};
    Object.keys(before).forEach(function (k) { after[k] = before[k]; });
    changes.forEach(function (c) { after[c.column] = c.newValue; });
    validateRecord_(def, pick_(after, def.names));
    sh.getRange(rowIndex + 1, 1, 1, header.length).setValues([recordToRow_(def, header, after, values[rowIndex])]);
    delete memo_[name];
    if (opts.action) writeAudit_({ actorId: opts.actorId, action: opts.action, table: name, rowId: rowLabel_(def, after) }, changes);
    return after;
  });
}

/**
 * Sửa nhiều dòng cùng tab trong một lần đọc. items: [{ key, patch }]. opts như updateRecord_ (ghi Nhật ký từng cột đổi).
 * Thiếu dòng nào thì báo lỗi và không ghi gì. Trả về các bản ghi sau khi sửa.
 */
function updateRecords_(name, items, opts) {
  opts = opts || {};
  if (!items.length) return [];
  return withLock_(function () {
    var def = tableDef_(name), sh = sheet_(name);
    var values = sh.getDataRange().getValues();
    var header = values[0], rowOf = {};
    for (var r = 1; r < values.length; r++) {
      var one = rowsToRecords_(def, [header, values[r]])[0];
      if (one) rowOf[keyString_(def, one)] = { index: r, rec: one };
    }
    var plan = items.map(function (it) {
      var want = keyString_(def, normalizeKey_(def, it.key));
      if (!rowOf[want]) throw new Error('Không tìm thấy dòng ' + want.split('\u0001').join(' / ') + ' trong tab ' + def.name + '.');
      return { at: rowOf[want], patch: it.patch };
    });
    var out = [], audit = [];
    plan.forEach(function (p) {
      var before = p.at.rec, changes = diffRecord_(def, before, p.patch);
      if (!changes.length) { out.push(before); return; }
      var after = {};
      Object.keys(before).forEach(function (k) { after[k] = before[k]; });
      changes.forEach(function (c) { after[c.column] = c.newValue; });
      validateRecord_(def, pick_(after, def.names));
      sh.getRange(p.at.index + 1, 1, 1, header.length).setValues([recordToRow_(def, header, after, values[p.at.index])]);
      p.at.rec = after;
      out.push(after);
      if (opts.action) audit.push({ rowId: rowLabel_(def, after), changes: changes });
    });
    delete memo_[name];
    if (audit.length) writeAuditMany_(opts.actorId, opts.action, name, audit);
    return out;
  });
}

/**
 * Xoá một dòng theo khoá. Chỉ dùng cho dòng nối nhập nhầm (ví dụ giao task nhầm người); bảng chính không xoá dòng.
 * opts.action và opts.actorId: ghi Nhật ký các cột của dòng bị xoá (giá trị mới để trống).
 */
function deleteRecord_(name, key, opts) {
  opts = opts || {};
  return withLock_(function () {
    var def = tableDef_(name), sh = sheet_(name);
    var values = sh.getDataRange().getValues();
    var header = values[0];
    var want = keyString_(def, normalizeKey_(def, key));
    for (var r = 1; r < values.length; r++) {
      var one = rowsToRecords_(def, [header, values[r]])[0];
      if (!one || keyString_(def, one) !== want) continue;
      sh.deleteRow(r + 1);
      delete memo_[name];
      if (opts.action) {
        var changes = def.names.filter(function (n) { return one[n] !== '' && one[n] !== null && one[n] !== false; })
          .map(function (n) { return { column: n, oldValue: one[n], newValue: '' }; });
        writeAudit_({ actorId: opts.actorId, action: opts.action, table: name, rowId: rowLabel_(def, one) }, changes);
      }
      return one;
    }
    throw new Error('Không tìm thấy dòng ' + want.split('\u0001').join(' / ') + ' trong tab ' + def.name + '.');
  });
}

function pick_(rec, names) {
  var o = {};
  names.forEach(function (n) { o[n] = rec[n]; });
  return o;
}

/* ===================== Nhật ký ===================== */

/** Ghi Nhật ký: mỗi cột đổi một dòng. Chỉ thêm dòng, không bao giờ sửa hay xoá. */
function writeAudit_(info, changes) {
  info.at = info.at || new Date();
  var tz = Session.getScriptTimeZone();
  var rows = auditEntries_(info, changes, function (d) { return Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm'); });
  if (rows.length) insertRecords_('audit_log', rows);
}

/** Ghi Nhật ký cho nhiều dòng một lần. rows: [{ rowId, changes }]. */
function writeAuditMany_(actorId, action, table, rows) {
  var at = new Date(), tz = Session.getScriptTimeZone();
  var fmt = function (d) { return Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm'); };
  var all = [];
  rows.forEach(function (r) { all = all.concat(auditEntries_({ at: at, actorId: actorId, action: action, table: table, rowId: r.rowId }, r.changes, fmt)); });
  if (all.length) insertRecords_('audit_log', all);
}

/* ===================== Cài đặt ===================== */

/** Giá trị một dòng Cài đặt (chữ). Chưa có hoặc trống thì trả về fallback. */
function getSetting_(key, fallback) {
  var row = findRecord_('settings', key);
  return row && row.value !== '' ? row.value : (fallback === undefined ? '' : fallback);
}

/** Giá trị Cài đặt dạng số. Người sửa tay gõ sai thì dùng fallback. */
function getNumberSetting_(key, fallback) {
  var n = Number(String(getSetting_(key, '')).replace(',', '.'));
  return String(getSetting_(key, '')).trim() !== '' && isFinite(n) ? n : fallback;
}

/** Sửa Cài đặt trong app: ghi Nhật ký giá trị cũ và mới (để biết ngưỡng KPI ở từng thời điểm). */
function setSetting_(key, value, actorId, description) {
  return withLock_(function () {
    if (findRecord_('settings', key)) {
      return updateRecord_('settings', key, { value: value }, { actorId: actorId, action: 'change_setting' });
    }
    var rec = insertRecords_('settings', [{ key: key, value: value, description: description || '' }])[0];
    writeAudit_({ actorId: actorId, action: 'change_setting', table: 'settings', rowId: key },
      [{ column: 'value', oldValue: '', newValue: rec.value }]);
    return rec;
  });
}
