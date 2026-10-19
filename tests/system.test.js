const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const DAY = 864e5, ago = (ms) => new Date(Date.now() - ms);
const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const asBinh = (app) => app.login('binh@gmail.com', 'chungCLB').token;
const nightly = (app) => app.__triggers.find((t) => t.handler === 'runNightly');

/** Hai nhiệm kỳ cũ: 2425 kết thúc 500 ngày trước (cần lưu trữ), 2526 kết thúc khi nhiệm kỳ đang chạy bắt đầu. */
function oldTerms(app, bod) {
  app.insertRecords_('terms', [{ term_id: '2425', prep_start_at: ago(900 * DAY) }, { term_id: '2526', prep_start_at: ago(500 * DAY) }]);
  const ev = app.insertRecords_('events', [{ term_id: '2425', name: 'Sự kiện cũ', created_by: bod }], { termId: '2425' })[0].event_id;
  const task = app.insertRecords_('tasks', [{ event_id: ev, dept_code: 'PR', name: 'Task cũ', created_by: bod }], { termId: '2425' })[0].task_id;
  app.insertRecords_('task_assignments', [{ task_id: task, member_id: 'M1' }]);
  app.insertRecords_('point_entries', [{ member_id: 'M1', activity_id: 'HD-0001', points: 5, awarded_at: ago(700 * DAY), source: 'manual' }], { termId: '2425' });
  app.insertRecords_('events', [{ term_id: '2526', name: 'Sự kiện năm ngoái', created_by: bod }], { termId: '2526' });
  app.insertRecords_('audit_log', [{ logged_at: ago(800 * DAY), actor_id: bod, action: 'add_points', table_name: 'point_entries', row_id: 'x', column_name: 'points', old_value: '', new_value: '5' },
    { logged_at: ago(300 * DAY), actor_id: bod, action: 'add_points', table_name: 'point_entries', row_id: 'y', column_name: 'points', old_value: '', new_value: '7' }]);
  return { ev, task };
}

test('việc ban đêm: cài lúc cài đặt, chỉ lịch của dự án gọi được, sao lưu và lưu trữ nhiệm kỳ đã xong hơn một năm', () => {
  const { app, bod } = setUp();
  const { ev, task } = oldTerms(app, bod);
  assert.equal(nightly(app).hour, 2);
  assert.equal(app.runNightly({}), null);

  const r = app.runNightly({ triggerUid: nightly(app).id });
  assert.match(r.text, /Sao lưu \[APP\] Sao lưu/);
  assert.match(r.text, /Lưu trữ nhiệm kỳ 2024-2025/);
  assert.equal(app.backups_().length, 1);
  const copy = app.__files[app.backups_()[0].id];
  assert.equal(copy.folder, 'Sao lưu');

  assert.ok(!app.readTable_('events').some((e) => e.event_id === ev), 'sự kiện 2425 rời file chính');
  assert.ok(app.readTable_('events').some((e) => e.term_id === '2526'), 'nhiệm kỳ 2526 chưa đủ một năm thì giữ');
  assert.ok(!app.readTable_('tasks').some((t) => t.task_id === task));
  assert.ok(!app.readTable_('task_assignments').some((t) => t.task_id === task));
  assert.ok(!app.readTable_('point_entries').some((p) => /^D-2425-/.test(p.entry_id)));
  assert.ok(!app.readTable_('audit_log').some((a) => a.row_id === 'x'));
  assert.ok(app.readTable_('audit_log').some((a) => a.row_id === 'y'));
  assert.equal(app.readTable_('tasks').length, 6, 'task nhiệm kỳ đang chạy còn nguyên');

  const t = app.findRecord_('terms', '2425');
  assert.ok(t.archive_file_id && t.archived_at);
  const arch = app.__files[t.archive_file_id];
  assert.equal(arch.name, '[APP] Lưu trữ nhiệm kỳ 2425');
  assert.equal(arch.folder, 'Lưu trữ');
  assert.deepEqual(arch.getSheets().map((s) => s.getName()).sort(), ['audit_log', 'events', 'point_entries', 'task_assignments', 'tasks']);
  assert.equal(arch.getSheetByName('tasks').getDataRange().getValues()[1][0], task);

  const page = plain(app.systemPage(asBod(app)));
  const job = page.jobs.find((j) => j.id === 'nightly');
  assert.equal(job.installed, true);
  assert.equal(job.last.ok, true);
  assert.deepEqual(page.archives.map((a) => a.term), ['2024-2025']);
  assert.ok(page.jobs.find((j) => j.id === 'task_reminders').installed, 'mở trang thì cài lại lịch nhắc');
  assert.throws(() => app.systemPage(asBinh(app)));

  app.runNightly({ triggerUid: nightly(app).id });
  assert.equal(app.readTable_('terms').filter((x) => x.archive_file_id).length, 1, 'không lưu trữ lại lần hai');
});

test('sao lưu giữ 30 bản mới nhất, bản cũ hơn vào thùng rác', () => {
  const { app } = setUp();
  const first = app.backupNow_();
  for (let i = 0; i < 30; i++) app.backupNow_();
  assert.equal(app.backups_().length, 30);
  assert.ok(!app.backups_().some((b) => b.id === first.id));
  assert.equal(app.__files[first.id].trashed, true);
});

test('khôi phục: dùng bản chép của bản sao lưu, file cũ đổi tên và giữ lại, ghi Nhật ký', () => {
  const { app } = setUp();
  const token = asBod(app);
  const oldId = app.dataFile_().getId();
  const b = plain(app.backupNowByBod(token)).backups[0];
  app.insertRecords_('feedback', [{ content: 'Sau lúc sao lưu', is_anonymous: true }], { termId: app.readTable_('terms')[0].term_id });
  assert.equal(app.readTable_('feedback').length, 3);
  assert.throws(() => app.restoreBackup(token, 'khong-co'), /Không tìm thấy/);
  assert.throws(() => app.restoreBackup(asBinh(app), b.id));

  assert.equal(app.restoreBackup(token, b.id), b.name);
  assert.notEqual(app.dataFile_().getId(), oldId);
  assert.notEqual(app.dataFile_().getId(), b.id, 'bản sao lưu giữ nguyên để khôi phục lần nữa');
  assert.equal(app.readTable_('feedback').length, 2);
  assert.match(app.__files[oldId].name, /\(trước khôi phục /);
  assert.ok(app.readTable_('audit_log').some((a) => a.action === 'backup_restore' && /Khôi phục từ/.test(a.new_value)));
  assert.ok(app.openApp(token).user, 'vẫn đăng nhập sau khi khôi phục');
});

test('việc tự chạy lỗi: ghi lại, báo BOD mỗi ngày tối đa một lần', () => {
  const { app } = setUp();
  let sent = 0;
  app.notifyQuietly_ = (items) => { sent += items.length; return { sent: items.length, failed: [] }; };
  assert.throws(() => app.trackJob_('seeding', () => { throw new Error('Hỏng mạng'); }), /Hỏng mạng/);
  assert.throws(() => app.trackJob_('seeding', () => { throw new Error('Hỏng mạng'); }));
  assert.equal(sent, 1);
  const s = plain(app.systemPageFor_()).jobs.find((j) => j.id === 'seeding');
  assert.equal(s.last.ok, false);
  assert.equal(s.last.msg, 'Hỏng mạng');
  assert.equal(app.trackJob_('seeding', () => ({ sent: 2, failed: [] })).sent, 2);
  assert.equal(plain(app.systemPageFor_()).jobs.find((j) => j.id === 'seeding').last.msg, 'Đã gửi 2 tin');
});

test('cài đặt lần đầu dọn lịch chạy và thuộc tính còn sót của bản trước', () => {
  const { loadApp } = require('./gas');
  const { FILES } = require('./sample');
  const app = loadApp(FILES);
  app.__viewer = 'clb@example.com';
  app.__triggers.push('chayHangDem', 'guiThuDaLenLich', 'nhacViecHangNgay');
  Object.assign(app.__props, { IdFileDuLieu: 'file-cu', CauTrucBang: '{}', phien_abc: 'x', bimat_zalo: 'y', baoloi_dem: '1', GIU_LAI: 'z' });
  app.setupApp({ name: 'Nguyễn Văn An', email: 'an@gmail.com', position: 'Chủ nhiệm', password: 'matkhauAn', clubPassword: 'chungCLB' });

  const handlers = app.__triggers.map((t) => (typeof t === 'string' ? t : t.handler));
  ['chayHangDem', 'guiThuDaLenLich', 'nhacViecHangNgay'].forEach((h) => assert.ok(!handlers.includes(h), h));
  assert.ok(handlers.includes('runNightly'));
  ['IdFileDuLieu', 'CauTrucBang', 'phien_abc', 'bimat_zalo', 'baoloi_dem'].forEach((k) => assert.ok(!(k in app.__props), k));
  assert.equal(app.__props.GIU_LAI, 'z');
  assert.ok(app.__props.DATA_FILE_ID);
});
