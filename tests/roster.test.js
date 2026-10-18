const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const DAY = 864e5;
const ago = (ms) => new Date(Date.now() - ms);
const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const HEAD = ['Họ và tên', 'Ngày sinh', 'Email', 'Ban', 'Lớp'];

/** Sheet danh sách thành viên giả (dòng đầu là tiêu đề CLB, dòng 2 là tiêu đề cột). Trả về link. */
function sheet(app, rows, head = HEAD) {
  const ss = app.SpreadsheetApp.create('DS thành viên');
  ss.getSheets()[0].data = [['DANH SÁCH THÀNH VIÊN CLB ECO'], head].concat(rows);
  return ss.getUrl();
}

/** Đóng mọi việc còn sót của GD1 mẫu: chốt sự kiện, bỏ tính các task. */
function closePhase1(app) {
  const ev = app.readTable_('events')[0].event_id;
  app.insertRecords_('event_closings', [{ event_id: ev, status: 'closed' }]);
  app.readTable_('tasks').forEach((t) => app.updateRecord_('tasks', t.task_id, { is_counted: false }));
}

test('đọc sheet: tìm dòng tiêu đề, đọc ngày sinh dạng chữ, báo dòng lỗi', () => {
  const { app } = setUp();
  const r = app.readRoster_([['DANH SÁCH'], HEAD.concat(['Mảng']),
    ['  Phạm  Dũng ', '05/09/2009', 'DUNG@gmail.com', 'pr', '10A1', 'des'],
    ['Hà My', '31/02/2009', 'my@gmail.com', 'AD', '', ''],
    ['Lý Na', '', 'dung@gmail.com', '', '', ''],
    ['', '', '', '', '', ''],
    ['Phạm Dũng', '05/09/2009', '', 'PR', '', '']]);
  const p = plain(r.people[0]);
  assert.deepEqual([p.row, p.name, p.email, p.dept, p.sub, p.cls], [3, 'Phạm Dũng', 'dung@gmail.com', 'PR', 'DES', '10A1']);
  assert.equal(r.people[0].birth.getDate(), 5);
  assert.equal(r.people[0].birth.getMonth(), 8);
  assert.equal(r.people[2].birth, null, 'ô trống là chưa có ngày sinh');
  assert.equal(r.people.length, 4);
  assert.deepEqual(plain(r.errors), [
    'Dòng 4 (Hà My): ngày sinh "31/02/2009" không đọc được, ghi dạng ngày/tháng/năm.',
    'Dòng 5 (Lý Na): chưa có ban.',
    'Email dung@gmail.com bị trùng (dòng 3 và 5).',
    'Dòng 7: Phạm Dũng bị lặp với dòng 3. Hai người trùng tên thì ghi ngày sinh để phân biệt.'
  ]);
  assert.equal(r.people[0].phone, undefined, 'không có cột thì để undefined (giữ giá trị cũ)');
  assert.deepEqual(plain(app.readRoster_([['Tên', 'Lớp']]).errors), ['Không thấy dòng tiêu đề có cột Họ và tên và cột Ban.']);
});

test('nhận ra người cũ: đúng tên, trùng tên thì so ngày sinh, gần giống thì hỏi BOD, BOD chọn rồi thì theo', () => {
  const { app } = setUp();
  const d = (y, m, day) => new Date(y, m - 1, day);
  const members = [
    { member_id: 'A', full_name: 'Trần Thị Bình', birth_date: d(2009, 1, 1) },
    { member_id: 'B', full_name: 'Lê Chi', birth_date: d(2009, 2, 2) },
    { member_id: 'C', full_name: 'Lê Chi', birth_date: d(2009, 3, 3) },
    { member_id: 'D', full_name: 'Nguyễn Hoàng Long', birth_date: null }
  ];
  const people = [
    { row: 3, name: 'Trần Thị Bình', birth: null },
    { row: 4, name: 'Lê Chi', birth: d(2009, 3, 3) },
    { row: 5, name: 'Nguyễn Hoàng Lông', birth: null },
    { row: 6, name: 'Người Mới Toanh', birth: null },
    { row: 7, name: 'lê   chi', birth: null }
  ];
  const ids = (decisions) => plain(app.matchRoster_(people, members, decisions)).map((x) => [x.person.row, x.memberId, x.ask.map((a) => a.id)]);
  assert.deepEqual(ids(), [[3, 'A', []], [4, 'C', []], [5, null, ['D']], [6, '', []], [7, 'B', []]]);
  assert.deepEqual(ids({ 5: 'D' }).slice(2, 3), [[5, 'D', []]]);
  assert.deepEqual(ids({ 5: 'new' }).slice(2, 3), [[5, '', []]]);
  const same = [{ row: 3, name: 'Lê Chi', birth: null }];
  assert.deepEqual(plain(app.matchRoster_(same, members)).map((x) => [x.memberId, x.ask.map((a) => a.id)]), [[null, ['B', 'C']]], 'trùng tên mà sheet không có ngày sinh thì hỏi');
});

test('xem trước Cập nhật: người mới, chuyển ban, người rời, ban lạ, thiếu email, người tải phải còn ở BOD', () => {
  const { app, term } = setUp();
  const token = asBod(app);
  let link = sheet(app, [['Nguyễn Văn An', '', '', 'BOD', ''], ['Trần Thị Bình', '', '', 'AD', '11A1'], ['Phạm Dũng', '05/09/2009', '', 'PR', '10A1'], ['Hà My', '', 'my@gmail.com', 'XYZ', '']]);
  let v = plain(app.previewRoster(token, { kind: 'update', link }));
  assert.deepEqual(v.deptProblems, [{ code: 'XYZ', people: 1, inactive: false }]);
  assert.equal(v.ready, false);
  link = sheet(app, [['Nguyễn Văn An', '', '', 'BOD', ''], ['Trần Thị Bình', '', '', 'AD', '11A1'], ['Phạm Dũng', '05/09/2009', '', 'PR', '10A1']]);
  v = plain(app.previewRoster(token, { kind: 'update', link }));
  assert.deepEqual([v.ready, v.termId, v.added, v.stayed, v.left, v.moved, v.noEmail, v.phaseText],
    [true, term, ['Phạm Dũng'], 2, ['Lê Chi'], ['Trần Thị Bình: PR → AD'], ['Phạm Dũng'], 'Không đổi giai đoạn.']);
  link = sheet(app, [['Nguyễn Văn An', '', '', 'PR', '']]);
  assert.match(plain(app.previewRoster(token, { kind: 'update', link })).errors[0], /Sheet không có bạn \(Nguyễn Văn An\) ở ban BOD/);
  assert.throws(() => app.previewRoster(token, { kind: 'batch_1', link }), /đã tải đợt 1 rồi/);
  assert.throws(() => app.previewRoster(token, { kind: 'update', link: 'abc' }), /dán link Google Sheets/);
  assert.equal(app.readTable_('members').length, 3, 'xem trước không ghi gì');
});

test('tải Cập nhật rồi hoàn tác: thêm người, sửa thông tin, người rời; hoàn tác trả lại như cũ', () => {
  const { app, term } = setUp();
  const token = asBod(app);
  app.syncBirthdayCalendar_ = () => null;
  const link = sheet(app, [['Nguyễn Văn An', '', '', 'BOD', ''], ['Trần Thị Bình', '01/01/2009', 'binh2@gmail.com', 'PR', '11A1'], ['Phạm Dũng', '05/09/2009', 'dung@gmail.com', 'PR', '10A1']]);
  const before = plain({ members: app.readTable_('members'), terms: app.readTable_('member_terms') });
  const r = plain(app.applyRoster(token, { kind: 'update', link }));
  assert.equal(r.summary, '1 mới, 2 ở lại, 1 rời');
  const dung = app.readTable_('members').find((m) => m.full_name === 'Phạm Dũng');
  assert.equal(dung.member_id, term + '-D1-001', 'tải giữa GD1 thì mã đợt là D1');
  assert.equal(dung.email, 'dung@gmail.com');
  assert.ok(app.findRecord_('accounts', dung.member_id));
  assert.equal(app.findRecord_('members', 'M1').email, 'binh2@gmail.com');
  assert.equal(app.findRecord_('member_terms', { member_id: 'M2', term_id: term }).status, 'left');
  const up = app.readTable_('roster_uploads')[0];
  assert.deepEqual([up.batch_type, up.status, up.summary], ['update', 'applied', '1 mới, 2 ở lại, 1 rời']);
  const copy = app.SpreadsheetApp.openById(app.idFromUrl_(up.copy_url));
  assert.ok(copy.getSheetByName('_undo'), 'bản chép có tab _undo');
  assert.equal(app.readTable_('audit_log').filter((a) => a.action === 'upload_sheet').length, 1);
  assert.equal(r.page.uploads[0].canUndo, true);
  assert.equal(r.page.link, link, 'nhớ link sheet cho lần tải sau');

  app.undoRoster(token, up.upload_id);
  assert.deepEqual(plain({ members: app.readTable_('members'), terms: app.readTable_('member_terms') }), before);
  assert.equal(app.findRecord_('accounts', dung.member_id), null);
  assert.equal(app.findRecord_('roster_uploads', up.upload_id).status, 'undone');
  assert.throws(() => app.undoRoster(token, up.upload_id), /mới nhất/);
});

test('hoàn tác bị chặn khi người mới đã có điểm, hoặc đã quá 7 ngày', () => {
  const { app, term, bod } = setUp();
  const token = asBod(app);
  app.syncBirthdayCalendar_ = () => null;
  const link = sheet(app, [['Nguyễn Văn An', '', '', 'BOD', ''], ['Trần Thị Bình', '', '', 'PR', ''], ['Lê Chi', '', '', 'AD', ''], ['Phạm Dũng', '', '', 'PR', '']]);
  app.applyRoster(token, { kind: 'update', link });
  const up = app.readTable_('roster_uploads')[0];
  app.insertRecords_('point_entries', [{ member_id: term + '-D1-001', activity_id: 'HD-0001', points: 5, awarded_at: new Date(), awarded_by: bod, source: 'manual' }], { termId: term });
  assert.throws(() => app.undoRoster(token, up.upload_id), /người mới đã có task, điểm danh, điểm hoặc nhãn: Phạm Dũng/);
  app.updateRecord_('roster_uploads', up.upload_id, { uploaded_at: ago(8 * DAY) });
  assert.throws(() => app.undoRoster(token, up.upload_id), /quá 7 ngày/);
});

test('tải đợt 2: chặn khi GD1 còn việc, xong thì chụp kết quả GD1 và mở GD2; hoàn tác bỏ ảnh chụp', () => {
  const { app, term } = setUp();
  const token = asBod(app);
  app.syncBirthdayCalendar_ = () => null;
  const link = sheet(app, [['Nguyễn Văn An', '', '', 'BOD', ''], ['Trần Thị Bình', '', '', 'PR', ''], ['Lê Chi', '', '', 'AD', ''], ['Phạm Dũng', '', '', 'PR', '']]);
  let v = plain(app.previewRoster(token, { kind: 'batch_2', link }));
  assert.equal(v.ready, false);
  assert.ok(v.blockers.includes('Sự kiện “Ngày hội Xanh” chưa chốt'));
  assert.ok(v.blockers.some((b) => /^Task “Dựng video” còn 1 người chưa có kết quả$/.test(b)));
  assert.throws(() => app.applyRoster(token, { kind: 'batch_2', link }), /Chưa tải được/);
  closePhase1(app);
  v = plain(app.previewRoster(token, { kind: 'batch_2', link }));
  assert.deepEqual([v.ready, v.blockers], [true, []]);
  assert.deepEqual(v.top, [], 'GD1 chỉ có 2 người xếp hạng, 15% chưa tới 1 người');
  app.applyRoster(token, { kind: 'batch_2', link });
  assert.equal(app.readTable_('members').find((m) => m.full_name === 'Phạm Dũng').member_id, term + '-D2-001');
  assert.ok(app.findRecord_('terms', term).phase2_start_at);
  assert.ok(app.readTable_('phase_results').some((r) => r.summary_round === 'round_1'));
  app.undoRoster(token, app.readTable_('roster_uploads')[0].upload_id);
  assert.ok(!app.findRecord_('terms', term).phase2_start_at);
  assert.equal(app.readTable_('phase_results').length, 0);
});

test('kết thúc nhiệm kỳ rồi tải Oday nhiệm kỳ mới: người cũ không có trong sheet thành Đã rời, BOD cũ giữ tới đợt 1', () => {
  const { app, term, bod } = setUp();
  const token = asBod(app);
  app.syncBirthdayCalendar_ = () => null;
  assert.throws(() => app.endTerm(token), /đang ở GD2/);
  closePhase1(app);
  app.updateRecord_('terms', term, { phase2_start_at: ago(DAY) });
  app.insertRecords_('seeding_posts', [{ post_url: 'https://facebook.com/p/1', created_by: bod, created_at: ago(3600e3), status: 'waiting' }], { termId: term });
  assert.match(plain(app.rosterPage(token)).endBlockers[0], /^Bài seeding https:\/\/facebook\.com\/p\/1 chưa ghi nhận$/);
  assert.throws(() => app.endTerm(token), /Còn việc chưa xong của GD2/);
  app.updateRecord_('seeding_posts', app.readTable_('seeding_posts')[0].post_id, { status: 'recorded' });
  app.PropertiesService.getScriptProperties().setProperty(app.SEEDING_FILE_PROP + term, 'gone');
  const page = plain(app.endTerm(token));
  const next = app.nextTermId_(term);
  assert.equal(page.term.id, next);
  assert.equal(page.term.phase, 'prep');
  assert.deepEqual(page.kinds.filter((k) => !k.block).map((k) => k.kind), ['oday', 'batch_1', 'update']);
  assert.ok(app.readTable_('phase_results').some((r) => r.summary_round === 'round_2'));

  const link = sheet(app, [['Nguyễn Văn An', '', '', 'BOD', ''], ['Trần Thị Bình', '', '', 'BOD', '']]);
  const v = plain(app.applyRoster(token, { kind: 'oday', link })).view;
  assert.deepEqual([v.termId, v.added, v.left], [next, [], ['Lê Chi']]);
  const rows = app.readTable_('member_terms').filter((r) => String(r.term_id) === next).map((r) => [r.member_id, r.dept_code, r.status]);
  assert.deepEqual(plain(rows).sort(), [[bod, 'BOD', 'active'], ['M1', 'BOD', 'active'], ['M2', 'AD', 'left']]);
  assert.match(plain(app.rosterPage(token)).nextStep, /tuyển đợt 1 xong thì tải sheet đợt 1/);
});
