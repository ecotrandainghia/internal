const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./gas');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { FILES, setUp } = require('./sample');
const DAY = 864e5, HOUR = 36e5;
const ago = (ms) => new Date(Date.now() - ms);

const login = (app, email, pw) => app.login(email, pw).token;

test('trang chủ BOD: ba con số, việc cần làm, bước tiếp theo, nhắc cài thông báo', () => {
  const { app } = setUp();
  const d = plain(app.homeData(login(app, 'an@gmail.com', 'matkhauAn')));
  assert.deepEqual(d.bod.counts, { tasks: 3, mail: 1, feedback: 1 });
  assert.match(d.bod.nextStep, /Đang ở GD1 .*tải sheet đợt 2/);
  assert.deepEqual(d.bod.todo.map((x) => x.kind), ['mail', 'grade', 'late', 'late', 'feedback']);
  assert.equal(d.bod.todo[0].title, 'Duyệt thư “Thư mời tài trợ”');
  assert.equal(d.bod.todo[0].meta, 'UCV Lê Chi');
  assert.equal(d.bod.todo[1].title, '1 task đã xong, chờ chấm chất lượng');
  assert.equal(d.bod.todo[2].title, 'Báo cáo quỹ');
  assert.equal(d.term.phase, 'phase_1');
  assert.equal(d.notify, true);
  assert.deepEqual(d.links, [{ url: 'https://example.com/a', label: 'Form đăng ký log' }, { url: 'https://example.com/b', label: 'Quy chế' }]);
  assert.equal(d.member, undefined);
  assert.deepEqual(d.myTasks, []);
});

test('BOD đã kết nối Zalo thì không nhắc cài thông báo nữa', () => {
  const { app, bod } = setUp();
  app.updateRecord_('accounts', bod, { notify_zalo: true, notify_app: false });
  app.insertRecords_('zalo_links', [{ member_id: bod, chat_id: 'z1', linked_at: new Date() }]);
  assert.equal(app.homeData(login(app, 'an@gmail.com', 'matkhauAn')).notify, false);
  app.updateRecord_('accounts', bod, { notify_app: true });
  assert.equal(app.homeData(login(app, 'an@gmail.com', 'matkhauAn')).notify, true);
});

test('trang chủ thành viên: điểm và hạng GD1, KPI task, KPI log, task của mình', () => {
  const { app, ids } = setUp();
  const d = plain(app.homeData(login(app, 'binh@gmail.com', 'chungCLB')));
  assert.equal(d.bod, undefined);
  assert.deepEqual(d.member.points, { total: 40, rank: 2, of: 2, phaseLabel: 'GD1' });
  assert.deepEqual([d.member.kpiTask.assigned, d.member.kpiTask.pass, d.member.kpiTask.percent], [5, 1, 100]);
  assert.deepEqual([d.member.kpiLog.quota, d.member.kpiLog.attended, d.member.kpiLog.needed], [4, 2, 2]);
  assert.deepEqual(d.myTasks.map((t) => [t.taskId, t.status, t.canUndo]), [
    [ids.waiting, 'done', true], [ids.late, 'late', false], [ids.soon, 'due_soon', false], [ids.later, 'assigned', false]]);
  assert.equal(d.myTasks[1].by, 'BOD giao');
  assert.equal(d.notify, false);
  assert.equal(d.lead, undefined);
});

test('Người phụ trách ban thấy số task trễ và sắp đến hạn của ban mình', () => {
  const { app } = setUp();
  const d = plain(app.homeData(login(app, 'chi@gmail.com', 'chungCLB')));
  assert.deepEqual(d.lead, { late: 2, soon: 1 });
  assert.equal(d.notify, true);
});

test('giai đoạn giao thoa: chưa tính điểm, KPI', () => {
  const { app, term } = setUp();
  app.updateRecord_('terms', term, { phase1_start_at: '' });
  const d = plain(app.homeData(login(app, 'binh@gmail.com', 'chungCLB')));
  assert.equal(d.term.phase, 'prep');
  assert.deepEqual(d.member, { points: null, kpiTask: null, kpiLog: null, supplementary: false });
  const b = plain(app.homeData(login(app, 'an@gmail.com', 'matkhauAn')));
  assert.match(b.bod.nextStep, /giao thoa .*tải sheet Oday/);
  app.insertRecords_('roster_uploads', [{ term_id: term, sheet_type: 'members', batch_type: 'oday', status: 'applied', uploaded_at: new Date() }], { termId: term });
  assert.match(app.homeData(login(app, 'an@gmail.com', 'matkhauAn')).bod.nextStep, /tải sheet đợt 1/);
});

test('chưa có nhiệm kỳ nào', () => {
  const app = loadApp(FILES);
  app.__viewer = 'clb@example.com';
  app.setupApp({ name: 'An', email: 'an@gmail.com', position: '', password: 'matkhauAn', clubPassword: 'chungCLB' });
  const d = plain(app.homeData(login(app, 'an@gmail.com', 'matkhauAn')));
  assert.equal(d.term, null);
  assert.match(d.bod.nextStep, /Chưa có nhiệm kỳ/);
  assert.deepEqual(d.bod.counts, { tasks: 0, mail: 0, feedback: 0 });
  assert.deepEqual(d.links, []);
});

test('thành viên bấm Đã xong rồi huỷ xác nhận; không làm được với task không phải của mình hay đã chấm', () => {
  const { app, ids } = setUp();
  const tok = login(app, 'binh@gmail.com', 'chungCLB');
  app.confirmTask(tok, ids.soon);
  const a = app.findRecord_('task_assignments', { task_id: ids.soon, member_id: 'M1' });
  assert.ok(a.confirmed_at);
  assert.equal(a.confirmed_by, 'M1');
  assert.throws(() => app.confirmTask(tok, ids.soon), /đã xác nhận/);
  app.undoConfirmTask(tok, ids.soon);
  assert.equal(app.findRecord_('task_assignments', { task_id: ids.soon, member_id: 'M1' }).confirmed_at, null);
  assert.throws(() => app.undoConfirmTask(tok, ids.soon), /chưa được xác nhận/);
  assert.throws(() => app.undoConfirmTask(tok, ids.graded), /đã chấm/);
  assert.throws(() => app.confirmTask(tok, ids.cancelled), /đã bị huỷ/);
  assert.throws(() => app.confirmTask(tok, 'T-0000-0000'), /Không tìm thấy/);
  assert.throws(() => app.confirmTask(login(app, 'an@gmail.com', 'matkhauAn'), ids.soon), /Không tìm thấy/);
  // Trễ 3 giờ vẫn xác nhận được (tính Trễ hạn); quá 24 giờ thì là Không làm
  app.confirmTask(tok, ids.late);
  app.updateRecord_('tasks', ids.later, { deadline: ago(2 * DAY) });
  assert.throws(() => app.confirmTask(tok, ids.later), /Không làm/);
});

test('xác nhận giúp thì thành viên không tự huỷ được', () => {
  const { app, ids, bod } = setUp();
  app.updateRecord_('task_assignments', { task_id: ids.soon, member_id: 'M1' }, { confirmed_at: new Date(), confirmed_by: 'M2' });
  assert.throws(() => app.undoConfirmTask(login(app, 'binh@gmail.com', 'chungCLB'), ids.soon), /xác nhận giúp/);
  assert.ok(bod);
});

test('dữ liệu gửi về trang web không có Date (Date làm google.script.run trả về null, app báo lỗi "reading token")', () => {
  const { app } = require('./sample').setUp();
  const dates = (o, p, out) => {
    if (o instanceof Date) out.push(p);
    else if (o && typeof o === 'object') Object.keys(o).forEach((k) => dates(o[k], p + '.' + k, out));
    return out;
  };
  for (const [email, pw] of [['binh@gmail.com', 'chungCLB'], ['chi@gmail.com', 'chungCLB'], ['an@gmail.com', 'matkhauAn']]) {
    const r = app.login(email, pw);
    assert.deepEqual(dates(r, 'login', []), [], email);
    assert.deepEqual(dates(app.openApp(r.token), 'openApp', []), [], email);
    assert.deepEqual(dates(app.homeData(r.token), 'homeData', []), [], email);
  }
});
