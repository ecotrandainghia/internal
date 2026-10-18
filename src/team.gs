/**
 * Trang Ban phụ trách của NS phụ trách ban (danh sách cần nhắc, log của ban; tab task dùng chung tasks.gs)
 * và lịch nhắc hạn task gửi qua Zalo, app (TB-03, TB-04).
 *
 * Nhắc hạn task: mỗi mốc là một ngày so với ngày hạn chót và một giờ (mặc định 20:30 hôm trước, 6:30 ngày hạn, 6:30 hôm sau),
 * chỉ nhắc người chưa xác nhận xong. Tin đi tới NS phụ trách ban của task để nhắc lại qua Messenger; task của BOD gửi thẳng
 * cho BOD đó; ban chưa có NS phụ trách thì gửi thẳng cho người được giao; ai bật Tự nhắc hạn task thì nhận thêm task của mình.
 */

var REMIND_HANDLER = 'runTaskReminders';
var REMIND_TRIGGERS_PROP = 'REMIND_TRIGGERS';
var REMIND_LAST_PROP = 'REMIND_LAST_RUN';
var DEFAULT_REMIND_TIMES = [{ day: -1, time: '20:30' }, { day: 0, time: '06:30' }, { day: 1, time: '06:30' }];
var MAX_REMIND_HOURS = 6;

/* ===================== Ban phụ trách ===================== */

function requireLead_(token) {
  var me = requireUser_(token);
  if (!me.user.leadDepts.length) throw new Error('Chỉ NS phụ trách ban mới xem được trang này.');
  return me;
}

/**
 * Danh sách cần nhắc (TB-05): theo từng ban phụ trách, task trễ hạn và sắp đến hạn của từng người chưa xác nhận,
 * kèm tên Facebook, lớp để nhắn Messenger. Không soạn sẵn tin.
 */
function teamRemindersFor_(me) {
  var now = new Date(), rules = taskRules_(), term = currentTerm_(readTable_('terms'));
  var termId = term ? String(term.term_id) : '';
  var events = {};
  readTable_('events').forEach(function (e) { if (String(e.term_id) === termId) events[e.event_id] = e.name; });
  var tasks = readTable_('tasks').filter(function (t) { return events[t.event_id] !== undefined && me.user.leadDepts.indexOf(t.dept_code) >= 0; });
  var members = {}, terms = {};
  me.data.members.forEach(function (m) { members[m.member_id] = m; });
  me.data.member_terms.forEach(function (r) { if (String(r.term_id) === termId) terms[r.member_id] = r; });
  var groups = me.user.leadDepts.map(function (d) { return { dept: d, late: [], soon: [] }; });
  urgentAssignments_(tasks, readTable_('task_assignments'), now, rules).forEach(function (x) {
    var m = members[x.assignment.member_id] || {}, mt = terms[x.assignment.member_id] || {};
    var g = groups.filter(function (y) { return y.dept === x.task.dept_code; })[0];
    g[x.status === 'late' ? 'late' : 'soon'].push({
      taskId: x.task.task_id, task: x.task.name, event: events[x.task.event_id] || '', deadline: x.task.deadline.getTime(),
      memberId: x.assignment.member_id, name: m.full_name || x.assignment.member_id, facebook: m.facebook_name || '', facebookUrl: m.facebook_url || '',
      className: mt.class_name || '', subTeam: mt.sub_team || ''
    });
  });
  groups.forEach(function (g) {
    var byDeadline = function (a, b) { return a.deadline - b.deadline || a.name.localeCompare(b.name, 'vi'); };
    g.late.sort(byDeadline); g.soon.sort(byDeadline);
  });
  return { now: now.getTime(), dueSoonDays: rules.dueSoonDays, groups: groups };
}

function teamReminders(token) {
  return teamRemindersFor_(requireLead_(token));
}

/** Log của ban: số buổi đã đi so với số buổi giao của từng người trong các ban mình phụ trách, theo từng sự kiện. */
function teamLog(token) {
  var me = requireLead_(token), ctx = summaryContext_();
  if (!ctx.term) return { people: [], threshold: ctx.rules.threshold };
  var members = {};
  ctx.data.members.forEach(function (m) { members[m.member_id] = m; });
  var people = ctx.data.member_terms.filter(function (r) {
    return String(r.term_id) === String(ctx.term.term_id) && r.status === 'active' && me.user.leadDepts.indexOf(r.dept_code) >= 0 && members[r.member_id];
  }).map(function (r) {
    var m = members[r.member_id], log = kpiOf_(ctx, r.member_id, kpiScopeOf_(ctx, m)).log;
    return { id: r.member_id, name: m.full_name, dept: r.dept_code, subTeam: r.sub_team || '', className: r.class_name || '',
      facebook: m.facebook_name || '', quota: log.quota, attended: log.attended, percent: log.percent, needed: log.needed, events: log.list };
  }).sort(function (a, b) { return a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name, 'vi'); });
  return { people: people, threshold: ctx.rules.threshold };
}

/* ===================== Lịch nhắc hạn task ===================== */

function minuteOf_(time) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}
function timeText_(minute) { return pad_(Math.floor(minute / 60), 2) + ':' + pad_(minute % 60, 2); }

/** Kiểm và chuẩn hoá lịch nhắc: [{ day (-7..7), time 'HH:MM' }], bỏ trùng, xếp theo thứ tự. Sai thì báo lỗi. */
function cleanRemindTimes_(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('Cần ít nhất một mốc nhắc.');
  var seen = {}, out = [];
  list.forEach(function (x) {
    var day = Number(x && x.day), min = minuteOf_(x && x.time);
    if (Math.round(day) !== day || day < -7 || day > 7) throw new Error('Ngày nhắc phải trong khoảng 7 ngày trước hoặc sau hạn chót.');
    if (min < 0) throw new Error('Giờ nhắc phải có dạng 20:30.');
    var k = day + '@' + min;
    if (!seen[k]) { seen[k] = true; out.push({ day: day, time: timeText_(min) }); }
  });
  out.sort(function (a, b) { return a.day - b.day || minuteOf_(a.time) - minuteOf_(b.time); });
  var hours = {};
  out.forEach(function (x) { hours[x.time] = true; });
  if (Object.keys(hours).length > MAX_REMIND_HOURS) throw new Error('Các mốc chỉ được dùng tối đa ' + MAX_REMIND_HOURS + ' giờ khác nhau. Bạn gộp bớt giờ giống nhau nhé.');
  return out;
}

function remindTimes_() {
  try { return cleanRemindTimes_(JSON.parse(String(getSetting_('task_remind_times', '')) || 'null')); } catch (e) { return DEFAULT_REMIND_TIMES.slice(); }
}

/** Số ngày từ ngày a tới ngày b (theo lịch, bỏ giờ). */
function dayGap_(a, b) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
}

function dueText_(deadline, now) {
  var d = dayGap_(now, deadline);
  return d < 0 ? 'trễ ' + (-d) + ' ngày' : d === 0 ? 'hạn hôm nay' : 'còn ' + d + ' ngày';
}

/**
 * Tin nhắc của lần chạy lúc now, cho các mốc có giờ = minute (null: mọi mốc của hôm nay, dùng cho nút Gửi nhắc ngay).
 * Trả về [{ memberId, title, body }], mỗi người nhận một tin.
 */
function taskReminderMessages_(now, minute, times) {
  var slots = times.filter(function (x) { return minute === null || minuteOf_(x.time) === minute; });
  if (!slots.length) return [];
  var term = currentTerm_(readTable_('terms'));
  if (!term) return [];
  var data = peopleData_(), termId = String(term.term_id), names = namesById_(data.members);
  var events = {};
  readTable_('events').forEach(function (e) { if (String(e.term_id) === termId) events[e.event_id] = true; });
  var tasks = {};
  readTable_('tasks').forEach(function (t) {
    if (!events[t.event_id] || t.is_cancelled || !t.deadline) return;
    var gap = dayGap_(t.deadline, now);
    if (slots.some(function (s) { return s.day === gap; })) tasks[t.task_id] = t;
  });
  var rows = {}, accounts = {}, leads = {};
  data.member_terms.forEach(function (r) { if (String(r.term_id) === termId) rows[r.member_id] = r; });
  data.accounts.forEach(function (a) { accounts[a.member_id] = a; });
  data.member_labels.forEach(function (l) {
    if (l.label_type !== 'dept_lead' || !l.detail || !activeLabels_([l], l.member_id, termId, now).length) return;
    if (!rows[l.member_id] || rows[l.member_id].status !== 'active') return;
    (leads[l.detail] = leads[l.detail] || []).push(l.member_id);
  });
  var own = {}, forLead = {};
  readTable_('task_assignments').forEach(function (a) {
    var t = tasks[a.task_id], r = rows[a.member_id];
    if (!t || a.confirmed_at || !r || r.status !== 'active') return;
    var item = { task: t, memberId: a.member_id };
    var deptLeads = (leads[t.dept_code] || []).filter(function (id) { return id !== a.member_id; });
    var self = r.dept_code === 'BOD' || !deptLeads.length || !!(accounts[a.member_id] && accounts[a.member_id].self_remind);
    if (self) (own[a.member_id] = own[a.member_id] || []).push(item);
    if (r.dept_code !== 'BOD') deptLeads.forEach(function (id) { (forLead[id] = forLead[id] || []).push(item); });
  });
  var byDeadline = function (x, y) { return x.task.deadline.getTime() - y.task.deadline.getTime() || (names[x.memberId] || '').localeCompare(names[y.memberId] || '', 'vi'); };
  var line = function (x, withName) {
    var r = rows[x.memberId], who = withName ? (names[x.memberId] || x.memberId) + ' (' + [r.dept_code, r.sub_team, r.class_name].filter(String).join(' · ') + '): ' : '';
    var d = x.task.deadline;
    return '• ' + who + x.task.name + ', hạn ' + pad_(d.getHours(), 2) + ':' + pad_(d.getMinutes(), 2) + ' ' + pad_(d.getDate(), 2) + '/' + pad_(d.getMonth() + 1, 2) +
      ' (' + dueText_(d, now) + ')';
  };
  var out = [];
  Object.keys(rows).forEach(function (id) {
    if (!own[id] && !forLead[id]) return;
    var parts = [];
    if (own[id]) parts.push('Bạn có ' + own[id].length + ' task chưa xác nhận xong:\n' + own[id].sort(byDeadline).map(function (x) { return line(x, false); }).join('\n'));
    if (forLead[id]) parts.push('Nhờ bạn nhắc các bạn sau qua Messenger:\n' + forLead[id].sort(byDeadline).map(function (x) { return line(x, true); }).join('\n'));
    out.push({ memberId: id, title: 'Nhắc hạn task', body: parts.join('\n\n') });
  });
  return out;
}

/** Lần chạy này ứng với giờ nhắc nào (phút trong ngày): tra theo mã lịch, không có thì lấy giờ gần nhất. */
function remindMinuteOf_(e, times) {
  var minutes = times.map(function (x) { return minuteOf_(x.time); });
  try {
    var map = JSON.parse(PropertiesService.getScriptProperties().getProperty(REMIND_TRIGGERS_PROP) || '{}');
    var m = map[String(e && e.triggerUid)];
    if (typeof m === 'number' && minutes.indexOf(m) >= 0) return m;
  } catch (x) { /* tra theo giờ hiện tại */ }
  var now = new Date(), cur = now.getHours() * 60 + now.getMinutes(), best = minutes[0], gap = 1e9;
  minutes.forEach(function (m) { var d = Math.abs(cur - m); d = Math.min(d, 1440 - d); if (d < gap) { gap = d; best = m; } });
  return best;
}

/** Chỉ lịch tự chạy của dự án gọi được (trang web gọi thẳng thì bỏ qua). */
function fromOwnTrigger_(e) {
  if (!e || !e.triggerUid) return false;
  var id = String(e.triggerUid);
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === id; });
}

/** Gửi nhắc hạn task của một mốc giờ (hoặc mọi mốc hôm nay khi minute = null), ghi lại lần chạy cuối. */
function sendTaskReminders_(minute) {
  var times = remindTimes_();
  try { readZaloUpdates_(0); } catch (e) { /* vẫn nhắc những người đã kết nối */ }
  try { dropOldNotifications_(); } catch (e) { /* bỏ qua */ }
  var items = taskReminderMessages_(new Date(), minute, times);
  var r = notifyMembers_(items);
  var last = { at: Date.now(), people: items.length, sent: r.sent, failed: r.failed.slice(0, 5).map(function (f) { return f.name + ': ' + f.why; }) };
  PropertiesService.getScriptProperties().setProperty(REMIND_LAST_PROP, JSON.stringify(last));
  return last;
}

/** Chạy tự động mỗi ngày vào các giờ nhắc. */
function runTaskReminders(e) {
  if (!fromOwnTrigger_(e)) return null;
  return trackJob_('task_reminders', function () { return sendTaskReminders_(remindMinuteOf_(e, remindTimes_())); });
}

/** Cài lịch tự chạy cho đúng các giờ nhắc (cài lại khi lịch đổi). Gọi được nhiều lần. */
function ensureReminderTriggers_() {
  var minutes = [];
  remindTimes_().forEach(function (x) { var m = minuteOf_(x.time); if (minutes.indexOf(m) < 0) minutes.push(m); });
  var props = PropertiesService.getScriptProperties(), map = {};
  try { map = JSON.parse(props.getProperty(REMIND_TRIGGERS_PROP) || '{}'); } catch (e) { map = {}; }
  var mine = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === REMIND_HANDLER; });
  var have = mine.map(function (t) { return map[t.getUniqueId()]; }).sort().join(','), want = minutes.slice().sort().join(',');
  if (have === want && mine.length === minutes.length) return false;
  mine.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  var next = {};
  minutes.forEach(function (m) {
    var t = ScriptApp.newTrigger(REMIND_HANDLER).timeBased().atHour(Math.floor(m / 60)).nearMinute(m % 60).everyDays(1)
      .inTimezone(Session.getScriptTimeZone()).create();
    next[t.getUniqueId()] = m;
  });
  props.setProperty(REMIND_TRIGGERS_PROP, JSON.stringify(next));
  return true;
}

function remindView_() {
  var last = null;
  try { last = JSON.parse(PropertiesService.getScriptProperties().getProperty(REMIND_LAST_PROP) || 'null'); } catch (e) { last = null; }
  return { times: remindTimes_(), last: last, maxHours: MAX_REMIND_HOURS };
}

/** Cài đặt > Thông báo của CLB > Lịch nhắc task. */
function taskReminderSettings(token) {
  requireUser_(token, 'bod');
  ensureReminderTriggers_();
  return remindView_();
}

function saveTaskReminders(token, list) {
  var me = requireUser_(token, 'bod');
  var times = cleanRemindTimes_(list);
  setSetting_('task_remind_times', JSON.stringify(times), me.memberId,
    'Các mốc nhắc hạn task: day là số ngày so với ngày hạn chót (-1 là hôm trước), time là giờ nhắc');
  ensureReminderTriggers_();
  return remindView_();
}

/** BOD bấm Gửi nhắc ngay: gửi mọi mốc của hôm nay. */
function sendRemindersNow(token) {
  requireUser_(token, 'bod');
  sendTaskReminders_(null);
  return remindView_();
}
