/**
 * Cài đặt > Hệ thống: việc tự chạy, sao lưu và khôi phục, lưu trữ nhiệm kỳ cũ.
 * - Mỗi đêm lúc 2 giờ (runNightly): sao lưu file dữ liệu (giữ BACKUP_KEEP bản), chuyển dữ liệu nhiệm kỳ đã kết thúc hơn
 *   ARCHIVE_AFTER_DAYS ngày sang file lưu trữ, dọn phiên đăng nhập hết hạn, kiểm tra dung lượng file.
 * - Mọi việc tự chạy ghi lần chạy cuối vào JOB_STATUS_PROP; chạy lỗi thì báo BOD qua Zalo hoặc app (mỗi việc tối đa
 *   một tin mỗi ngày).
 */

var NIGHTLY_HANDLER = 'runNightly';
var NIGHTLY_HOUR = 2;
var JOB_STATUS_PROP = 'JOB_STATUS';
var BACKUP_LIST_PROP = 'BACKUP_LIST';
var SIZE_ALERT_PROP = 'SIZE_ALERT_AT';
var BACKUP_FOLDER = 'Sao lưu';
var ARCHIVE_FOLDER = 'Lưu trữ';
var BACKUP_KEEP = 30;
var ARCHIVE_AFTER_DAYS = 365;
var SHEET_CELL_LIMIT = 10000000;
var SIZE_ALERT_RATIO = 0.7;

/** Các việc tự chạy, theo thứ tự hiện ở trang Tình trạng hệ thống. onDemand: tự cài khi có người cần, chưa cài là bình thường. */
var JOBS = [
  { id: 'nightly', handler: NIGHTLY_HANDLER, name: 'Việc ban đêm', when: '2 giờ sáng mỗi ngày', what: 'Sao lưu, lưu trữ nhiệm kỳ cũ, làm mới tab xem, dọn phiên đăng nhập, kiểm tra dung lượng' },
  { id: 'task_reminders', handler: 'runTaskReminders', name: 'Nhắc hạn task', when: 'Theo Lịch nhắc task', what: 'Nhắc người sắp đến hạn và trễ hạn, xoá thông báo cũ' },
  { id: 'birthday', handler: 'runBirthdayReminders', name: 'Nhắc sinh nhật', when: 'Mỗi ngày theo giờ nhắc sinh nhật', what: 'Báo NS phụ trách sinh nhật' },
  { id: 'seeding', handler: 'runSeedingReminders', name: 'Nhắc seeding', when: 'Mỗi 15 phút', what: 'Nhắc người đặt hẹn ghi nhận seeding', onDemand: true },
  { id: 'mail_sends', handler: 'runScheduledSends', name: 'Gửi thư hẹn giờ', when: 'Mỗi 10 phút', what: 'Gửi các thư đã đến giờ hẹn', onDemand: true }
];

/** Tab chuyển sang file lưu trữ và cách biết một dòng thuộc nhiệm kỳ nào: cột term_id, mã có nhiệm kỳ, hoặc thời điểm. */
var ARCHIVE_TABLES = [
  ['roster_uploads', 'term_id'], ['events', 'term_id'], ['event_closings', 'event_id'], ['tasks', 'task_id'],
  ['task_assignments', 'task_id'], ['log_sessions', 'session_id'], ['log_quotas', 'event_id'], ['attendance', 'session_id'],
  ['log_results', 'event_id'], ['point_entries', 'entry_id'], ['seeding_posts', 'post_id'], ['feedback', 'feedback_id'],
  ['mail_requests', 'request_id'], ['mail_sends', 'send_id'], ['audit_log', 'time:logged_at']
];

/* ===================== Ghi lần chạy, báo lỗi ===================== */

function jobStatus_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(JOB_STATUS_PROP) || '{}'); } catch (e) { return {}; }
}

/**
 * Chạy một việc tự chạy và ghi lại kết quả. Lỗi thì báo BOD (mỗi việc tối đa một tin mỗi ngày) rồi ném lỗi tiếp,
 * để Nhật ký thực thi của Apps Script cũng thấy.
 */
function trackJob_(id, fn) {
  var started = Date.now(), result, error = null;
  try { result = fn(); } catch (e) { error = e; }
  var props = PropertiesService.getScriptProperties(), all = jobStatus_(), prev = all[id] || {};
  var msg = error ? String(error && error.message || error) : jobSummary_(result);
  all[id] = { at: started, ok: !error, msg: msg.slice(0, 300), alertedAt: prev.alertedAt || 0 };
  if (error && started - all[id].alertedAt > 864e5) {
    all[id].alertedAt = started;
    var job = JOBS.filter(function (j) { return j.id === id; })[0];
    notifyQuietly_(bodIds_().map(function (m) {
      return { memberId: m, title: 'App gặp lỗi khi tự chạy', body: (job ? job.name : id) + ': ' + msg + '\nXem ở Cài đặt, Hệ thống, Tình trạng hệ thống.' };
    }));
  }
  props.setProperty(JOB_STATUS_PROP, JSON.stringify(all));
  if (error) throw error;
  return result;
}

/** Tóm tắt kết quả một lần chạy thành một dòng chữ. */
function jobSummary_(r) {
  if (r === null || r === undefined) return 'Không có việc cần làm';
  if (typeof r === 'string') return r || 'Xong';
  if (typeof r === 'number') return r ? 'Đã xử lý ' + r + ' lượt' : 'Không có việc cần làm';
  if (typeof r.sent === 'number') return 'Đã gửi ' + r.sent + ' tin' + (r.failed && r.failed.length ? ', ' + r.failed.length + ' tin lỗi' : '');
  if (r.text) return r.text;
  return 'Xong';
}

/* ===================== Dọn phần còn lại của app trước ===================== */

/** Thuộc tính dự án do app trước dùng (cùng dự án Apps Script này): tên đúng và tiền tố. */
var OLD_APP_PROPS = ['CauTrucBang', 'ThuMucGocId', 'VapidRieng', 'baoDungLuong', 'IdFileDuLieu'];
var OLD_APP_PROP_PREFIXES = ['bimat_', 'chaycuoi_', 'phien_', 'baoloi_'];

/**
 * Lúc cài đặt lần đầu: bỏ lịch tự chạy gọi hàm không còn trong app (để Google khỏi báo lỗi mỗi ngày) và các thuộc tính
 * của app trước (phiên đăng nhập, mã bí mật cũ). File dữ liệu cũ trên Drive giữ nguyên, không đụng tới.
 */
function dropOldAppLeftovers_() {
  var known = JOBS.map(function (j) { return j.handler; }).concat([VIEW_OPEN_HANDLER]);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (known.indexOf(t.getHandlerFunction()) < 0) ScriptApp.deleteTrigger(t); });
  var props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (OLD_APP_PROPS.indexOf(k) >= 0 || OLD_APP_PROP_PREFIXES.some(function (p) { return k.indexOf(p) === 0; })) props.deleteProperty(k);
  });
}

/* ===================== Việc ban đêm ===================== */

/** Lịch chạy mỗi đêm lúc 2 giờ. Gọi được nhiều lần. */
function ensureNightlyTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === NIGHTLY_HANDLER; });
  if (has) return false;
  ScriptApp.newTrigger(NIGHTLY_HANDLER).timeBased().atHour(NIGHTLY_HOUR).everyDays(1).inTimezone(Session.getScriptTimeZone()).create();
  return true;
}

function runNightly(e) {
  if (!fromOwnTrigger_(e)) return null;
  return trackJob_('nightly', nightlyWork_);
}

/** Các bước độc lập: bước này hỏng thì bước sau vẫn chạy; cuối cùng gộp lỗi lại. */
function nightlyWork_() {
  var done = [], errors = [];
  var step = function (name, fn) {
    try { var r = fn(); if (r) done.push(r); } catch (x) { errors.push(name + ': ' + (x && x.message || x)); }
  };
  step('Sao lưu', function () { return 'Sao lưu ' + backupNow_().name; });
  step('Lưu trữ', function () { var t = archiveOldTerms_(new Date()); return t.length ? 'Lưu trữ nhiệm kỳ ' + t.map(termLabel_).join(', ') : ''; });
  step('Tab xem', function () { refreshViews_(true); return ''; });
  step('Phiên đăng nhập', function () { dropExpiredSessions_(); return ''; });
  step('Dung lượng', function () { return 'File dùng ' + checkSize_().percent + '% sức chứa'; });
  if (errors.length) throw new Error(errors.join(' | '));
  return { text: done.join('. ') };
}

/* ===================== Sao lưu ===================== */

function appFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/** Các bản sao lưu, mới nhất trước: [{ id, name, at }]. */
function backups_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(BACKUP_LIST_PROP) || '[]'); } catch (e) { return []; }
}

/** Chép file dữ liệu vào thư mục Sao lưu, bỏ bớt bản cũ chỉ giữ BACKUP_KEEP bản. Trả về bản mới. */
function backupNow_() {
  var now = new Date();
  var name = '[APP] Sao lưu ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  var copy = DriveApp.getFileById(dataFile_().getId()).makeCopy(name, appFolder_(BACKUP_FOLDER));
  var list = [{ id: copy.getId(), name: name, at: now.getTime() }].concat(backups_());
  list.slice(BACKUP_KEEP).forEach(function (b) { try { DriveApp.getFileById(b.id).setTrashed(true); } catch (x) { /* đã bị xoá tay */ } });
  PropertiesService.getScriptProperties().setProperty(BACKUP_LIST_PROP, JSON.stringify(list.slice(0, BACKUP_KEEP)));
  return list[0];
}

/* ===================== Lưu trữ nhiệm kỳ cũ ===================== */

/** Mốc kết thúc của từng nhiệm kỳ: lúc nhiệm kỳ sau bắt đầu chuẩn bị (BOD bấm Kết thúc nhiệm kỳ). Nhiệm kỳ đang chạy không có. */
function termEnds_(terms) {
  var list = terms.filter(function (t) { return t.term_id && t.prep_start_at; })
    .sort(function (a, b) { return a.prep_start_at.getTime() - b.prep_start_at.getTime(); });
  var out = {};
  list.forEach(function (t, i) { out[t.term_id] = { start: t.prep_start_at, end: list[i + 1] ? list[i + 1].prep_start_at : null }; });
  return out;
}

/** Nhiệm kỳ của một dòng: theo cột term_id, theo mã có nhiệm kỳ (T-2627-0042), hoặc theo thời điểm nằm trong nhiệm kỳ. */
function archiveTermOf_(row, how, ends) {
  if (how.indexOf('time:') === 0) {
    var d = row[how.slice(5)];
    if (!d || typeof d.getTime !== 'function') return '';
    var hit = '';
    Object.keys(ends).forEach(function (id) { var e = ends[id]; if (d >= e.start && (!e.end || d < e.end)) hit = id; });
    return hit;
  }
  var v = String(row[how] || '');
  if (how === 'term_id') return v;
  var m = /^[A-Z]+-(\d{4})-\d+$/.exec(v);
  return m ? m[1] : '';
}

/** Nhiệm kỳ đã kết thúc hơn ARCHIVE_AFTER_DAYS ngày mà chưa lưu trữ. */
function termsToArchive_(terms, now) {
  var ends = termEnds_(terms), cut = now.getTime() - ARCHIVE_AFTER_DAYS * 864e5;
  return terms.filter(function (t) { var e = ends[t.term_id]; return !t.archived_at && e && e.end && e.end.getTime() < cut; })
    .map(function (t) { return String(t.term_id); }).sort();
}

/** Chuyển dữ liệu các nhiệm kỳ cũ sang file lưu trữ. Trả về các nhiệm kỳ đã chuyển. */
function archiveOldTerms_(now) {
  var due = termsToArchive_(readTable_('terms'), now);
  due.forEach(archiveTerm_);
  return due;
}

/**
 * Tạo "[APP] Lưu trữ nhiệm kỳ 2627" trong thư mục Lưu trữ, mỗi tab chép sang một tab cùng tên. Ghi sang trước, đếm lại
 * đủ dòng rồi mới bỏ ở file chính; thiếu thì dừng, file chính giữ nguyên.
 */
function archiveTerm_(termId) {
  withLock_(function () {
    var ends = termEnds_(readTable_('terms')), ss = SpreadsheetApp.create('[APP] Lưu trữ nhiệm kỳ ' + termId);
    DriveApp.getFileById(ss.getId()).moveTo(appFolder_(ARCHIVE_FOLDER));
    var first = ss.getSheets()[0], plans = [];
    ARCHIVE_TABLES.forEach(function (t) {
      var name = t[0], def = tableDef_(name), values = sheet_(name).getDataRange().getValues(), header = values[0], move = [], keep = [];
      values.slice(1).forEach(function (line) {
        var rec = rowsToRecords_(def, [header, line])[0];
        (rec && archiveTermOf_(rec, t[1], ends) === termId ? move : keep).push(line);
      });
      if (!move.length) return;
      var sh = ss.insertSheet(name), width = header.length;
      if (sh.getMaxRows() < move.length + 1) sh.insertRowsAfter(sh.getMaxRows(), move.length + 1 - sh.getMaxRows());
      if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
      sh.getRange(1, 1, move.length + 1, width).setValues([header].concat(move));
      sh.setFrozenRows(1);
      plans.push({ name: name, sh: sh, moved: move.length, keep: keep, total: values.length - 1, width: width });
    });
    plans.forEach(function (p) {
      if (p.sh.getLastRow() - 1 !== p.moved) throw new Error('File lưu trữ nhiệm kỳ ' + termId + ' thiếu dòng ở tab ' + p.name + ', chưa xoá gì ở file chính.');
    });
    if (plans.length) ss.deleteSheet(first);
    plans.forEach(function (p) {
      // Ghi các dòng còn giữ lên trên, phần dưới để trống (nhanh hơn xoá từng dòng).
      var blank = [], rows = p.keep.slice();
      for (var i = 0; i < p.width; i++) blank.push('');
      while (rows.length < p.total) rows.push(blank.slice());
      sheet_(p.name).getRange(2, 1, rows.length, p.width).setValues(rows);
      delete memo_[p.name];
    });
    updateRecord_('terms', termId, { archive_file_id: ss.getId(), archived_at: new Date() });
  });
}

/* ===================== Dung lượng ===================== */

/** Số ô file dữ liệu đang chiếm so với giới hạn 10 triệu ô của Google Sheets. */
function dataSize_() {
  var cells = 0;
  dataFile_().getSheets().forEach(function (sh) { cells += sh.getMaxRows() * sh.getMaxColumns(); });
  return { cells: cells, limit: SHEET_CELL_LIMIT, percent: Math.round(cells * 100 / SHEET_CELL_LIMIT) };
}

/** Gần đầy thì báo BOD, tối đa mỗi tuần một lần. */
function checkSize_() {
  var s = dataSize_(), props = PropertiesService.getScriptProperties();
  if (s.cells >= SHEET_CELL_LIMIT * SIZE_ALERT_RATIO && Date.now() - Number(props.getProperty(SIZE_ALERT_PROP) || 0) > 7 * 864e5) {
    props.setProperty(SIZE_ALERT_PROP, String(Date.now()));
    notifyQuietly_(bodIds_().map(function (m) {
      return { memberId: m, title: 'File dữ liệu của app sắp đầy', body: 'File dữ liệu đang dùng ' + s.percent + '% sức chứa của Google Sheets. ' +
        'App tự chuyển dữ liệu nhiệm kỳ đã xong hơn một năm sang file lưu trữ. Xem ở Cài đặt, Hệ thống.' };
    }));
  }
  return s;
}

/* ===================== Trang Cài đặt, Hệ thống ===================== */

function systemPageFor_() {
  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }), status = jobStatus_();
  return {
    jobs: JOBS.map(function (j) {
      var s = status[j.id] || null;
      return { id: j.id, name: j.name, when: j.when, what: j.what, onDemand: !!j.onDemand, installed: triggers.indexOf(j.handler) >= 0,
        last: s ? { at: s.at, ok: s.ok, msg: s.msg } : null };
    }),
    backups: backups_(),
    keep: BACKUP_KEEP,
    archives: readTable_('terms').filter(function (t) { return t.archive_file_id; }).map(function (t) {
      return { term: termLabel_(t.term_id), url: 'https://docs.google.com/spreadsheets/d/' + t.archive_file_id, at: t.archived_at ? t.archived_at.getTime() : null };
    }),
    archiveAfterDays: ARCHIVE_AFTER_DAYS,
    size: dataSize_(),
    dataUrl: dataFile_().getUrl()
  };
}

/** Tình trạng hệ thống, Sao lưu và khôi phục. Mở trang thì cài lại lịch chạy còn thiếu. */
function systemPage(token) {
  requireUser_(token, 'bod');
  try { ensureNightlyTrigger_(); ensureViewTrigger_(); ensureRemindersQuietly_(); } catch (e) { /* trang vẫn hiện, ghi chưa cài */ }
  return systemPageFor_();
}

function backupNowByBod(token) {
  var me = requireUser_(token, 'bod');
  var b = backupNow_();
  writeAudit_({ actorId: me.memberId, action: 'backup_restore', table: 'settings', rowId: 'backup' }, [{ column: 'value', oldValue: '', newValue: 'Sao lưu ngay: ' + b.name }]);
  return systemPageFor_();
}

/**
 * Khôi phục: chép một bản sao lưu thành file dữ liệu mới và dùng file đó. File đang dùng đổi tên "(trước khôi phục ...)"
 * và giữ lại trên Drive, không bị xoá. Mọi dữ liệu sau lúc sao lưu mất khỏi app (vẫn còn trong file cũ).
 */
function restoreBackup(token, backupId) {
  var me = requireUser_(token, 'bod');
  var b = backups_().filter(function (x) { return x.id === String(backupId || ''); })[0];
  if (!b) throw new Error('Không tìm thấy bản sao lưu này.');
  return withLock_(function () {
    var src;
    try { src = DriveApp.getFileById(b.id); } catch (e) { throw new Error('Bản sao lưu này đã bị xoá khỏi Drive.'); }
    var old = DriveApp.getFileById(dataFile_().getId()), stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
    var fresh = src.makeCopy(DATA_FILE_NAME, DriveApp.getRootFolder());
    old.setName(DATA_FILE_NAME + ' (trước khôi phục ' + stamp + ')');
    useDataFile_(fresh.getId());
    try { ensureViewTrigger_(); } catch (e) { /* mở trang Hệ thống thì cài lại */ }
    writeAudit_({ actorId: me.memberId, action: 'backup_restore', table: 'settings', rowId: 'backup' },
      [{ column: 'value', oldValue: old.getName(), newValue: 'Khôi phục từ ' + b.name }]);
    return b.name;
  });
}
