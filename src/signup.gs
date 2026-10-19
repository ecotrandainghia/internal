/**
 * Sheet đăng ký log: mỗi sự kiện một Google Sheet, thành viên tích ô buổi mình đi được.
 * BOD tạo sheet từ app (chép file mẫu nếu có, không có thì app tự kẻ bảng), hoặc dán link sheet có sẵn.
 * Link sheet lưu ở Cài đặt, dòng log_signup_<mã sự kiện>. Khi điểm danh, app đọc sheet và tick sẵn người đã đăng ký buổi đó.
 * Sheet chỉ là chỗ đăng ký: số buổi đi thật vẫn là điểm danh trong app.
 */

var SIGNUP_TAB = 'Đăng ký';
var OLD_TOOL_TAB = 'Đăng ký log';
var SIGNUP_PLAN_TAB = 'Kế hoạch';
var SIGNUP_FOLDER = '[APP] Đăng ký log';
var SIGNUP_PLAN_STATUS = ['Chưa có kế hoạch', 'Chưa làm', 'Dang dở', 'Hoàn thành', 'Đã hủy'];
var SIGNUP_HEADERS = {
  name: ['hovaten', 'hoten', 'ten', 'tenthanhvien'], dept: ['ban'], className: ['lop'],
  phone: ['sodienthoai', 'sdt', 'dienthoai'], stt: ['stt', 'sothutu'], quota: ['chitieu']
};

/* ---------- Phần không đụng tới Google ---------- */

/** Bỏ dấu, viết thường, gộp khoảng trắng: "  Nguyễn  Văn Đức " → "nguyen van duc". */
function foldText_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Tên cột để so: bỏ dấu, chỉ giữ chữ và số. "Họ và tên" → "hovaten". */
function headerKey_(s) {
  return foldText_(s).replace(/[^a-z0-9]/g, '');
}

/** Mã file hoặc thư mục trong link Google Drive. Không nhận ra thì trả về ''. */
function idFromUrl_(link) {
  var s = String(link || '').trim();
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /\/folders\/([a-zA-Z0-9_-]{20,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}

/** Số thứ tự cột thành chữ: 1 → A, 27 → AA. */
function colLetter_(n) {
  var s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

/**
 * Tìm dòng tiêu đề (có cột Họ và tên) trong 15 dòng đầu. Trả về { row, cols: { name, dept, ... }, first } (đánh số từ 0),
 * first là cột buổi đầu tiên: ngay sau cột thông tin cuối cùng nhận ra được. Không thấy thì null.
 */
function findSignupHeader_(values) {
  for (var r = 0; r < Math.min(values.length, 15); r++) {
    var cols = {};
    (values[r] || []).forEach(function (v, i) {
      var k = headerKey_(v);
      Object.keys(SIGNUP_HEADERS).forEach(function (f) { if (cols[f] === undefined && SIGNUP_HEADERS[f].indexOf(k) >= 0) cols[f] = i; });
    });
    if (cols.name !== undefined) {
      var last = Math.max.apply(null, Object.keys(cols).map(function (f) { return cols[f]; }));
      return { row: r, cols: cols, first: last + 1 };
    }
  }
  return null;
}

/**
 * Bố cục sheet: oldTool là mẫu của tool tạo file log cũ (tab Đăng ký log: dòng 4 là tên buổi từ cột E, tên ở cột A, ban ở cột C,
 * cột ban gộp ô nên chỉ ô đầu có chữ). Trả về { row, name, dept, first, end, countRow } (đánh số từ 0), end là cột Ghi chú
 * hoặc hết bảng; countRow là dòng đếm số người đăng ký ngay trên tiêu đề (−1 nếu không có). Không nhận ra thì null.
 */
function signupLayoutOf_(values, oldTool) {
  var h = oldTool ? { row: 3, cols: { name: 0, dept: 2 }, first: 4 } : findSignupHeader_(values);
  if (!h) return null;
  var head = values[h.row] || [], end = head.length;
  for (var c = h.first; c < head.length; c++) if (headerKey_(head[c]) === 'ghichu') { end = c; break; }
  var above = h.row > 0 ? values[h.row - 1] || [] : [];
  var countRow = oldTool || headerKey_(above[0]) === 'songuoidangky' ? h.row - 1 : -1;
  return { row: h.row, name: h.cols.name, dept: h.cols.dept, first: h.first, end: end, countRow: countRow };
}

/**
 * Đọc sheet đăng ký. Trả về [{ col, name, people: [{ name, dept }] }] mỗi cột buổi một phần tử (col đánh số từ 0).
 * Ô tích là TRUE. Cột ban gộp ô thì dòng trống lấy ban của dòng trên.
 */
function readSignup_(values, oldTool) {
  var L = signupLayoutOf_(values, oldTool);
  if (!L) return [];
  var head = values[L.row], cols = [];
  for (var c = L.first; c < L.end; c++) {
    var title = String(head[c] == null ? '' : head[c]).trim();
    if (title) cols.push({ col: c, name: title, people: [] });
  }
  var dept = '';
  for (var r = L.row + 1; r < values.length; r++) {
    var line = values[r] || [];
    if (L.dept !== undefined && String(line[L.dept] == null ? '' : line[L.dept]).trim()) dept = String(line[L.dept]).trim();
    var name = String(line[L.name] == null ? '' : line[L.name]).trim();
    if (!name) continue;
    cols.forEach(function (x) {
      var v = line[x.col];
      if (v === true || String(v).toUpperCase() === 'TRUE') x.people.push({ name: name, dept: dept });
    });
  }
  return cols;
}

/** Cột của một buổi trong kết quả readSignup_: so tên không phân biệt dấu, hoa thường, khoảng trắng. */
function signupColumn_(cols, sessionName) {
  var k = foldText_(sessionName);
  return cols.filter(function (x) { return foldText_(x.name) === k; })[0] || null;
}

/**
 * Ghép tên trong sheet với thành viên. people: [{ id, name, dept, deptName }].
 * Trùng tên thì dùng cột Ban (mã hoặc tên ban) để phân biệt. Trả về { ids, unmatched: [tên] }.
 */
function matchSignup_(entries, people) {
  var byName = {};
  people.forEach(function (p) { (byName[foldText_(p.name)] = byName[foldText_(p.name)] || []).push(p); });
  var ids = [], unmatched = [];
  entries.forEach(function (e) {
    var found = byName[foldText_(e.name)] || [];
    if (found.length > 1 && e.dept) {
      var d = foldText_(e.dept);
      found = found.filter(function (p) { return foldText_(p.dept) === d || foldText_(p.deptName) === d; });
    }
    if (found.length === 1) { if (ids.indexOf(found[0].id) < 0) ids.push(found[0].id); }
    else unmatched.push(e.name);
  });
  return { ids: ids, unmatched: unmatched };
}

/** Xếp người theo thứ tự ban (Cơ cấu ban) rồi theo tên. Trả về { people, groups: [{ start, size }] } để gộp ô cột Ban. */
function signupOrder_(people, deptOrder) {
  var pos = {};
  deptOrder.forEach(function (d, i) { pos[d] = i; });
  var list = people.slice().sort(function (a, b) {
    var x = pos[a.dept] === undefined ? 1e6 : pos[a.dept], y = pos[b.dept] === undefined ? 1e6 : pos[b.dept];
    return x - y || a.name.localeCompare(b.name, 'vi');
  });
  var groups = [];
  list.forEach(function (p, i) {
    if (i && p.dept === list[i - 1].dept) groups[groups.length - 1].size++;
    else groups.push({ start: i, size: 1 });
  });
  return { people: list, groups: groups };
}

/**
 * Bảng của sheet đăng ký app tự kẻ (khi không có file mẫu). people đã xếp thứ tự. Ô bắt đầu bằng = là công thức.
 * Dòng 1 tên, dòng 2 hướng dẫn, dòng 3 đếm người đăng ký, dòng 4 tiêu đề, từ dòng 5 là người.
 */
function signupGrid_(eventName, sessionNames, people) {
  var n = sessionNames.length, width = 4 + n + 1, last = 4 + people.length;
  var pad = function (line) { while (line.length < width) line.push(''); return line; };
  var counts = sessionNames.map(function (_, i) {
    var c = colLetter_(5 + i);
    return people.length ? '=COUNTIF(' + c + '5:' + c + last + ',TRUE)' : 0;
  });
  return [
    pad(['Đăng ký log · ' + eventName]),
    pad(['Tích vào buổi bạn đi được. Thời gian, địa điểm từng buổi xem ở tab Kế hoạch. Đừng sửa tên, lớp, ban và tiêu đề cột.']),
    pad(['Số người đăng ký', '', '', ''].concat(counts)),
    ['STT', 'Họ và tên', 'Lớp', 'Ban'].concat(sessionNames, ['Ghi chú'])
  ].concat(people.map(function (p, i) {
    return [i + 1, p.name, p.className || '', p.dept].concat(sessionNames.map(function () { return false; }), ['']);
  }));
}

/* ---------- Đọc dữ liệu app ---------- */

function signupKey_(eventId) { return 'log_signup_' + eventId; }

/** Link sheet đăng ký của sự kiện ('' nếu chưa có). */
function signupUrl_(eventId) {
  return String(getSetting_(signupKey_(eventId), '')).trim();
}

/** Thành viên đi log của nhiệm kỳ (không có BOD), kèm tên ban, xếp theo ban. */
function signupPeople_(data, termId) {
  var names = namesById_(data.members), rows = logPeople_(data.member_terms, termId);
  var depts = readTable_('departments').sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  var deptName = {};
  depts.forEach(function (d) { deptName[d.dept_code] = d.dept_name; });
  return signupOrder_(Object.keys(rows).map(function (id) {
    var r = rows[id];
    return { id: id, name: names[id] || id, dept: r.dept_code, deptName: deptName[r.dept_code] || '', className: r.class_name || '' };
  }), depts.map(function (d) { return d.dept_code; }));
}

function eventSessionNames_(eventId) {
  return readTable_('log_sessions').filter(function (s) { return s.event_id === eventId; })
    .sort(function (a, b) { return a.session_id < b.session_id ? -1 : 1; }).map(function (s) { return String(s.name).trim(); });
}

/* ---------- Google Sheets, Drive ---------- */

function openSheetByUrl_(url, what) {
  var id = idFromUrl_(url);
  if (!id) throw new Error('Link ' + what + ' chưa đúng. Bạn dán link Google Sheet đầy đủ nhé.');
  try { return SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('Không mở được ' + what + '. Kiểm tra link và chia sẻ file cho tài khoản Google của CLB.');
  }
}

function tabByName_(ss, name) {
  var k = foldText_(name);
  return ss.getSheets().filter(function (s) { return foldText_(s.getName()) === k; })[0] || null;
}

/** Tab đăng ký trong file: tab "Đăng ký log" là mẫu tool cũ, không có thì tab đầu tiên. */
function signupTab_(ss) {
  var tab = tabByName_(ss, OLD_TOOL_TAB);
  return { sheet: tab || ss.getSheets()[0], oldTool: !!tab };
}

/** Thư mục lưu sheet: link ở Cài đặt, không có thì thư mục "[APP] Đăng ký log" trong Drive của CLB (chưa có thì tạo). */
function signupFolder_() {
  var url = String(getSetting_('log_folder_url', '')).trim();
  if (url) {
    try { return DriveApp.getFolderById(idFromUrl_(url)); } catch (e) { throw new Error('Không mở được thư mục lưu sheet đăng ký. Kiểm tra lại link ở Cài đặt > Hoạt động CLB.'); }
  }
  var it = DriveApp.getFoldersByName(SIGNUP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SIGNUP_FOLDER);
}

/** Kẻ bảng đăng ký và tab Kế hoạch vào file mới. */
function writeSignupGrid_(ss, eventName, sessionNames, order) {
  var sh = ss.getSheets()[0].setName(SIGNUP_TAB);
  var grid = signupGrid_(eventName, sessionNames, order.people), width = grid[3].length, n = sessionNames.length, count = order.people.length;
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  if (sh.getMaxRows() < grid.length) sh.insertRowsAfter(sh.getMaxRows(), grid.length - sh.getMaxRows());
  sh.getRange(1, 1, grid.length, width).setValues(grid);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sh.getRange(3, 1, 1, width).setFontWeight('bold');
  sh.getRange(4, 1, 1, width).setFontWeight('bold').setBackground('#274e13').setFontColor('#ffffff').setHorizontalAlignment('center');
  if (count) {
    sh.getRange(5, 5, count, n).insertCheckboxes().setHorizontalAlignment('center');
    order.groups.forEach(function (g) { if (g.size > 1) sh.getRange(5 + g.start, 4, g.size, 1).merge().setVerticalAlignment('middle'); });
    sh.getRange(4, 1, count + 1, width).setBorder(true, true, true, true, true, true);
  }
  sh.setFrozenRows(4);
  sh.setFrozenColumns(2);
  // Khoá dạng cảnh báo: ai sửa tên, ban, tiêu đề thì Google hỏi lại; ô tích và Ghi chú thì không.
  var p = sh.protect().setDescription('Chỉ tích ô và ghi chú').setWarningOnly(true);
  if (count) p.setUnprotectedRanges([sh.getRange(5, 5, count, n + 1)]);

  var plan = ss.insertSheet(SIGNUP_PLAN_TAB);
  var head = ['Buổi', 'Thời gian', 'Địa điểm', 'Mục tiêu', 'Trạng thái', 'Ảnh sản phẩm'];
  plan.getRange(1, 1, 1 + n, head.length).setValues([head].concat(sessionNames.map(function (s) { return [s, '', '', '', SIGNUP_PLAN_STATUS[0], '']; })));
  plan.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#274e13').setFontColor('#ffffff');
  if (n) plan.getRange(2, 5, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(SIGNUP_PLAN_STATUS, true).build());
  plan.setFrozenRows(1);
}

/** File mẫu (mẫu của tool tạo file log cũ, có tab Đăng ký log): làm như tool cũ, nhưng không chép số điện thoại vào file ai có link cũng mở được. */
function fillOldToolTemplate_(ss, sh, sessionNames, order) {
  var people = order.people, n = people.length, k = sessionNames.length;
  var noteBg = sh.getRange('F4').getBackground();
  if (k > 1) {
    sh.insertColumnsAfter(5, k - 1);
    var model = sh.getRange(1, 5, sh.getMaxRows(), 1);
    for (var c = 1; c < k; c++) model.copyTo(sh.getRange(1, 5 + c, sh.getMaxRows(), 1));
  }
  var width = 4 + k + 1, lastRow = 4 + n;
  if (sh.getMaxRows() < lastRow) sh.insertRowsAfter(sh.getMaxRows(), lastRow - sh.getMaxRows());
  var head = function (r) { return r.setBackground(noteBg).setFontColor('#000000').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle'); };
  head(sh.getRange(4, 5, 1, k).setValues([sessionNames]));
  head(sh.getRange(4, width).setValue('Ghi chú'));
  if (n) {
    sh.getRange(5, 1, n, 4).setValues(people.map(function (p) { return [p.name, p.className, p.dept, '']; }));
    sh.getRange(5, 5, n, k).insertCheckboxes().setHorizontalAlignment('center');
    order.groups.forEach(function (g) {
      var r = sh.getRange(5 + g.start, 3, g.size, 1);
      if (g.size > 1) r.merge();
      r.setTextRotation(90).setVerticalAlignment('middle').setHorizontalAlignment('center');
    });
    sh.getRange(3, 5, 1, k).setValues([sessionNames.map(function (_, i) { var c = colLetter_(5 + i); return '=COUNTIF(' + c + '5:' + c + lastRow + ',TRUE)'; })]);
    sh.getRange(3, 1, n + 2, width).setBorder(true, true, true, true, true, true);
    sh.protect().setDescription('Chỉ tích ô và ghi chú').setUnprotectedRanges([sh.getRange(5, 5, n, k + 1)]);
  }
}

/** Đọc người đăng ký từ sheet. Trả về { cols (readSignup_), sheet, oldTool, values }. */
function loadSignup_(url) {
  var ss = openSheetByUrl_(url, 'sheet đăng ký');
  var t = signupTab_(ss), values = t.sheet.getDataRange().getValues();
  return { ss: ss, sheet: t.sheet, oldTool: t.oldTool, values: values, cols: readSignup_(values, t.oldTool) };
}

/* ---------- Gọi từ trang web ---------- */

/** Link file mẫu và thư mục lưu sheet đăng ký (Cài đặt > Hoạt động CLB > File mẫu log). */
function logFiles(token) {
  requireUser_(token, 'bod');
  return { templateUrl: String(getSetting_('log_template_url', '')), folderUrl: String(getSetting_('log_folder_url', '')) };
}

/** Lưu link file mẫu và thư mục. Để trống là dùng bảng app tự kẻ, lưu vào thư mục [APP] Đăng ký log. */
function saveLogFiles(token, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  var tpl = String(f.templateUrl || '').trim(), folder = String(f.folderUrl || '').trim();
  if (tpl && !tabByName_(openSheetByUrl_(tpl, 'file mẫu'), OLD_TOOL_TAB)) {
    throw new Error('File mẫu cần có tab “Đăng ký log” như mẫu của tool tạo file log cũ. Không có file mẫu thì để trống, app tự kẻ bảng.');
  }
  if (folder) {
    try { DriveApp.getFolderById(idFromUrl_(folder)).getName(); } catch (e) { throw new Error('Không mở được thư mục. Kiểm tra link và chia sẻ thư mục cho tài khoản Google của CLB.'); }
  }
  setSetting_('log_template_url', tpl, me.memberId);
  setSetting_('log_folder_url', folder, me.memberId);
  return logFiles(token);
}

/** Tạo sheet đăng ký cho sự kiện (sự kiện chưa có sheet). Trả về dữ liệu trang Quản lý log, kèm notice nếu có điều cần báo. */
function createSignupSheet(token, eventId) {
  var me = requireUser_(token, 'bod');
  var x = openEvent_(eventId), ev = x.event, notice = '';
  if (signupUrl_(ev.event_id)) throw new Error('Sự kiện này đã có sheet đăng ký. Muốn dùng sheet khác thì dán link mới.');
  var names = eventSessionNames_(ev.event_id);
  if (!names.length) throw new Error('Sự kiện chưa có buổi log nào. Tạo các buổi dự kiến trước, mỗi buổi là một cột trong sheet.');
  var order = signupPeople_(me.data, x.term.term_id);
  var title = '[APP] Đăng ký log · ' + ev.name, folder = signupFolder_();
  var tpl = String(getSetting_('log_template_url', '')).trim(), ss, file;
  if (tpl) {
    var src = openSheetByUrl_(tpl, 'file mẫu');
    if (!tabByName_(src, OLD_TOOL_TAB)) throw new Error('File mẫu không còn tab “Đăng ký log”. Sửa link ở Cài đặt > Hoạt động CLB > File mẫu log.');
    file = DriveApp.getFileById(src.getId()).makeCopy(title, folder);
    ss = SpreadsheetApp.openById(file.getId());
    fillOldToolTemplate_(ss, tabByName_(ss, OLD_TOOL_TAB), names, order);
  } else {
    ss = SpreadsheetApp.create(title);
    file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
    writeSignupGrid_(ss, ev.name, names, order);
  }
  // Ai có link cũng tích đăng ký được; phần tên, ban đã khoá.
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); }
  catch (e) { notice = 'Chưa mở được quyền cho người có link. Bạn mở sheet, bấm Chia sẻ và cho phép ai có link đều sửa được nhé.'; }
  SpreadsheetApp.flush();
  setSetting_(signupKey_(ev.event_id), ss.getUrl(), me.memberId, 'Sheet đăng ký log của sự kiện ' + ev.name);
  var out = logBoardFor_(me, ev.event_id);
  out.notice = notice;
  return out;
}

/** Dùng sheet có sẵn làm sheet đăng ký của sự kiện. url trống là bỏ liên kết. */
function setSignupLink(token, eventId, url) {
  var me = requireUser_(token, 'bod');
  var ev = openEvent_(eventId).event;
  url = String(url || '').trim();
  if (url) {
    var s = loadSignup_(url);
    if (!s.cols.length) throw new Error('Sheet này không có bảng đăng ký app đọc được: cần một dòng tiêu đề có cột Họ và tên, sau đó mỗi buổi một cột ô tích.');
    url = s.ss.getUrl();
  }
  setSetting_(signupKey_(ev.event_id), url, me.memberId, 'Sheet đăng ký log của sự kiện ' + ev.name);
  return logBoardFor_(me, ev.event_id);
}

/**
 * Người đã đăng ký một buổi theo sheet. Trả về { url, found, ids, unmatched, total }:
 * found false là sheet không có cột trùng tên buổi; unmatched là tên trong sheet không ghép được với thành viên nào.
 */
function signupFor(token, sessionId) {
  var me = requireUser_(token, 'bod');
  var s = sessionOf_(sessionId), url = signupUrl_(s.event_id);
  if (!url) return { url: '', found: false, ids: [], unmatched: [], total: 0 };
  var col = signupColumn_(loadSignup_(url).cols, s.name);
  if (!col) return { url: url, found: false, ids: [], unmatched: [], total: 0 };
  var term = requireTerm_(), people = signupPeople_(me.data, term.term_id).people;
  var m = matchSignup_(col.people, people);
  return { url: url, found: true, ids: m.ids, unmatched: m.unmatched, total: col.people.length };
}

/** Thêm cột cho buổi chưa có trong sheet (buổi tạo sau khi đã có sheet, hoặc đã đổi tên): chèn trước cột Ghi chú. */
function addSignupColumn(token, sessionId) {
  var me = requireUser_(token, 'bod');
  var s = sessionOf_(sessionId);
  openEvent_(s.event_id);
  var url = signupUrl_(s.event_id);
  if (!url) throw new Error('Sự kiện này chưa có sheet đăng ký.');
  var x = loadSignup_(url), name = String(s.name).trim();
  if (signupColumn_(x.cols, name)) return signupFor(token, sessionId);
  var L = signupLayoutOf_(x.values, x.oldTool), sh = x.sheet;
  if (!L) throw new Error('Không nhận ra bảng đăng ký trong sheet.');
  var col = L.end + 1; // đánh số từ 1: ngay chỗ cột Ghi chú (hoặc sau cột cuối)
  if (L.end < (x.values[L.row] || []).length) sh.insertColumnBefore(col);
  else if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
  sh.getRange(L.row + 1, col).setValue(name).setFontWeight('bold').setHorizontalAlignment('center');
  var first = L.row + 2, last = x.values.length;
  if (last >= first) {
    sh.getRange(first, col, last - first + 1, 1).insertCheckboxes().setHorizontalAlignment('center');
    if (L.countRow >= 0) { var c = colLetter_(col); sh.getRange(L.countRow + 1, col).setValue('=COUNTIF(' + c + first + ':' + c + last + ',TRUE)'); }
  }
  var plan = x.oldTool ? null : tabByName_(x.ss, SIGNUP_PLAN_TAB);
  if (plan && headerKey_(plan.getRange(1, 1).getValue()) === 'buoi') plan.appendRow([name, '', '', '', SIGNUP_PLAN_STATUS[0], '']);
  SpreadsheetApp.flush();
  return signupFor(token, sessionId);
}
