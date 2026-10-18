/**
 * Cài đặt > Hệ thống: Nhật ký và Tab dữ liệu, cùng 5 tab xem trong file dữ liệu.
 * Tab xem (tên bắt đầu bằng "Xem -") chỉ để người mở file ra đọc: app tính từ các tab dữ liệu rồi ghi đè cả tab, chữ
 * tiếng Việt, có tên người. Làm mới mỗi đêm, mỗi lần có người mở file trên máy tính (VIEW_OPEN_HANDLER) và bằng nút
 * Làm mới trong app. Vừa làm mới trong VIEW_MIN_GAP_MS hoặc đang có người làm mới thì bỏ qua (trừ nút Làm mới).
 */

var VIEW_OPEN_HANDLER = 'onDataFileOpen';
var VIEW_OPEN_PROP = 'VIEW_OPEN_FILE';
var VIEW_REFRESHED_PROP = 'VIEWS_REFRESHED_AT';
var VIEW_MIN_GAP_MS = 5 * 60e3;
var VIEW_COLOR = '#999999';
var VIEW_TABS = [
  { name: 'Xem - Thành viên', build: membersView_ },
  { name: 'Xem - Task', build: tasksView_ },
  { name: 'Xem - Log', build: logView_ },
  { name: 'Xem - Điểm và KPI', build: pointsView_ },
  { name: 'Xem - Sự kiện', build: eventsView_, head: 2 }
];
var AUDIT_PAGE = 100;

/* ===================== Tính nội dung tab xem ===================== */

function viewDate_(d, withTime) {
  return d && typeof d.getTime === 'function' ? Utilities.formatDate(d, Session.getScriptTimeZone(), withTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy') : '';
}
function viewPercent_(p) { return p === null || p === undefined ? '' : p + '%'; }

/** Thành viên của nhiệm kỳ đang chạy (cả người đã rời), BOD trước, rồi theo ban và tên. */
function viewPeople_(ctx) {
  var termId = String(ctx.term.term_id), members = {};
  ctx.data.members.forEach(function (m) { members[m.member_id] = m; });
  return ctx.data.member_terms.filter(function (r) { return String(r.term_id) === termId && members[r.member_id]; })
    .map(function (r) { return { id: r.member_id, m: members[r.member_id], mt: r }; })
    .sort(function (a, b) {
      var da = a.mt.dept_code === 'BOD' ? '' : a.mt.dept_code, db = b.mt.dept_code === 'BOD' ? '' : b.mt.dept_code;
      return da === db ? a.m.full_name.localeCompare(b.m.full_name, 'vi') : da < db ? -1 : 1;
    });
}

function membersView_(ctx) {
  var termId = String(ctx.term.term_id), kinds = ENUMS['member_labels.label_type'], status = ENUMS['member_terms.status'];
  var rows = viewPeople_(ctx).map(function (p) {
    var labels = activeLabels_(ctx.data.member_labels, p.id, termId, ctx.now).map(function (l) { return kinds[l.label_type] + (l.detail && l.label_type === 'dept_lead' ? ' ' + l.detail : ''); });
    return [p.m.full_name, p.id, p.mt.class_name || '', gradeOf_(p.mt.class_name), p.mt.dept_code || '', p.mt.sub_team || '', p.mt.position || '',
      labels.join(', '), status[p.mt.status] || p.mt.status || ''];
  });
  return [['Họ và tên', 'Mã TV', 'Lớp', 'Khối', 'Ban', 'Mảng', 'Chức vụ', 'Nhãn', 'Trạng thái']].concat(rows);
}

var VIEW_TIMING = { on_time: 'Đúng hạn', late: 'Trễ hạn', not_done: 'Không làm', open: 'Chưa xong' };
var VIEW_RESULT = { pass: 'Đạt', fail: 'Chưa đạt', waiting: 'Chờ chấm' };

function tasksView_(ctx) {
  var termId = String(ctx.term.term_id), termOf = eventTerms_(ctx.events), names = namesById_(ctx.data.members), quality = ENUMS['task_assignments.quality'];
  var events = {}, tasks = {};
  ctx.events.forEach(function (e) { events[e.event_id] = e; });
  ctx.tasks.forEach(function (t) { if (termOf[t.event_id] === termId) tasks[t.task_id] = t; });
  var rows = ctx.assignments.filter(function (a) { return tasks[a.task_id]; }).map(function (a) {
    var t = tasks[a.task_id], timing = taskTiming_(t, a, ctx.now, ctx.rules.notDoneHours);
    return [names[a.member_id] || '', a.member_id, (events[t.event_id] || {}).name || '', t.dept_code || '', t.name, viewDate_(t.deadline, true),
      viewDate_(a.confirmed_at, true), t.is_cancelled ? 'Đã huỷ' : VIEW_TIMING[timing], quality[a.quality] || '',
      t.is_cancelled ? '' : VIEW_RESULT[taskResult_(timing, a.quality)] || '', t.is_counted && !t.is_cancelled ? 'Có' : 'Không'];
  }).sort(function (a, b) { return a[5] === b[5] ? (a[0] < b[0] ? -1 : 1) : (a[5] < b[5] ? 1 : -1); });
  return [['Họ và tên', 'Mã TV', 'Sự kiện', 'Ban', 'Task', 'Hạn chót', 'Lúc xác nhận', 'Đúng hạn', 'Chất lượng', 'Kết quả', 'Tính KPI']].concat(rows);
}

function logView_(ctx) {
  var termId = String(ctx.term.term_id), extra = {};
  ctx.logResults.forEach(function (r) { extra[r.event_id + '|' + r.member_id] = Number(r.extra_sessions) || 0; });
  var rows = [];
  viewPeople_(ctx).filter(function (p) { return p.mt.status === 'active' && p.mt.dept_code !== 'BOD'; }).forEach(function (p) {
    kpiLog_(p.id, p.mt, { events: ctx.events, closings: ctx.closings, sessions: ctx.sessions, attendance: ctx.attendance, quotas: ctx.quotas,
      results: ctx.logResults, termId: termId, from: null, range: null, threshold: ctx.rules.threshold }).list.forEach(function (e) {
      var over = e.closed ? extra[e.eventId + '|' + p.id] || 0 : Math.max(0, e.attended - Math.floor(e.quota + 1e-9));
      rows.push([p.m.full_name, p.id, e.name, p.mt.dept_code, e.quota, e.attended, over, e.attended >= e.quota ? 'Đạt' : 'Chưa đạt', e.closed ? 'Đã chốt' : 'Đang mở']);
    });
  });
  return [['Họ và tên', 'Mã TV', 'Sự kiện', 'Ban', 'Số buổi giao', 'Đã tham gia', 'Buổi vượt', 'Đạt', 'Trạng thái sự kiện']].concat(rows);
}

function pointsView_(ctx) {
  var phase = phaseAt_(ctx.term, ctx.now), head = [['Họ và tên', 'Mã TV', 'Ban', 'Lớp', 'Điểm', 'Hạng', 'Nhóm top', 'KPI log', 'KPI task']];
  if (phase !== 'phase_1' && phase !== 'phase_2') return head.concat([['Nhiệm kỳ đang ở giai đoạn giao thoa, chưa tính điểm và KPI.', '', '', '', '', '', '', '', '']]);
  var s = termSummary_(ctx), rules = ctx.rules;
  var rows = Object.keys(s.people).map(function (id) { return s.people[id]; }).filter(function (p) { return p.points[phase] !== null; }).map(function (p) {
    var r = p.ranks[phase];
    return [p.name, p.id, p.dept, p.className, p.points[phase], r ? r.rank : '', p.top[phase] ? 'Top ' + rules.topPercent + '%' : '',
      viewPercent_(p.kpi.log.percent), viewPercent_(p.kpi.task.percent)];
  }).sort(function (a, b) { return (a[5] || 1e9) - (b[5] || 1e9) || (a[0] < b[0] ? -1 : 1); });
  return head.concat(rows);
}

var VIEW_PHASES = { prep: 'giai đoạn giao thoa', phase_1: 'GD1', phase_2: 'GD2' };

function eventsView_(ctx) {
  var termId = String(ctx.term.term_id), closing = {}, tasks = {}, sessions = {};
  ctx.closings.forEach(function (c) { closing[c.event_id] = c; });
  ctx.tasks.forEach(function (t) { if (!t.is_cancelled) tasks[t.event_id] = (tasks[t.event_id] || 0) + 1; });
  ctx.sessions.forEach(function (s) { sessions[s.event_id] = (sessions[s.event_id] || 0) + 1; });
  var rows = ctx.events.filter(function (e) { return String(e.term_id) === termId; })
    .sort(function (a, b) { return (a.planned_date ? a.planned_date.getTime() : 0) - (b.planned_date ? b.planned_date.getTime() : 0); })
    .map(function (e) {
      var c = closing[e.event_id], closed = c && c.status === 'closed';
      return [e.name, viewDate_(e.planned_date), closed ? 'Đã chốt' : 'Đang mở', closed ? viewDate_(c.closed_at, true) : '', tasks[e.event_id] || 0, sessions[e.event_id] || 0];
    });
  var phase = VIEW_PHASES[phaseAt_(ctx.term, ctx.now)] || '';
  var note = 'Nhiệm kỳ ' + termLabel_(termId) + (phase ? ' đang ở ' + phase : '') + '. Làm mới lúc ' + viewDate_(ctx.now, true) + '.';
  return [[note, '', '', '', '', ''], ['Sự kiện', 'Ngày dự kiến', 'Trạng thái', 'Lúc chốt', 'Số task', 'Số buổi log']].concat(rows);
}

/* ===================== Ghi tab xem ===================== */

/** Ghi đè một tab xem. head: dòng tên cột. Tab mới thì đặt lên đầu, tô xám và khoá. */
function writeView_(ss, index, name, rows, head) {
  var sh = ss.getSheetByName(name), width = rows[0].length;
  if (!sh) {
    sh = ss.insertSheet(name, index);
    sh.setTabColor(VIEW_COLOR);
    protectTab_(sh);
  }
  sh.clear();
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  sh.getRange(1, 1, rows.length, width).setValues(rows);
  sh.getRange(head, 1, 1, width).setFontWeight('bold');
  sh.setFrozenRows(head);
}

/**
 * Làm mới 5 tab xem. force: bỏ qua quy tắc 5 phút (nút Làm mới, việc ban đêm). Trả về lúc làm mới, hoặc null nếu bỏ qua.
 * Không có nhiệm kỳ nào thì chưa có gì để xem.
 */
function refreshViews_(force) {
  var props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache(), now = Date.now();
  if (!force && now - Number(props.getProperty(VIEW_REFRESHED_PROP) || 0) < VIEW_MIN_GAP_MS) return null;
  if (cache.get('views_running')) return null;
  cache.put('views_running', '1', 300);
  try {
    var ctx = summaryContext_();
    if (!ctx.term) return null;
    var ss = dataFile_();
    VIEW_TABS.forEach(function (v, i) { writeView_(ss, i, v.name, v.build(ctx), v.head || 1); });
    props.setProperty(VIEW_REFRESHED_PROP, String(now));
    return now;
  } finally { cache.remove('views_running'); }
}

/** Có người mở file dữ liệu trên máy tính (lịch tự chạy kiểu "khi mở file"). */
function onDataFileOpen() {
  try { refreshViews_(false); } catch (e) { /* lần mở sau làm lại */ }
}

/** Lịch tự chạy khi mở file dữ liệu. Đổi file (khôi phục) thì cài lại cho file mới. */
function ensureViewTrigger_() {
  var props = PropertiesService.getScriptProperties(), id = dataFile_().getId();
  var mine = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === VIEW_OPEN_HANDLER; });
  if (mine.length === 1 && props.getProperty(VIEW_OPEN_PROP) === id) return false;
  mine.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(VIEW_OPEN_HANDLER).forSpreadsheet(id).onOpen().create();
  props.setProperty(VIEW_OPEN_PROP, id);
  return true;
}

/* ===================== Cài đặt > Tab dữ liệu ===================== */

function dataTabsFor_() {
  var ss = dataFile_(), at = Number(PropertiesService.getScriptProperties().getProperty(VIEW_REFRESHED_PROP) || 0);
  var rowsOf = function (name) { var sh = ss.getSheetByName(name); return sh ? Math.max(0, sh.getLastRow() - 1) : null; };
  return {
    views: VIEW_TABS.map(function (v) { return { name: v.name, exists: !!ss.getSheetByName(v.name) }; }),
    refreshedAt: at || null,
    groups: GROUPS.map(function (g) {
      return { label: g.label, color: g.color, tabs: TABLES.filter(function (t) { return t.group === g.id; }).map(function (t) {
        return { name: t.name, label: t.label, rows: rowsOf(t.name), handEditable: !!t.handEditable };
      }) };
    }),
    dataUrl: ss.getUrl()
  };
}

function dataTabs(token) {
  requireUser_(token, 'bod');
  try { ensureViewTrigger_(); } catch (e) { /* lần mở sau cài lại */ }
  return dataTabsFor_();
}

function refreshViewsNow(token) {
  requireUser_(token, 'bod');
  refreshViews_(true);
  return dataTabsFor_();
}

/* ===================== Cài đặt > Nhật ký ===================== */

/**
 * Nhật ký, mới nhất trước, mỗi lần AUDIT_PAGE dòng. f: { action, actor, q (tìm trong bảng, mã dòng, cột, giá trị), before (số dòng đã xem) }.
 * Mật khẩu không bao giờ được ghi vào Nhật ký nên trang này hiện được hết.
 */
function auditLog(token, f) {
  requireUser_(token, 'bod');
  f = f || {};
  var names = namesById_(readTable_('members')), actions = ENUMS['audit_log.action'], labels = {};
  TABLES.forEach(function (t) { labels[t.name] = t.label; });
  var all = readTable_('audit_log').reverse(), actors = {};
  all.forEach(function (a) { if (a.actor_id) actors[a.actor_id] = names[a.actor_id] || a.actor_id; });
  var q = foldText_(String(f.q || '').trim());
  var hits = all.filter(function (a) {
    if (f.action && a.action !== f.action) return false;
    if (f.actor && a.actor_id !== f.actor) return false;
    if (q && foldText_([labels[a.table_name] || a.table_name, a.row_id, a.column_name, a.old_value, a.new_value].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
  var start = Number(f.before) || 0;
  return {
    rows: hits.slice(start, start + AUDIT_PAGE).map(function (a) {
      return { at: a.logged_at ? a.logged_at.getTime() : null, actor: names[a.actor_id] || a.actor_id || 'App', action: actions[a.action] || a.action,
        table: labels[a.table_name] || a.table_name, rowId: String(a.row_id || ''), column: String(a.column_name || ''),
        oldValue: String(a.old_value == null ? '' : a.old_value), newValue: String(a.new_value == null ? '' : a.new_value) };
    }),
    total: hits.length, next: start + AUDIT_PAGE < hits.length ? start + AUDIT_PAGE : null,
    actions: Object.keys(actions).map(function (k) { return { id: k, name: actions[k] }; }),
    actors: Object.keys(actors).map(function (k) { return { id: k, name: actors[k] }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); })
  };
}
