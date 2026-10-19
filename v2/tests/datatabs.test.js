const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const asBinh = (app) => app.login('binh@gmail.com', 'chungCLB').token;
const values = (app, name) => plain(app.dataFile_().getSheetByName(name).getDataRange().getValues());

test('tab xem: 5 tab đứng đầu, tô xám, khoá, chữ tiếng Việt có tên người', () => {
  const { app, ids } = setUp();
  assert.ok(app.refreshViews_(true));
  const tabs = app.dataFile_().getSheets();
  assert.deepEqual(tabs.slice(0, 5).map((s) => s.getName()), ['Xem - Thành viên', 'Xem - Task', 'Xem - Log', 'Xem - Điểm và KPI', 'Xem - Sự kiện']);
  assert.ok(tabs.slice(0, 5).every((s) => s.tabColor === '#999999' && s.protectedTab));

  const people = values(app, 'Xem - Thành viên');
  assert.deepEqual(people[0].slice(0, 2), ['Họ và tên', 'Mã TV']);
  assert.equal(people[1][0], 'Nguyễn Văn An', 'BOD đứng đầu');
  const chi = people.find((r) => r[0] === 'Lê Chi');
  assert.equal(chi[3], '11');
  assert.equal(chi[7], 'NS phụ trách ban PR');
  assert.equal(chi[8], 'Đang ở CLB');

  const tasks = values(app, 'Xem - Task');
  const graded = tasks.find((r) => r[4] === 'Chụp ảnh');
  assert.deepEqual([graded[0], graded[2], graded[7], graded[8], graded[9], graded[10]], ['Trần Thị Bình', 'Ngày hội Xanh', 'Đúng hạn', 'Hoàn chỉnh', 'Đạt', 'Có']);
  assert.equal(tasks.find((r) => r[4] === 'Dựng video')[9], 'Chờ chấm');
  assert.equal(tasks.find((r) => r[4] === 'Huỷ rồi')[7], 'Đã huỷ');
  assert.equal(tasks.length, 1 + 7);

  const log = values(app, 'Xem - Log');
  const binhLog = log.find((r) => r[0] === 'Trần Thị Bình');
  assert.deepEqual(binhLog.slice(2, 9), ['Ngày hội Xanh', 'PR', 4, 2, 0, 'Chưa đạt', 'Đang mở']);

  const pts = values(app, 'Xem - Điểm và KPI');
  assert.deepEqual(pts.slice(1).map((r) => [r[0], r[4], r[5]]), [['Lê Chi', 50, 1], ['Trần Thị Bình', 40, 2]], 'điểm GD1, không có BOD');

  const ev = values(app, 'Xem - Sự kiện');
  assert.match(ev[0][0], /Nhiệm kỳ .* đang ở GD1/);
  assert.deepEqual(ev[2].slice(0, 1).concat(ev[2].slice(2)), ['Ngày hội Xanh', 'Đang mở', '', 5, 1]);
  assert.ok(ids);
});

test('làm mới: bỏ qua khi vừa làm trong 5 phút (trừ nút Làm mới), mở file thì tự làm mới, chỉ BOD', () => {
  const { app } = setUp();
  assert.ok(app.__triggers.includes('onDataFileOpen'), 'cài lúc cài đặt lần đầu');
  app.onDataFileOpen();
  assert.ok(app.dataFile_().getSheetByName('Xem - Task'));
  assert.equal(app.refreshViews_(false), null);
  const token = asBod(app);
  const d = plain(app.refreshViewsNow(token));
  assert.ok(d.refreshedAt);
  assert.ok(d.views.every((v) => v.exists));
  const sys = d.groups.find((g) => g.label === 'Hệ thống');
  assert.deepEqual(sys.tabs.map((t) => [t.name, t.handEditable]), [['settings', true], ['departments', false], ['audit_log', false]]);
  assert.equal(d.groups.find((g) => g.label === 'Task').tabs.find((t) => t.name === 'tasks').rows, 6);
  assert.throws(() => app.dataTabs(asBinh(app)));
});

test('Nhật ký: mới nhất trước, lọc theo việc, người làm và chữ tìm, mỗi lần 100 dòng', () => {
  const { app, bod } = setUp();
  const token = asBod(app);
  const rows = [];
  for (let i = 0; i < 120; i++) rows.push({ logged_at: new Date(Date.now() - (200 - i) * 1000), actor_id: 'M2', action: 'add_points', table_name: 'point_entries', row_id: 'D-' + i, column_name: 'points', old_value: '', new_value: String(i) });
  app.insertRecords_('audit_log', rows);
  const all = plain(app.auditLog(token, {}));
  assert.equal(all.rows.length, 100);
  assert.ok(all.next === 100);
  assert.ok(all.actors.some((a) => a.id === 'M2' && a.name === 'Lê Chi'));
  const pts = plain(app.auditLog(token, { action: 'add_points', actor: 'M2' }));
  assert.equal(pts.total, 120);
  assert.equal(pts.rows[0].rowId, 'D-119', 'mới nhất trước');
  assert.equal(pts.rows[0].action, 'Cộng điểm');
  assert.equal(pts.rows[0].table, 'Cộng điểm');
  assert.equal(pts.rows[0].actor, 'Lê Chi');
  assert.equal(plain(app.auditLog(token, { action: 'add_points', before: 100 })).rows.length, 20);
  assert.equal(plain(app.auditLog(token, { q: 'cong diem' })).total, 120, 'tìm không cần dấu');
  assert.equal(plain(app.auditLog(token, { q: 'D-7' })).total, 1 + 10);
  assert.ok(bod);
  assert.throws(() => app.auditLog(asBinh(app), {}));
});
