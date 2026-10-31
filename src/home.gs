/**
 * Trang chủ: trả lời câu "hôm nay tôi cần làm gì". BOD thấy việc chờ mình (task trễ, thư chờ duyệt, góp ý chưa đọc,
 * task chờ chấm) và bước tiếp theo của nhiệm kỳ. Thành viên thấy điểm, hạng, KPI task, KPI log và task của mình.
 * Ai cũng thấy link ghim và lời nhắc cài thông báo nếu cần.
 * Ngày giờ gửi về trang web ở dạng số mili giây (google.script.run không gửi được kiểu Date).
 */

var PHASE_LABELS = { prep: 'Giai đoạn giao thoa', phase_1: 'GD1', phase_2: 'GD2' };

/** Gọi từ trang web khi mở Trang chủ. */
function homeData(token) {
  var me = requireUser_(token);
  var now = new Date(), user = me.user, data = me.data;
  var term = currentTerm_(readTable_('terms'));
  var phase = phaseAt_(term, now);
  var rules = { dueSoonDays: getNumberSetting_('due_soon_days', 2), notDoneHours: getNumberSetting_('not_done_after_hours', 24),
    threshold: getNumberSetting_('kpi_threshold', 80) };
  var tasks = readTable_('tasks'), assignments = readTable_('task_assignments');
  var out = {
    now: now.getTime(),
    term: term ? { id: term.term_id, label: termLabel_(term.term_id), phase: phase, phaseLabel: PHASE_LABELS[phase] || '' } : null,
    links: pinnedLinks_(readTable_('settings')),
    notify: needsNotifySetup_(me, data),
    myTasks: myTasks_(me.memberId, tasks, assignments, data, now, rules),
    threshold: rules.threshold
  };
  if (user.isBod) {
    out.bod = bodHome_(tasks, assignments, data, term, phase, now, rules);
  } else {
    out.member = memberHome_(me.memberId, data, term, phase, tasks, assignments, now, rules);
  }
  if (user.labels.indexOf('dept_lead') >= 0) out.lead = leadSummary_(user.leadDepts, tasks, assignments, now, rules);
  if (user.labels.indexOf('ucv') >= 0) out.ucv = ucvSummary_(me.memberId, readTable_('mail_requests'));
  return out;
}

/** Link ghim trong tab Cài đặt: Tên pinned_link_1, pinned_link_2...; Giá trị là link; Ý nghĩa là tên hiện trên app. */
function pinnedLinks_(settings) {
  return settings.map(function (s) {
    var m = /^pinned_link_(\d+)$/.exec(String(s.key)), url = String(s.value || '').trim();
    return m && /^https:\/\//i.test(url) ? { n: Number(m[1]), url: url, label: String(s.description || '').trim() || url } : null;
  }).filter(Boolean).sort(function (a, b) { return a.n - b.n; }).map(function (x) { return { url: x.url, label: x.label }; });
}

/**
 * Có cần nhắc cài thông báo không. Người phải nhận tin (BOD, người phụ trách ban, seeding, sinh nhật) hoặc người tự bật
 * nhắc task: nhắc khi chưa bật kênh nào, hoặc kênh đã bật chưa cài xong (Zalo chưa kết nối, app chưa bật trên máy nào).
 */
function needsNotifySetup_(me, data) {
  var account = data.accounts.filter(function (a) { return a.member_id === me.memberId; })[0];
  var must = me.user.isBod || me.user.labels.indexOf('dept_lead') >= 0 || me.user.labels.indexOf('seeding_lead') >= 0 || me.user.labels.indexOf('birthday_lead') >= 0 || account.self_remind;
  if (!must) return false;
  var zalo = readTable_('zalo_links').some(function (z) { return z.member_id === me.memberId && z.chat_id; });
  var device = readTable_('devices').some(function (d) { return d.member_id === me.memberId; });
  if (!account.notify_zalo && !account.notify_app) return true;
  return (account.notify_zalo && !zalo) || (account.notify_app && !device);
}

function namesById_(members) {
  var m = {};
  members.forEach(function (x) { m[x.member_id] = x.full_name; });
  return m;
}

/** Ban của từng người theo dòng nhiệm kỳ mới nhất. */
function deptById_(memberTerms) {
  var best = {};
  memberTerms.forEach(function (r) { if (!best[r.member_id] || String(r.term_id) > String(best[r.member_id].term_id)) best[r.member_id] = r; });
  var m = {};
  Object.keys(best).forEach(function (id) { m[id] = best[id].dept_code; });
  return m;
}

/** Task của mình còn phải làm, hoặc đã bấm xong mà BOD chưa chấm (còn huỷ xác nhận được). Hạn gần lên trước. */
function myTasks_(memberId, tasks, assignments, data, now, rules) {
  var byId = {}, dept = deptById_(data.member_terms);
  tasks.forEach(function (t) { byId[t.task_id] = t; });
  return assignments.filter(function (a) { return a.member_id === memberId && byId[a.task_id]; }).map(function (a) {
    var t = byId[a.task_id], status = taskStatus_(t, a, now, rules.dueSoonDays, rules.notDoneHours);
    if (status === 'cancelled' || status === 'not_done' || (status === 'done' && a.quality)) return null;
    return { taskId: t.task_id, name: t.name, deadline: t.deadline ? t.deadline.getTime() : null, status: status,
      by: dept[t.created_by] === 'BOD' ? 'BOD giao' : 'Người phụ trách ban nhập',
      canUndo: status === 'done' && a.confirmed_by === memberId };
  }).filter(Boolean).sort(function (x, y) { return (x.deadline || Infinity) - (y.deadline || Infinity); });
}

/** Các dòng Giao task chưa xác nhận đang trễ hạn hoặc sắp đến hạn. only(task): lọc thêm theo task. */
function urgentAssignments_(tasks, assignments, now, rules, only) {
  var byId = {};
  tasks.forEach(function (t) { byId[t.task_id] = t; });
  return assignments.map(function (a) {
    var t = byId[a.task_id];
    if (!t || (only && !only(t))) return null;
    var status = taskStatus_(t, a, now, rules.dueSoonDays, rules.notDoneHours);
    return status === 'late' || status === 'due_soon' ? { task: t, assignment: a, status: status } : null;
  }).filter(Boolean);
}

function bodHome_(tasks, assignments, data, term, phase, now, rules) {
  var names = namesById_(data.members), dept = deptById_(data.member_terms);
  var urgent = urgentAssignments_(tasks, assignments, now, rules);
  var cancelled = {};
  tasks.forEach(function (t) { if (t.is_cancelled) cancelled[t.task_id] = true; });
  var toGrade = assignments.filter(function (a) { return a.confirmed_at && !a.quality && !cancelled[a.task_id]; }).length;
  var mails = readTable_('mail_requests').filter(function (m) { return m.status === 'pending'; })
    .sort(function (a, b) { return (a.created_at ? a.created_at.getTime() : 0) - (b.created_at ? b.created_at.getTime() : 0); });
  var unread = readTable_('feedback').filter(function (f) { return !f.is_read; }).length;
  var todo = [];
  mails.slice(0, 5).forEach(function (m) {
    todo.push({ page: 'mail', kind: 'mail', title: 'Duyệt thư “' + (m.subject || m.thread_subject || '(không tiêu đề)') + '”',
      meta: 'UCV ' + (names[m.drafted_by] || m.drafted_by), at: m.created_at ? m.created_at.getTime() : null });
  });
  if (mails.length > 5) todo.push({ page: 'mail', kind: 'mail', title: 'Còn ' + (mails.length - 5) + ' thư khác chờ duyệt' });
  if (toGrade) todo.push({ page: 'task', kind: 'grade', title: toGrade + ' task đã xong, chờ chấm chất lượng' });
  var late = urgent.filter(function (x) { return x.status === 'late'; })
    .sort(function (a, b) { return a.task.deadline.getTime() - b.task.deadline.getTime(); });
  late.slice(0, 5).forEach(function (x) {
    var id = x.assignment.member_id;
    todo.push({ page: 'task', kind: 'late', title: x.task.name, meta: (names[id] || id) + (dept[id] ? ' · ' + dept[id] : ''),
      deadline: x.task.deadline.getTime() });
  });
  if (late.length > 5) todo.push({ page: 'task', kind: 'late', title: 'Còn ' + (late.length - 5) + ' task trễ hạn khác' });
  if (unread) todo.push({ page: 'feedback', kind: 'feedback', title: unread + ' góp ý chưa đọc' });
  return {
    counts: { tasks: urgent.length, mail: mails.length, feedback: unread },
    todo: todo,
    nextStep: nextStep_(term, phase, readTable_('roster_uploads'))
  };
}

/** Dòng "Bước tiếp theo" cho BOD, theo giai đoạn của nhiệm kỳ. */
function nextStep_(term, phase, uploads) {
  if (!term) return 'Chưa có nhiệm kỳ nào. Bước tiếp: tải sheet thành viên để bắt đầu nhiệm kỳ.';
  var label = 'nhiệm kỳ ' + termLabel_(term.term_id);
  if (phase === 'phase_1') return 'Đang ở GD1 của ' + label + '. Bước tiếp: tuyển đợt 2 xong thì tải sheet đợt 2.';
  if (phase === 'phase_2') return 'Đang ở GD2 của ' + label + '. Bước tiếp: sau bonding farewell thì bấm Kết thúc nhiệm kỳ.';
  var oday = uploads.some(function (u) {
    return String(u.term_id) === String(term.term_id) && u.sheet_type === 'members' && u.batch_type === 'oday' && u.status === 'applied';
  });
  return 'Đang ở giai đoạn giao thoa của ' + label + ' (chưa tính điểm, KPI). Bước tiếp: ' +
    (oday ? 'tuyển đợt 1 xong thì tải sheet đợt 1.' : 'chốt BOD mới xong thì tải sheet Oday.');
}

/** Điểm, hạng ở giai đoạn đang chạy, KPI task và KPI log cả nhiệm kỳ (người bổ sung tính từ GD2). */
function memberHome_(memberId, data, term, phase, tasks, assignments, now, rules) {
  var out = { points: null, kpiTask: null, kpiLog: null, supplementary: false };
  if (!term || (phase !== 'phase_1' && phase !== 'phase_2')) return out;
  var member = data.members.filter(function (m) { return m.member_id === memberId; })[0];
  var memberTerm = data.member_terms.filter(function (r) { return r.member_id === memberId && String(r.term_id) === String(term.term_id); })[0];
  if (!memberTerm) return out;
  out.supplementary = isSupplementary_(member, term.term_id);
  var range = phaseRange_(term, phase);
  var ranked = rankedMembers_(data.members, data.member_terms, term.term_id, phase);
  if (ranked.indexOf(memberId) >= 0) {
    var list = rankList_(ranked, pointsBetween_(readTable_('point_entries'), range.from, range.to));
    var mine = list.filter(function (x) { return x.memberId === memberId; })[0];
    out.points = { total: mine.points, rank: mine.rank, of: list.length, phaseLabel: PHASE_LABELS[phase] };
  }
  var from = kpiFrom_(member, term), events = readTable_('events');
  out.kpiTask = kpiTask_(memberId, { tasks: tasks, assignments: assignments, events: events, termId: term.term_id, from: from, now: now,
    notDoneHours: rules.notDoneHours, threshold: rules.threshold });
  // Trang chủ chỉ cần số đếm. Danh sách có hạn chót kiểu Date, mà Date gửi về trang web thì cả kết quả thành null
  delete out.kpiTask.list;
  out.kpiLog = kpiLog_(memberId, memberTerm, { events: events, closings: readTable_('event_closings'), sessions: readTable_('log_sessions'),
    attendance: readTable_('attendance'), quotas: readTable_('log_quotas'), results: readTable_('log_results'), termId: term.term_id,
    from: from, threshold: rules.threshold });
  return out;
}

/** người phụ trách ban: số task trễ hạn và sắp đến hạn của các ban mình phụ trách. */
function leadSummary_(depts, tasks, assignments, now, rules) {
  var urgent = urgentAssignments_(tasks, assignments, now, rules, function (t) { return depts.indexOf(t.dept_code) >= 0; });
  return { late: urgent.filter(function (x) { return x.status === 'late'; }).length, soon: urgent.filter(function (x) { return x.status === 'due_soon'; }).length };
}

/** UCV: thư của mình đang chờ BOD duyệt và thư BOD trả lại cần sửa. */
function ucvSummary_(memberId, mails) {
  var mine = mails.filter(function (m) { return m.drafted_by === memberId; });
  return { pending: mine.filter(function (m) { return m.status === 'pending'; }).length,
    needsChanges: mine.filter(function (m) { return m.status === 'needs_changes'; }).length };
}
