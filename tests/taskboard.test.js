const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const DAY = 864e5;

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asLead = (app) => login(app, 'chi@gmail.com', 'chungCLB');
const find = (board, id) => board.tasks.find((t) => t.id === id);

test('BOD thấy mọi task của nhiệm kỳ, trạng thái chung và từng người', () => {
  const { app, ids } = setUp();
  const d = plain(app.taskBoard(asBod(app)));
  assert.equal(d.canGrade, true);
  assert.equal(d.counted, true);
  assert.deepEqual(d.depts.map((x) => x.code), ['BOD', 'PG', 'PR', 'AD', 'HR']);
  assert.equal(d.tasks.length, 6);
  assert.equal(find(d, ids.soon).status, 'due_soon');
  assert.equal(find(d, ids.later).status, 'assigned');
  assert.equal(find(d, ids.late).status, 'late');
  assert.equal(find(d, ids.waiting).status, 'waiting');
  assert.equal(find(d, ids.graded).status, 'done');
  assert.equal(find(d, ids.cancelled).status, 'cancelled');
  const w = find(d, ids.waiting).people[0];
  assert.deepEqual([w.name, w.dept, w.timing, w.result, w.confirmedBy], ['Trần Thị Bình', 'PR', 'on_time', 'waiting', '']);
  assert.equal(find(d, ids.graded).people[0].result, 'pass');
  assert.equal(find(d, ids.soon).event, 'Ngày hội Xanh');
});

test('Người phụ trách ban chỉ thấy task và người của ban mình, không chấm được; thành viên thường không vào được', () => {
  const { app, ids } = setUp();
  const d = plain(app.taskBoard(asLead(app)));
  assert.equal(d.canGrade, false);
  assert.deepEqual(d.depts.map((x) => x.code), ['PR']);
  assert.deepEqual(d.members.map((m) => m.id), ['M1']);
  assert.equal(d.tasks.length, 6);
  assert.throws(() => app.gradeTask(asLead(app), ids.waiting, 'M1', 'complete'), /Chỉ BOD/);
  assert.throws(() => app.taskBoard(login(app, 'binh@gmail.com', 'chungCLB')), /Chỉ BOD và người phụ trách/);
});

test('nhập task mới: giao nhiều người, đúng ban, được tính vì đang ở GD1', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const ev = app.readTable_('events')[0].event_id;
  app.insertRecords_('members', [{ member_id: 'M3', full_name: 'Đỗ Dung', email: 'dung@gmail.com' }]);
  app.insertRecords_('member_terms', [{ member_id: 'M3', term_id: app.readTable_('terms')[0].term_id, dept_code: 'PR', status: 'active' }]);
  const deadline = Date.now() + 5 * DAY;
  const base = { eventId: ev, deptCode: 'PR', name: '  Poster mới ', description: 'Khổ A3', deadline, memberIds: ['M1', 'M3', 'M1'] };
  assert.throws(() => app.saveTask(tok, { ...base, name: ' ' }), /chưa nhập tên/);
  assert.throws(() => app.saveTask(tok, { ...base, eventId: 'SK-x' }), /sự kiện/);
  assert.throws(() => app.saveTask(tok, { ...base, deadline: '' }), /hạn chót/);
  assert.throws(() => app.saveTask(tok, { ...base, memberIds: [] }), /người được giao/);
  assert.throws(() => app.saveTask(tok, { ...base, memberIds: ['M2'] }), /Lê Chi không ở ban PR/);
  const d = plain(app.saveTask(tok, base));
  const t = d.tasks.find((x) => x.name === 'Poster mới');
  assert.equal(t.description, 'Khổ A3');
  assert.equal(t.deadline, deadline);
  assert.equal(t.counted, true);
  assert.equal(t.createdBy, 'Nguyễn Văn An');
  assert.deepEqual(t.people.map((p) => p.id).sort(), ['M1', 'M3']);
});

test('task tạo trong giai đoạn giao thoa không tính KPI; NS không nhập được task ban khác', () => {
  const { app, term } = setUp();
  app.updateRecord_('terms', term, { phase1_start_at: new Date(Date.now() + DAY) });
  const ev = app.readTable_('events')[0].event_id;
  const f = { eventId: ev, deptCode: 'PR', name: 'Việc giao thoa', deadline: Date.now() + DAY, memberIds: ['M1'] };
  const d = plain(app.saveTask(asLead(app), f));
  assert.equal(d.tasks.find((x) => x.name === 'Việc giao thoa').counted, false);
  assert.throws(() => app.saveTask(asLead(app), { ...f, deptCode: 'AD', memberIds: ['M2'] }), /ban mình phụ trách/);
});

test('sửa task: đổi hạn ghi Nhật ký, thêm người, không bỏ được người đã xác nhận', () => {
  const { app, ids, bod } = setUp();
  const tok = asBod(app);
  const ev = app.readTable_('events')[0].event_id;
  app.insertRecords_('members', [{ member_id: 'M3', full_name: 'Đỗ Dung', email: 'dung@gmail.com' }]);
  app.insertRecords_('member_terms', [{ member_id: 'M3', term_id: app.readTable_('terms')[0].term_id, dept_code: 'PR', status: 'active' }]);
  const old = app.findRecord_('tasks', ids.waiting);
  const newDeadline = Date.now() + 3 * DAY;
  const base = { taskId: ids.waiting, eventId: ev, deptCode: 'PR', name: 'Dựng video 2', deadline: newDeadline };
  assert.throws(() => app.saveTask(tok, { ...base, memberIds: ['M3'] }), /đã xác nhận hoàn thành nên không bỏ/);
  const d = plain(app.saveTask(tok, { ...base, memberIds: ['M1', 'M3'] }));
  const t = find(d, ids.waiting);
  assert.equal(t.name, 'Dựng video 2');
  assert.equal(t.deadline, newDeadline);
  assert.deepEqual(t.people.map((p) => p.id).sort(), ['M1', 'M3']);
  const log = app.readTable_('audit_log').filter((r) => r.action === 'change_deadline');
  assert.equal(log.length, 1);
  assert.equal(log[0].actor_id, bod);
  assert.equal(log[0].row_id, ids.waiting);
  assert.ok(old.deadline.getTime() !== newDeadline);
  // bỏ người chưa xác nhận thì xoá dòng giao và ghi Nhật ký
  app.saveTask(tok, { ...base, memberIds: ['M1'] });
  assert.equal(app.readTable_('task_assignments').filter((a) => a.task_id === ids.waiting).length, 1);
  const hist = plain(app.taskHistory(tok, ids.waiting));
  assert.deepEqual(hist.map((h) => h.text.replace(/\d.*$/, '…')), ['Bỏ Đỗ Dung khỏi task', 'Sửa hạn chót từ …']);
});

test('sửa hạn, huỷ và mở lại task', () => {
  const { app, ids } = setUp();
  const tok = asLead(app);
  const d = plain(app.setTaskDeadline(tok, ids.late, Date.now() + 2 * DAY));
  assert.equal(find(d, ids.late).status, 'due_soon');
  assert.equal(find(plain(app.setTaskCancelled(tok, ids.late, true)), ids.late).status, 'cancelled');
  assert.throws(() => app.setTaskDeadline(tok, ids.late, Date.now()), /đã huỷ/);
  assert.equal(find(plain(app.setTaskCancelled(tok, ids.late, false)), ids.late).status, 'due_soon');
  const texts = plain(app.taskHistory(tok, ids.late)).map((h) => h.text);
  assert.deepEqual(texts.map((t) => t.replace(/ từ .*/, '')), ['Mở lại task', 'Huỷ task', 'Sửa hạn chót']);
});

test('xác nhận thay, Nộp đúng hạn, chấm và huỷ xác nhận', () => {
  const { app, ids } = setUp();
  const lead = asLead(app), bodTok = asBod(app);
  // task Báo cáo quỹ đã quá hạn 3 giờ: xác nhận thay bây giờ là trễ hạn
  let p = find(plain(app.setAssignmentStatus(lead, ids.late, 'M1', 'confirm')), ids.late).people.find((x) => x.id === 'M1');
  assert.deepEqual([p.timing, p.confirmedBy, p.result], ['late', 'Lê Chi', 'waiting']);
  assert.throws(() => app.setAssignmentStatus(lead, ids.late, 'M1', 'confirm'), /đã được xác nhận/);
  assert.throws(() => app.gradeTask(bodTok, ids.soon, 'M1', 'complete'), /chưa được xác nhận/);
  assert.throws(() => app.gradeTask(bodTok, ids.late, 'M1', 'great'), /mức chất lượng/);
  p = find(plain(app.gradeTask(bodTok, ids.late, 'M1', 'needs_revision')), ids.late).people.find((x) => x.id === 'M1');
  assert.deepEqual([p.quality, p.result, p.gradedBy], ['needs_revision', 'fail', 'Nguyễn Văn An']);
  p = find(plain(app.setAssignmentStatus(lead, ids.late, 'M1', 'on_time')), ids.late).people.find((x) => x.id === 'M1');
  assert.deepEqual([p.timing, p.markedOnTime, p.result], ['on_time', true, 'pass']);
  assert.throws(() => app.setAssignmentStatus(lead, ids.late, 'M1', 'on_time'), /đúng hạn rồi/);
  assert.throws(() => app.setAssignmentStatus(lead, ids.late, 'M1', 'undo'), /chỉ BOD/);
  p = find(plain(app.setAssignmentStatus(bodTok, ids.late, 'M1', 'undo')), ids.late).people.find((x) => x.id === 'M1');
  assert.deepEqual([p.confirmedAt, p.quality, p.markedOnTime, p.status], [null, '', false, 'late']);
  const texts = plain(app.taskHistory(bodTok, ids.late)).map((h) => h.text);
  assert.ok(texts.includes('Xác nhận hoàn thành thay Trần Thị Bình'));
  assert.ok(texts.includes('Chấm Trần Thị Bình: Cần chỉnh sửa'));
  assert.ok(texts.includes('Bấm Nộp đúng hạn cho Trần Thị Bình'));
  assert.ok(texts.includes('Huỷ xác nhận của Trần Thị Bình'));
});

test('NS không quản lý task của ban khác', () => {
  const { app, ids } = setUp();
  app.updateRecord_('tasks', ids.soon, { dept_code: 'AD' });
  const d = plain(app.taskBoard(asLead(app)));
  assert.equal(find(d, ids.soon), undefined);
  assert.throws(() => app.setTaskDeadline(asLead(app), ids.soon, Date.now()), /không thuộc ban/);
});
