/**
 * Task. Thành viên bấm "Đã xong" (xác nhận hoàn thành); app tự biết đúng hạn hay trễ hạn. Bấm nhầm thì tự huỷ xác nhận
 * được, miễn là BOD chưa chấm.
 * BOD quản lý task mọi ban; người phụ trách ban quản lý task các ban mình phụ trách: nhập task, sửa hạn, huỷ task, xác nhận
 * thay, bấm "Nộp đúng hạn". Chỉ BOD chấm chất lượng. Sửa hạn, chấm, đổi trạng thái đều ghi Nhật ký.
 */

/** Dòng Giao task của chính mình, kèm task. Không có thì báo lỗi. */
function myAssignment_(memberId, taskId) {
  var task = findRecord_('tasks', String(taskId || ''));
  var a = task && findRecord_('task_assignments', { task_id: task.task_id, member_id: memberId });
  if (!a) throw new Error('Không tìm thấy task này trong danh sách task của bạn.');
  return { task: task, assignment: a };
}

/** Thành viên xác nhận hoàn thành task của mình. */
function confirmTask(token, taskId) {
  var me = requireUser_(token);
  return withLock_(function () {
    delete memo_.tasks; delete memo_.task_assignments;
    var x = myAssignment_(me.memberId, taskId), now = new Date();
    if (x.task.is_cancelled) throw new Error('Task này đã bị huỷ.');
    assertNotLocked_(taskDate_(x.task), 'xác nhận task này');
    if (x.assignment.confirmed_at) throw new Error('Bạn đã xác nhận task này rồi.');
    if (taskTiming_(x.task, x.assignment, now, getNumberSetting_('not_done_after_hours', 24)) === 'not_done') {
      throw new Error('Task đã quá hạn lâu nên tính là Không làm. Nếu bạn đã nộp, nhắn BOD hoặc người phụ trách ban nhé.');
    }
    updateRecord_('task_assignments', { task_id: x.task.task_id, member_id: me.memberId }, { confirmed_at: now, confirmed_by: me.memberId });
    return true;
  });
}

/** Huỷ xác nhận khi bấm nhầm. Chỉ khi chính mình đã xác nhận và BOD chưa chấm. */
function undoConfirmTask(token, taskId) {
  var me = requireUser_(token);
  return withLock_(function () {
    delete memo_.tasks; delete memo_.task_assignments;
    var x = myAssignment_(me.memberId, taskId), a = x.assignment;
    assertNotLocked_(taskDate_(x.task), 'huỷ xác nhận task này');
    if (!a.confirmed_at) throw new Error('Task này chưa được xác nhận.');
    if (a.quality) throw new Error('BOD đã chấm task này nên không huỷ được. Nhắn BOD nếu cần sửa.');
    if (a.confirmed_by !== me.memberId) throw new Error('Task này do người phụ trách ban hoặc BOD xác nhận giúp bạn. Nhắn họ nếu cần sửa.');
    updateRecord_('task_assignments', { task_id: a.task_id, member_id: me.memberId }, { confirmed_at: '', confirmed_by: '', marked_on_time: false });
    return true;
  });
}

/* ===================== BOD và người phụ trách ban quản lý task ===================== */

var TASK_HISTORY_ACTIONS = ['change_deadline', 'grade_task', 'change_task_status', 'remove_assignee'];

/** Phạm vi quản lý task: BOD mọi ban, người phụ trách ban chỉ các ban mình phụ trách. */
function taskScope_(user) {
  if (user.isBod) return { all: true, depts: [], canGrade: true };
  if (user.leadDepts.length) return { all: false, depts: user.leadDepts, canGrade: false };
  throw new Error('Chỉ BOD và người phụ trách ban mới quản lý task.');
}

function canManageDept_(scope, dept) {
  return scope.all || scope.depts.indexOf(dept) >= 0;
}

function requireTaskManager_(token) {
  var me = requireUser_(token);
  return { me: me, scope: taskScope_(me.user) };
}

function taskRules_() {
  return { dueSoonDays: getNumberSetting_('due_soon_days', 2), notDoneHours: getNumberSetting_('not_done_after_hours', 24) };
}

/** Người đang ở CLB trong nhiệm kỳ termId: { Mã TV: { name, dept, subTeam } }. */
function activePeople_(data, termId) {
  var names = namesById_(data.members), out = {};
  data.member_terms.forEach(function (r) {
    if (String(r.term_id) === String(termId) && r.status === 'active' && names[r.member_id] !== undefined) {
      out[r.member_id] = { name: names[r.member_id], dept: r.dept_code, subTeam: r.sub_team || '' };
    }
  });
  return out;
}

/** Một người trong task, để hiện ở trang Quản lý task. */
function assigneeView_(task, a, c) {
  var p = c.people[a.member_id] || { name: c.names[a.member_id] || a.member_id, dept: '', subTeam: '' };
  var timing = taskTiming_(task, a, c.now, c.rules.notDoneHours);
  return {
    id: a.member_id, name: p.name, dept: p.dept, subTeam: p.subTeam,
    status: taskStatus_(task, a, c.now, c.rules.dueSoonDays, c.rules.notDoneHours),
    timing: timing,
    confirmedAt: a.confirmed_at ? a.confirmed_at.getTime() : null,
    confirmedBy: a.confirmed_by && a.confirmed_by !== a.member_id ? (c.names[a.confirmed_by] || a.confirmed_by) : '',
    markedOnTime: !!a.marked_on_time,
    quality: a.quality || '',
    gradedBy: a.graded_by ? (c.names[a.graded_by] || a.graded_by) : '',
    result: taskResult_(timing, a.quality)
  };
}

/**
 * Trạng thái chung của task: cancelled; còn người chưa xong thì theo hạn (assigned, due_soon, late);
 * xong hết thì waiting (còn người chờ chấm) hoặc done.
 */
function taskOverall_(task, people, now, rules) {
  if (task.is_cancelled) return 'cancelled';
  var open = people.filter(function (p) { return !p.confirmedAt && p.status !== 'not_done'; });
  if (open.length || !people.length) return taskStatus_(task, {}, now, rules.dueSoonDays, rules.notDoneHours);
  return people.some(function (p) { return p.result === 'waiting'; }) ? 'waiting' : 'done';
}

function taskView_(t, assignments, c) {
  var people = assignments.filter(function (a) { return a.task_id === t.task_id; }).map(function (a) { return assigneeView_(t, a, c); })
    .sort(function (x, y) { return x.name.localeCompare(y.name, 'vi'); });
  return {
    id: t.task_id, eventId: t.event_id, event: c.events[t.event_id] || '', dept: t.dept_code, name: t.name, description: t.description || '',
    deadline: t.deadline ? t.deadline.getTime() : null, createdBy: c.names[t.created_by] || t.created_by || '',
    createdAt: t.created_at ? t.created_at.getTime() : null, cancelled: !!t.is_cancelled, counted: !!t.is_counted,
    status: taskOverall_(t, people, c.now, c.rules), waiting: people.filter(function (p) { return p.result === 'waiting'; }).length,
    people: people
  };
}

/** Dữ liệu trang Quản lý task: task của nhiệm kỳ hiện tại trong phạm vi được quản lý, kèm danh sách để chọn. */
function taskBoardFor_(x) {
  var now = new Date(), term = currentTerm_(readTable_('terms'));
  var termId = term ? String(term.term_id) : '';
  var events = readTable_('events').filter(function (e) { return String(e.term_id) === termId; });
  var c = { now: now, rules: taskRules_(), names: namesById_(x.me.data.members), people: activePeople_(x.me.data, termId), events: {} };
  events.forEach(function (e) { c.events[e.event_id] = e.name; });
  var assignments = readTable_('task_assignments');
  var tasks = readTable_('tasks').filter(function (t) {
    return Object.prototype.hasOwnProperty.call(c.events, t.event_id) && canManageDept_(x.scope, t.dept_code);
  }).map(function (t) { return taskView_(t, assignments, c); })
    .sort(function (a, b) { return (a.deadline || Infinity) - (b.deadline || Infinity); });
  var depts = readTable_('departments').filter(function (d) { return d.is_active && canManageDept_(x.scope, d.dept_code); })
    .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
    .map(function (d) { return { code: d.dept_code, name: d.dept_name }; });
  var members = Object.keys(c.people).filter(function (id) { return canManageDept_(x.scope, c.people[id].dept); }).map(function (id) {
    var p = c.people[id];
    return { id: id, name: p.name, dept: p.dept, subTeam: p.subTeam };
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  var phase = phaseAt_(term, now);
  return {
    now: now.getTime(), canGrade: x.scope.canGrade, depts: depts, members: members, tasks: tasks,
    events: events.map(function (e) { return { id: e.event_id, name: e.name }; }),
    counted: phase === 'phase_1' || phase === 'phase_2', hasTerm: !!term
  };
}

/** Gọi từ trang web khi mở Quản lý task. */
function taskBoard(token) {
  return taskBoardFor_(requireTaskManager_(token));
}

/** Task trong phạm vi được quản lý, hoặc báo lỗi. */
function managedTask_(x, taskId) {
  var t = findRecord_('tasks', String(taskId || ''));
  if (!t) throw new Error('Không tìm thấy task này.');
  if (!canManageDept_(x.scope, t.dept_code)) throw new Error('Task này không thuộc ban bạn phụ trách.');
  return t;
}

function deadlineFrom_(ms) {
  var d = new Date(Number(ms));
  if (ms === '' || ms === null || ms === undefined || isNaN(d.getTime())) throw new Error('Bạn chưa chọn hạn chót.');
  return d;
}

/**
 * Nhập task mới hoặc sửa task. f: { taskId (trống là task mới), eventId, deptCode, name, description, deadline (ms), memberIds }.
 * Người được giao phải đang ở CLB và ở đúng ban của task. Bỏ một người khỏi task chỉ được khi người đó chưa xác nhận.
 * Trả về dữ liệu trang mới.
 */
function saveTask(token, f) {
  var x = requireTaskManager_(token);
  f = f || {};
  withLock_(function () {
    var now = new Date(), term = currentTerm_(readTable_('terms'));
    if (!term) throw new Error('Chưa có nhiệm kỳ nào nên chưa nhập task được.');
    var name = String(f.name || '').trim();
    if (!name) throw new Error('Bạn chưa nhập tên task.');
    var ev = findRecord_('events', String(f.eventId || ''));
    if (!ev || String(ev.term_id) !== String(term.term_id)) throw new Error('Bạn chọn một sự kiện của nhiệm kỳ này nhé.');
    var dept = String(f.deptCode || '');
    if (!findRecord_('departments', dept)) throw new Error('Bạn chưa chọn ban.');
    if (!canManageDept_(x.scope, dept)) throw new Error('Bạn chỉ nhập được task của ban mình phụ trách.');
    var deadline = deadlineFrom_(f.deadline);
    var people = activePeople_(peopleData_(), term.term_id), ids = [];
    (f.memberIds || []).forEach(function (id) { if (ids.indexOf(String(id)) < 0) ids.push(String(id)); });
    if (!ids.length) throw new Error('Bạn chưa chọn người được giao.');
    ids.forEach(function (id) {
      if (!people[id]) throw new Error('Có người được chọn không còn ở CLB. Bạn tải lại trang rồi chọn lại nhé.');
      if (people[id].dept !== dept) throw new Error(people[id].name + ' không ở ban ' + dept + '.');
    });
    var fields = { event_id: ev.event_id, dept_code: dept, name: name, description: String(f.description || '').trim() };
    var audit = { actorId: x.me.memberId };
    if (!f.taskId) {
      fields.deadline = deadline; fields.created_by = x.me.memberId; fields.created_at = now; fields.is_cancelled = false;
      var phase = phaseAt_(term, now);
      fields.is_counted = phase === 'phase_1' || phase === 'phase_2'; // tạo trong giao thoa thì không tính KPI
      var t = insertRecords_('tasks', [fields], { termId: term.term_id })[0];
      insertRecords_('task_assignments', ids.map(function (id) { return { task_id: t.task_id, member_id: id }; }));
      return;
    }
    var old = managedTask_(x, f.taskId);
    if (old.is_cancelled) throw new Error('Task này đã huỷ. Mở lại task trước rồi hãy sửa.');
    assertNotLocked_(taskDate_(old), 'sửa task này');
    updateRecord_('tasks', old.task_id, fields);
    if (!old.deadline || old.deadline.getTime() !== deadline.getTime()) {
      updateRecord_('tasks', old.task_id, { deadline: deadline }, { actorId: audit.actorId, action: 'change_deadline' });
    }
    var current = readTable_('task_assignments').filter(function (a) { return a.task_id === old.task_id; });
    current.forEach(function (a) {
      if (ids.indexOf(a.member_id) >= 0) return;
      if (a.confirmed_at || a.quality) {
        throw new Error((people[a.member_id] ? people[a.member_id].name : a.member_id) + ' đã xác nhận hoàn thành nên không bỏ khỏi task được.');
      }
      deleteRecord_('task_assignments', { task_id: a.task_id, member_id: a.member_id }, { actorId: audit.actorId, action: 'remove_assignee' });
    });
    var have = current.map(function (a) { return a.member_id; });
    insertRecords_('task_assignments', ids.filter(function (id) { return have.indexOf(id) < 0; })
      .map(function (id) { return { task_id: old.task_id, member_id: id }; }));
  });
  return taskBoardFor_(x);
}

/** Sửa hạn chót (gia hạn). Ghi Nhật ký. */
function setTaskDeadline(token, taskId, deadline) {
  var x = requireTaskManager_(token);
  withLock_(function () {
    var t = managedTask_(x, taskId);
    if (t.is_cancelled) throw new Error('Task này đã huỷ.');
    var d = deadlineFrom_(deadline);
    assertNotLocked_(taskDate_(t), 'sửa hạn task này');
    assertNotLocked_(d, 'dời hạn vào lúc đó');
    updateRecord_('tasks', t.task_id, { deadline: d }, { actorId: x.me.memberId, action: 'change_deadline' });
  });
  return taskBoardFor_(x);
}

/** Huỷ task (không tính KPI) hoặc mở lại. Ghi Nhật ký. */
function setTaskCancelled(token, taskId, cancelled) {
  var x = requireTaskManager_(token);
  withLock_(function () {
    var t = managedTask_(x, taskId);
    assertNotLocked_(taskDate_(t), cancelled ? 'huỷ task này' : 'mở lại task này');
    updateRecord_('tasks', t.task_id, { is_cancelled: !!cancelled }, { actorId: x.me.memberId, action: 'change_task_status' });
  });
  return taskBoardFor_(x);
}

/**
 * Đổi trạng thái của một người trong task. what:
 *   confirm: xác nhận hoàn thành thay (tính đúng hạn hay trễ theo lúc bấm, kể cả khi đã quá mốc Không làm)
 *   undo: huỷ xác nhận. Đã chấm thì chỉ BOD huỷ được, và bỏ luôn phần chấm.
 *   on_time / not_on_time: bấm hoặc bỏ "Nộp đúng hạn" khi xác nhận sau hạn nhưng thực tế đã nộp đúng hạn.
 * Ghi Nhật ký.
 */
function setAssignmentStatus(token, taskId, memberId, what) {
  var x = requireTaskManager_(token);
  withLock_(function () {
    var t = managedTask_(x, taskId);
    if (t.is_cancelled) throw new Error('Task này đã huỷ.');
    assertNotLocked_(taskDate_(t), 'sửa task này');
    var key = { task_id: t.task_id, member_id: String(memberId || '') };
    var a = findRecord_('task_assignments', key);
    if (!a) throw new Error('Người này không có trong task.');
    var patch;
    if (what === 'confirm') {
      if (a.confirmed_at) throw new Error('Task này đã được xác nhận rồi.');
      patch = { confirmed_at: new Date(), confirmed_by: x.me.memberId, marked_on_time: false };
    } else if (what === 'undo') {
      if (!a.confirmed_at) throw new Error('Task này chưa được xác nhận.');
      if (a.quality && !x.scope.canGrade) throw new Error('BOD đã chấm task này nên chỉ BOD huỷ xác nhận được.');
      patch = { confirmed_at: '', confirmed_by: '', marked_on_time: false, quality: '', graded_by: '', graded_at: '' };
    } else if (what === 'on_time' || what === 'not_on_time') {
      if (!a.confirmed_at) throw new Error('Task này chưa được xác nhận.');
      if (what === 'on_time' && taskTiming_(t, a, new Date(), 0) !== 'late') throw new Error('Task này đã tính là đúng hạn rồi.');
      patch = { marked_on_time: what === 'on_time' };
    } else {
      throw new Error('Không rõ thao tác.');
    }
    updateRecord_('task_assignments', key, patch, { actorId: x.me.memberId, action: 'change_task_status' });
  });
  return taskBoardFor_(x);
}

/** BOD chấm chất lượng (hoặc chấm lại). Chỉ chấm được khi đã xác nhận hoàn thành. Ghi Nhật ký. */
function gradeTask(token, taskId, memberId, quality) {
  var x = requireTaskManager_(token);
  if (!x.scope.canGrade) throw new Error('Chỉ BOD mới chấm task.');
  if (!Object.prototype.hasOwnProperty.call(ENUMS['task_assignments.quality'], quality)) throw new Error('Bạn chọn một mức chất lượng nhé.');
  withLock_(function () {
    var t = managedTask_(x, taskId);
    if (t.is_cancelled) throw new Error('Task này đã huỷ.');
    assertNotLocked_(taskDate_(t), 'sửa task này');
    var key = { task_id: t.task_id, member_id: String(memberId || '') };
    var a = findRecord_('task_assignments', key);
    if (!a) throw new Error('Người này không có trong task.');
    if (!a.confirmed_at) throw new Error('Task chưa được xác nhận hoàn thành nên chưa chấm được.');
    updateRecord_('task_assignments', key, { quality: quality, graded_by: x.me.memberId, graded_at: new Date() },
      { actorId: x.me.memberId, action: 'grade_task' });
  });
  return taskBoardFor_(x);
}

/** Nhật ký của một task (sửa hạn, chấm, đổi trạng thái), mới nhất trước. */
function taskHistory(token, taskId) {
  var x = requireTaskManager_(token);
  var t = managedTask_(x, taskId);
  var rows = readTable_('audit_log').filter(function (r) {
    if (TASK_HISTORY_ACTIONS.indexOf(r.action) < 0) return false;
    return (r.table_name === 'tasks' && r.row_id === t.task_id) || (r.table_name === 'task_assignments' && r.row_id.indexOf(t.task_id + ' / ') === 0);
  });
  return taskHistoryLines_(rows, namesById_(x.me.data.members));
}

/** Đổi các dòng Nhật ký của task thành câu dễ đọc: { at (ms), who, text }. Cột phụ (người chấm, lúc chấm...) bỏ qua. */
function taskHistoryLines_(rows, names) {
  var quality = ENUMS['task_assignments.quality'];
  return rows.map(function (r) {
    var member = r.table_name === 'task_assignments' ? r.row_id.split(' / ')[1] : '';
    var who = names[member] || member, text = '';
    if (r.action === 'change_deadline' && r.column_name === 'deadline') text = 'Sửa hạn chót' + (r.old_value ? ' từ ' + r.old_value : '') + ' thành ' + r.new_value;
    else if (r.action === 'grade_task' && r.column_name === 'quality') text = 'Chấm ' + who + ': ' + (quality[r.new_value] || r.new_value);
    else if (r.action === 'remove_assignee' && r.column_name === 'member_id') text = 'Bỏ ' + who + ' khỏi task';
    else if (r.action === 'change_task_status') {
      if (r.column_name === 'is_cancelled') text = r.new_value === 'TRUE' ? 'Huỷ task' : 'Mở lại task';
      else if (r.column_name === 'confirmed_at') text = r.new_value ? 'Xác nhận hoàn thành thay ' + who : 'Huỷ xác nhận của ' + who;
      else if (r.column_name === 'marked_on_time') text = r.new_value === 'TRUE' ? 'Bấm Nộp đúng hạn cho ' + who : 'Bỏ Nộp đúng hạn của ' + who;
    }
    return text ? { at: r.logged_at ? r.logged_at.getTime() : null, who: names[r.actor_id] || r.actor_id || '', text: text } : null;
  }).filter(Boolean).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
}
