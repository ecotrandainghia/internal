const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./gas');
// Mảng tạo trong môi trường giả lập khác "loại" với mảng của Node, nên chép ra trước khi so.
const plain = (x) => JSON.parse(JSON.stringify(x));

function setUp() {
  const app = loadApp();
  app.setupDataFile();
  return app;
}
const file = (app) => Object.values(app.__files)[0];

test('chưa có file dữ liệu thì báo NOT_SET_UP', () => {
  const app = loadApp();
  assert.throws(() => app.readTable_('tasks'), /NOT_SET_UP/);
});

test('cài đặt: tạo đủ 29 tab đúng thứ tự, bỏ Sheet1, khoá mọi tab trừ Cài đặt', () => {
  const app = setUp();
  const ss = file(app);
  assert.deepEqual(ss.sheets.map((s) => s.name), plain(app.TABLES.map((t) => t.name)));
  ss.sheets.forEach((s) => {
    assert.deepEqual(s.data[0], plain(app.tableDef_(s.name).names));
    assert.equal(s.frozen, 1);
    assert.equal(s.protectedTab, s.name !== 'settings', s.name);
    assert.ok(s.tabColor);
  });
});

test('cài đặt: có sẵn các ban và mức quy chế; chạy lại không thêm trùng', () => {
  const app = setUp();
  assert.equal(app.readTable_('departments').length, 5);
  assert.equal(app.getNumberSetting_('kpi_threshold', 0), 80);
  app.setupDataFile();
  assert.equal(app.readTable_('departments').length, 5);
  assert.equal(app.readTable_('settings').length, app.DEFAULT_SETTINGS.length);
});

test('thêm task: tự cấp mã theo nhiệm kỳ, đọc lại đúng kiểu', () => {
  const app = setUp();
  const deadline = new Date(2026, 10, 5, 23, 59);
  const [a, b] = app.insertRecords_('tasks', [
    { event_id: 'SK-2627-01', dept_code: 'PR', name: 'Poster', deadline, created_by: '2627-OD-001', is_counted: true },
    { event_id: 'SK-2627-01', dept_code: 'PR', name: 'Clip', deadline }
  ], { termId: '2627' });
  assert.equal(a.task_id, 'T-2627-0001');
  assert.equal(b.task_id, 'T-2627-0002');
  const [c] = app.insertRecords_('tasks', [{ name: 'Banner' }], { termId: '2627' });
  assert.equal(c.task_id, 'T-2627-0003');
  const rows = app.readTable_('tasks');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].is_counted, true);
  assert.equal(rows[1].is_counted, false);
  assert.equal(rows[0].deadline.getTime(), deadline.getTime());
  assert.equal(app.findRecord_('tasks', 'T-2627-0002').name, 'Clip');
  assert.equal(app.findRecord_('tasks', 'T-2627-0099'), null);
});

test('sửa dòng: ghi Nhật ký mỗi cột đổi, cột không đổi thì không ghi', () => {
  const app = setUp();
  app.insertRecords_('tasks', [{ name: 'Poster', deadline: new Date(2026, 10, 5, 23, 59) }], { termId: '2627' });
  const after = app.updateRecord_('tasks', 'T-2627-0001', { name: 'Poster', deadline: '07/11/2026 23:59' },
    { actorId: '2627-OD-003', action: 'change_deadline' });
  assert.equal(after.deadline.getDate(), 7);
  assert.equal(app.readTable_('tasks')[0].deadline.getDate(), 7);
  const log = app.readTable_('audit_log');
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].action, log[0].table_name, log[0].row_id, log[0].column_name, log[0].old_value, log[0].new_value],
    ['change_deadline', 'tasks', 'T-2627-0001', 'deadline', '05/11/2026 23:59', '07/11/2026 23:59']);
  assert.equal(log[0].actor_id, '2627-OD-003');

  app.updateRecord_('tasks', 'T-2627-0001', { name: 'Poster' }, { actorId: 'x', action: 'change_deadline' });
  assert.equal(app.readTable_('audit_log').length, 1);
});

test('sửa dòng khoá ghép, giữ nguyên các dòng khác', () => {
  const app = setUp();
  app.insertRecords_('task_assignments', [
    { task_id: 'T-2627-0001', member_id: '2627-OD-001' },
    { task_id: 'T-2627-0001', member_id: '2627-OD-002' }
  ]);
  app.updateRecord_('task_assignments', { task_id: 'T-2627-0001', member_id: '2627-OD-002' },
    { quality: 'complete', marked_on_time: true }, { actorId: '2627-OD-003', action: 'grade_task' });
  const rows = app.readTable_('task_assignments');
  assert.equal(rows[0].quality, '');
  assert.equal(rows[1].quality, 'complete');
  assert.equal(rows[1].marked_on_time, true);
  assert.equal(app.readTable_('audit_log').length, 2);
  assert.throws(() => app.updateRecord_('task_assignments', 'T-2627-0001', { quality: 'poor' }), /khoá ghép/);
  assert.throws(() => app.updateRecord_('task_assignments', { task_id: 'T-9', member_id: 'x' }, { quality: 'poor' }), /Không tìm thấy/);
  assert.throws(() => app.updateRecord_('task_assignments', { task_id: 'T-2627-0001', member_id: '2627-OD-001' },
    { quality: 'tốt' }), /không dùng được/);
});

test('mã như 2627 và số điện thoại giữ nguyên dạng chữ', () => {
  const app = setUp();
  app.insertRecords_('members', [{ member_id: '2627-OD-012', full_name: 'Trần Minh Khoa', phone: '0900 000 001', join_term_id: 2627 }]);
  const m = app.readTable_('members')[0];
  assert.equal(m.join_term_id, '2627');
  assert.equal(m.phone, '0900 000 001');
});

test('Cài đặt: sửa trong app ghi Nhật ký; người gõ tay sai thì dùng giá trị mặc định', () => {
  const app = setUp();
  app.setSetting_('top_reward_percent', '20', '2627-OD-001');
  assert.equal(app.getNumberSetting_('top_reward_percent', 15), 20);
  app.setSetting_('zalo_bot_name', 'ECO bot', '2627-OD-001', 'Tên bot Zalo');
  assert.equal(app.getSetting_('zalo_bot_name'), 'ECO bot');
  const log = app.readTable_('audit_log');
  assert.deepEqual(plain(log.map((r) => [r.row_id, r.old_value, r.new_value])), [['top_reward_percent', '15', '20'], ['zalo_bot_name', '', 'ECO bot']]);
  app.updateRecord_('settings', 'kpi_threshold', { value: 'tám mươi' });
  assert.equal(app.getNumberSetting_('kpi_threshold', 80), 80);
  assert.equal(app.getSetting_('chua_co', 'mặc định'), 'mặc định');
});

test('tab bị thiếu cột hoặc bị xoá thì app tự bổ sung, giữ cột người thêm tay', () => {
  const app = loadApp();
  app.setupDataFile();
  const ss = file(app);
  const contacts = ss.getSheetByName('contacts');
  contacts.data = [['contact_id', 'name', 'ghi_chu_tay'], ['LH-0001', 'Công ty Xanh', 'gọi trước']];
  ss.deleteSheet(ss.getSheetByName('fanpages'));
  app.useDataFile_(ss.getId());
  app.setupDataFile();
  assert.deepEqual(contacts.data[0], ['contact_id', 'name', 'ghi_chu_tay', 'group_name', 'email', 'note']);
  assert.ok(ss.getSheetByName('fanpages'));
  const [c] = app.insertRecords_('contacts', [{ name: 'Công ty Lá', email: 'la@x.vn' }]);
  assert.equal(c.contact_id, 'LH-0002');
  app.updateRecord_('contacts', 'LH-0001', { note: 'anh Minh' });
  assert.equal(contacts.data[1][2], 'gọi trước');
  assert.equal(app.readTable_('contacts')[0].note, 'anh Minh');
});

test('sheet hết dòng thì nới thêm trước khi ghi', () => {
  const app = setUp();
  const sh = file(app).getSheetByName('notifications');
  sh.maxRows = 2;
  app.insertRecords_('notifications', [1, 2, 3].map((i) => ({ sent_at: new Date(), member_id: 'm' + i, title: 't', body: 'b' })));
  assert.equal(app.readTable_('notifications').length, 3);
});

test('khoá ghi: lồng nhau chỉ khoá một lần, lỗi giữa chừng vẫn trả khoá', () => {
  const app = setUp();
  const before = { ...app.__lock };
  app.withLock_(() => app.withLock_(() => app.insertRecords_('contacts', [{ name: 'A' }])));
  assert.equal(app.__lock.taken - before.taken, 1);
  assert.throws(() => app.withLock_(() => { throw new Error('hỏng'); }), /hỏng/);
  assert.equal(app.__lock.taken, app.__lock.released);
});

test('cột ô tick định dạng sẵn tới cuối sheet: dòng chưa dùng (FALSE) không thành bản ghi, dòng mới ghi ngay sau dòng cuối', () => {
  const app = setUp();
  const sh = file(app).getSheetByName('departments');
  const header = sh.data[0], on = header.indexOf('is_active');
  const real = app.readTable_('departments').length;
  for (let i = 0; i < 20; i++) { const row = header.map(() => ''); row[on] = false; sh.data.push(row); }
  app.__resetMemo && app.__resetMemo();
  app.insertRecords_('departments', [{ dept_code: 'MKT', dept_name: 'Marketing', is_active: true }]);
  const list = app.readTable_('departments');
  assert.equal(list.length, real + 1);
  assert.ok(list.every((d) => d.dept_code));
  assert.equal(sh.data[real + 1][header.indexOf('dept_code')], 'MKT');
});

test('dữ liệu cũ bắt đầu từ dòng 1001: chạy lại cấu trúc thì dồn lên sát dòng tên cột, giữ thứ tự, chạy lần nữa không đổi', () => {
  const app = setUp();
  const sh = file(app).getSheetByName('departments');
  const header = sh.data[0], on = header.indexOf('is_active'), code = header.indexOf('dept_code');
  const real = sh.data.slice(1).filter((r) => r[code]);
  assert.ok(real.length >= 2);
  const moved = real.map((r) => r.slice());
  sh.data.length = 1; sh.maxRows = 1100;
  for (let i = 0; i < 999; i++) { const row = header.map(() => ''); row[on] = false; sh.data.push(row); }
  moved.forEach((r) => sh.data.push(r));
  app.ensureSchema_(true);
  assert.deepEqual(sh.data.slice(1, 1 + real.length).map((r) => r[code]), real.map((r) => r[code]));
  assert.equal(sh.getLastRow(), 1 + real.length);
  const snap = JSON.stringify(sh.data);
  app.ensureSchema_(true);
  assert.equal(JSON.stringify(sh.data), snap);
});
