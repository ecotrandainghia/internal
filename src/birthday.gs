/**
 * Sinh nhật: trang cho người phụ trách sinh nhật (và BOD), tin nhắc sinh nhật gửi qua Zalo hoặc app, và lịch sinh nhật trên
 * Google Calendar CLB. Lịch vẫn có để cả CLB xem, nhưng mọi sự kiện tắt hết nhắc của Calendar: tin nhắc do app gửi.
 * Mỗi sự kiện mang thẻ eco_member (Mã TV) và eco_key (ngày, tên, mô tả) nên app nhận ra sự kiện của mình mà không cần thêm cột.
 */

var BIRTHDAY_HANDLER = 'runBirthdayReminders';
var BIRTHDAY_TRIGGER_PROP = 'BIRTHDAY_TRIGGER';
var BIRTHDAY_SYNC_PROP = 'BIRTHDAY_LAST_SYNC';
var BIRTHDAY_DEFAULT_DAYS = 1;
var BIRTHDAY_DEFAULT_TIME = '07:00';
var BIRTHDAY_MAX_DAYS = 14;
var BIRTHDAY_SYNC_MS = 240000;

/* ---------- Ngày sinh (không đụng tới Google) ---------- */

/** Ngày sinh nhật năm y: 29/2 thì năm không nhuận lấy 28/2. */
function birthdayIn_(y, month, day) {
  if (month === 2 && day === 29 && new Date(y, 1, 29).getMonth() !== 1) day = 28;
  return new Date(y, month - 1, day);
}

/** Còn mấy ngày tới sinh nhật kế tiếp (0 là hôm nay). */
function daysToBirthday_(now, month, day) {
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var next = birthdayIn_(now.getFullYear(), month, day);
  if (next < today) next = birthdayIn_(now.getFullYear() + 1, month, day);
  return dayGap_(today, next);
}

/** Người đang ở CLB trong nhiệm kỳ (kể cả BOD) có ngày sinh: [{ id, name, dept, className, facebookUrl, month, day }]. Thiếu ngày sinh đếm riêng. */
function birthdayPeople_(data, termId) {
  var info = {}, out = [], missing = [];
  data.members.forEach(function (m) { info[m.member_id] = m; });
  data.member_terms.forEach(function (r) {
    if (String(r.term_id) !== String(termId) || r.status !== 'active' || !info[r.member_id]) return;
    var m = info[r.member_id], d = m.birth_date;
    if (!d || typeof d.getTime !== 'function' || isNaN(d.getTime())) { missing.push(m.full_name); return; }
    out.push({ id: m.member_id, name: m.full_name, dept: r.dept_code || '', className: r.class_name || '', facebookUrl: m.facebook_url || '',
      month: d.getMonth() + 1, day: d.getDate() });
  });
  out.sort(function (a, b) { return a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, 'vi'); });
  return { people: out, missing: missing };
}

/** Sinh nhật trong days ngày tới (tính cả hôm nay), gần trước. */
function upcomingBirthdays_(people, now, days) {
  return people.map(function (p) {
    var x = {};
    Object.keys(p).forEach(function (k) { x[k] = p[k]; });
    x.inDays = daysToBirthday_(now, p.month, p.day);
    return x;
  }).filter(function (p) { return p.inDays <= days; }).sort(function (a, b) { return a.inDays - b.inDays || a.name.localeCompare(b.name, 'vi'); });
}

function birthdaySettings_() {
  var days = Number(getSetting_('birthday_remind_days', BIRTHDAY_DEFAULT_DAYS));
  var time = String(getSetting_('birthday_remind_time', BIRTHDAY_DEFAULT_TIME));
  return {
    days: days >= 0 && days <= BIRTHDAY_MAX_DAYS && Math.floor(days) === days ? days : BIRTHDAY_DEFAULT_DAYS,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : BIRTHDAY_DEFAULT_TIME,
    calendarId: String(getSetting_('birthday_calendar_id', '') || '').trim()
  };
}

/** Người nhận tin nhắc sinh nhật: người phụ trách sinh nhật đang có nhãn; chưa có ai thì BOD, để không bị sót. */
function birthdayLeads_(data, termId, now) {
  var ids = [];
  data.member_labels.forEach(function (l) {
    if (l.label_type === 'birthday_lead' && ids.indexOf(l.member_id) < 0 && activeLabels_([l], l.member_id, termId, now).length) ids.push(l.member_id);
  });
  return ids.length ? { ids: ids, bod: false } : { ids: bodIds_(data), bod: true };
}

/** Tin nhắc sinh nhật của hôm nay: một tin cho mỗi người nhận, liệt kê sinh nhật hôm nay và trong mấy ngày tới. */
function birthdayReminderMessages_(now, data) {
  data = data || peopleData_();
  var term = currentTerm_(readTable_('terms'));
  if (!term) return [];
  var set = birthdaySettings_(), list = upcomingBirthdays_(birthdayPeople_(data, term.term_id).people, now, set.days);
  if (!list.length) return [];
  var when = function (p) { return p.inDays === 0 ? 'hôm nay' : p.inDays === 1 ? 'ngày mai' : 'còn ' + p.inDays + ' ngày'; };
  var body = list.map(function (p) {
    return '• ' + p.name + ' (' + [p.dept, p.className].filter(String).join(' · ') + '): ' + pad_(p.day, 2) + '/' + pad_(p.month, 2) + ', ' + when(p) +
      (p.facebookUrl ? '\n  ' + p.facebookUrl : '');
  }).join('\n');
  var to = birthdayLeads_(data, term.term_id, now);
  return to.ids.map(function (id) {
    return { memberId: id, title: 'Nhắc sinh nhật', body: (to.bod ? 'CLB chưa có người phụ trách sinh nhật nên app gửi BOD.\n' : '') + body };
  });
}

/* ---------- Trang Sinh nhật ---------- */

function requireBirthdayLead_(token) {
  var me = requireUser_(token);
  if (!me.user.isBod && me.user.labels.indexOf('birthday_lead') < 0) throw new Error('Chỉ người phụ trách sinh nhật (hoặc BOD) mới xem được trang này.');
  return me;
}

function birthdayPageFor_(me) {
  var now = new Date(), term = currentTerm_(readTable_('terms')), set = birthdaySettings_();
  var all = term ? birthdayPeople_(me.data, term.term_id) : { people: [], missing: [] };
  var sync = null;
  try { sync = JSON.parse(PropertiesService.getScriptProperties().getProperty(BIRTHDAY_SYNC_PROP) || 'null'); } catch (e) { sync = null; }
  return {
    now: now.getTime(), isBod: me.user.isBod, days: set.days, time: set.time, maxDays: BIRTHDAY_MAX_DAYS,
    calendarId: me.user.isBod ? set.calendarId : '', hasCalendar: !!set.calendarId, sync: me.user.isBod ? sync : null,
    soon: upcomingBirthdays_(all.people, now, 30), people: all.people, missing: all.missing
  };
}

function birthdayPage(token) {
  return birthdayPageFor_(requireBirthdayLead_(token));
}

/** BOD lưu cách nhắc (trước mấy ngày, lúc mấy giờ) và lịch Google. Đổi lịch thì đồng bộ ngay. */
function saveBirthdaySettings(token, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  var days = Number(f.days), time = String(f.time || ''), cal = String(f.calendarId || '').trim();
  if (!(days >= 0 && days <= BIRTHDAY_MAX_DAYS && Math.floor(days) === days)) throw new Error('Số ngày nhắc trước từ 0 đến ' + BIRTHDAY_MAX_DAYS + '.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Giờ nhắc chưa đúng (ví dụ 07:00).');
  if (cal) birthdayCalendar_(cal);
  var before = birthdaySettings_();
  setSetting_('birthday_remind_days', String(days), me.memberId, 'Nhắc sinh nhật trước mấy ngày (0 là chỉ nhắc đúng ngày)');
  setSetting_('birthday_remind_time', time, me.memberId, 'Giờ app gửi tin nhắc sinh nhật mỗi ngày');
  setSetting_('birthday_calendar_id', cal, me.memberId, 'ID Google Calendar ghi sinh nhật thành viên. Để trống là không dùng lịch');
  ensureBirthdayTrigger_();
  var out = birthdayPageFor_(requireUser_(token));
  if (cal && cal !== before.calendarId) out.synced = syncBirthdayCalendar_();
  return out;
}

/** BOD bấm Đồng bộ lịch ngay. */
function syncBirthdaysNow(token) {
  requireUser_(token, 'bod');
  var r = syncBirthdayCalendar_();
  var out = birthdayPageFor_(requireUser_(token));
  out.synced = r;
  return out;
}

/* ---------- Tin nhắc ---------- */

/** Một lịch tự chạy mỗi ngày vào giờ nhắc sinh nhật; đổi giờ thì cài lại. */
function ensureBirthdayTrigger_() {
  try {
    var want = birthdaySettings_().time, props = PropertiesService.getScriptProperties();
    var mine = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === BIRTHDAY_HANDLER; });
    if (mine.length === 1 && props.getProperty(BIRTHDAY_TRIGGER_PROP) === want) return false;
    mine.forEach(function (t) { ScriptApp.deleteTrigger(t); });
    var m = minuteOf_(want);
    ScriptApp.newTrigger(BIRTHDAY_HANDLER).timeBased().atHour(Math.floor(m / 60)).nearMinute(m % 60).everyDays(1)
      .inTimezone(Session.getScriptTimeZone()).create();
    props.setProperty(BIRTHDAY_TRIGGER_PROP, want);
    return true;
  } catch (e) { return false; /* lần mở trang sau cài lại */ }
}

/** Chạy tự động mỗi ngày: gửi tin nhắc sinh nhật. */
function runBirthdayReminders(e) {
  if (!fromOwnTrigger_(e)) return null;
  return trackJob_('birthday', function () {
    var items = birthdayReminderMessages_(new Date());
    return items.length ? notifyMembers_(items) : null;
  });
}

/* ---------- Google Calendar ---------- */

function birthdayCalendar_(id) {
  var cal = null;
  try { cal = CalendarApp.getCalendarById(id); } catch (e) { cal = null; }
  if (!cal) throw new Error('Không mở được lịch có ID "' + id + '". Kiểm tra lại ID (trong Google Calendar: Cài đặt của lịch, mục Tích hợp lịch) và chia sẻ lịch cho tài khoản CLB với quyền Thay đổi sự kiện.');
  return cal;
}

/** Sự kiện cần có cho mỗi người: { Mã TV: { title, date, description, key } }. */
function birthdayEventsWanted_(people, year) {
  var out = {};
  people.forEach(function (p) {
    var title = 'Sinh nhật ' + p.name + (p.dept ? ' (' + p.dept + ')' : '');
    var description = [p.className ? 'Lớp ' + p.className : '', p.facebookUrl].filter(String).join('\n');
    out[p.id] = { title: title, date: birthdayIn_(year, p.month, p.day), description: description,
      key: pad_(p.day, 2) + '/' + pad_(p.month, 2) + '|' + title + '|' + description };
  });
  return out;
}

/**
 * Làm cho lịch khớp danh sách nhiệm kỳ hiện tại: thêm người mới, tạo lại sự kiện của người đổi ngày sinh, tên, ban, lớp, link,
 * bỏ người đã rời. Sự kiện lặp hằng năm, không có nhắc. Không có ID lịch thì bỏ qua. Chạy lâu quá thì dừng, lần sau làm nốt.
 */
function syncBirthdayCalendar_() {
  var set = birthdaySettings_();
  if (!set.calendarId) return null;
  var cal = birthdayCalendar_(set.calendarId), term = currentTerm_(readTable_('terms'));
  var now = new Date(), year = now.getFullYear(), started = Date.now();
  var all = term ? birthdayPeople_(peopleData_(), term.term_id) : { people: [], missing: [] };
  var want = birthdayEventsWanted_(all.people, year);
  var have = {}, removed = 0, kept = 0, added = 0, left = 0;
  cal.getEvents(new Date(year, 0, 1), new Date(year + 1, 0, 1)).forEach(function (ev) {
    var id = ev.getTag('eco_member');
    if (!id) return; // sự kiện người khác tự thêm vào lịch thì để yên
    var series = ev.getEventSeries(), sid = series.getId();
    if (have[sid]) return;
    have[sid] = true;
    if (want[id] && want[id].key === ev.getTag('eco_key') && !want[id].done) { want[id].done = true; kept++; return; }
    series.deleteEventSeries();
    removed++;
  });
  Object.keys(want).forEach(function (id) {
    var w = want[id];
    if (w.done) return;
    if (Date.now() - started > BIRTHDAY_SYNC_MS) { left++; return; }
    var s = cal.createAllDayEventSeries(w.title, w.date, CalendarApp.newRecurrence().addYearlyRule(), { description: w.description });
    s.removeAllReminders();
    s.setTag('eco_member', id);
    s.setTag('eco_key', w.key);
    added++;
  });
  var r = { at: Date.now(), name: cal.getName(), added: added, removed: removed, kept: kept, left: left, missing: all.missing.length };
  PropertiesService.getScriptProperties().setProperty(BIRTHDAY_SYNC_PROP, JSON.stringify(r));
  return r;
}
