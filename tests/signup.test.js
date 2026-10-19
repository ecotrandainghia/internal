const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const { FakeSpreadsheet } = require('./gas');

const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const ID = 'abcdefghijklmnopqrstuvwxyz';

test('đọc sheet: tìm dòng tiêu đề, dừng ở Ghi chú, ban gộp ô lấy của dòng trên', () => {
  const { app } = setUp();
  const v = [
    ['Đăng ký log · Oday'], [''],
    ['Số người đăng ký', '', '', '', 2, 1, ''],
    ['STT', 'Họ và tên', 'Lớp', 'Ban', 'Thứ 7', ' thu 7  (chiều) ', 'Ghi chú', 'Không đọc'],
    [1, 'Trần Thị Bình', '11A1', 'PR', true, false, '', true],
    [2, 'Lê Chi', '11A2', '', 'TRUE', true, 'bận'],
    [3, '', '', '', true, true]
  ];
  const L = plain(app.signupLayoutOf_(v, false));
  assert.deepEqual(L, { row: 3, name: 1, dept: 3, first: 4, end: 6, countRow: 2 });
  const cols = plain(app.readSignup_(v, false));
  assert.deepEqual(cols.map((c) => [c.name, c.people.map((p) => p.name + '/' + p.dept)]),
    [['Thứ 7', ['Trần Thị Bình/PR', 'Lê Chi/PR']], ['thu 7  (chiều)', ['Lê Chi/PR']]]);
  assert.equal(app.signupColumn_(cols, 'Thu 7 (CHIỀU)').col, 5);
  assert.equal(app.signupColumn_(cols, 'Chủ nhật'), null);
  assert.deepEqual(plain(app.readSignup_([['không có tiêu đề']], false)), []);
});

test('đọc sheet mẫu tool cũ: dòng 4 là tên buổi từ cột E, tên ở cột A', () => {
  const { app } = setUp();
  const v = [['ECO'], [''], ['Họ và tên', 'Lớp', 'Ban', 'SĐT', 3, ''], ['', '', '', '', 'Buổi 1', 'Ghi chú'], ['Lê Chi', '11A2', 'AD', '09', true, '']];
  assert.deepEqual(plain(app.readSignup_(v, true)).map((c) => [c.name, c.people.length]), [['Buổi 1', 1]]);
});

test('ghép tên: bỏ dấu, trùng tên thì xem cột Ban', () => {
  const { app } = setUp();
  const people = [{ id: 'A', name: 'Nguyễn An', dept: 'PR', deptName: 'Truyền thông' }, { id: 'B', name: 'Nguyen An', dept: 'AD', deptName: 'Ban Đối ngoại' },
    { id: 'C', name: 'Lê Chi', dept: 'PR', deptName: 'Truyền thông' }];
  const r = plain(app.matchSignup_([{ name: 'le  chi', dept: '' }, { name: 'Nguyễn An', dept: 'Truyền thông' }, { name: 'Nguyễn An', dept: '' }, { name: 'Người lạ', dept: 'PR' }], people));
  assert.deepEqual(r, { ids: ['C', 'A'], unmatched: ['Nguyễn An', 'Người lạ'] });
  assert.equal(app.idFromUrl_('https://docs.google.com/spreadsheets/d/' + ID + '/edit#gid=0'), ID);
  assert.equal(app.idFromUrl_('xin chào'), '');
  assert.deepEqual([app.colLetter_(1), app.colLetter_(5), app.colLetter_(27)], ['A', 'E', 'AA']);
});

test('tạo sheet đăng ký: bảng app tự kẻ, ai có link sửa được, đọc lại khi điểm danh, thêm cột cho buổi mới', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const ev = app.readTable_('events')[0].event_id;
  const s1 = app.readTable_('log_sessions')[0].session_id;
  app.saveSession(tok, { eventId: ev, name: 'Chủ nhật', duration: 90 });
  let d = plain(app.createSignupSheet(tok, ev));
  assert.ok(d.event.signupUrl);
  assert.equal(d.notice, '');
  assert.throws(() => app.createSignupSheet(tok, ev), /đã có sheet đăng ký/);
  const ss = Object.values(app.__files).find((f) => f.name === '[APP] Đăng ký log · Ngày hội Xanh');
  assert.equal(ss.sharing, 'anyone_with_link:edit');
  assert.equal(ss.folder, '[APP] Đăng ký log');
  const sh = ss.getSheetByName('Đăng ký');
  // BOD không có trong sheet; người xếp theo ban (PR trước AD theo Cơ cấu ban)
  assert.deepEqual(sh.data[3], ['STT', 'Họ và tên', 'Lớp', 'Ban', 'Thứ 7', 'Chủ nhật', 'Ghi chú']);
  assert.deepEqual(sh.data.slice(4).map((l) => l.slice(0, 6)), [[1, 'Trần Thị Bình', '11A1', 'PR', false, false], [2, 'Lê Chi', '11A2', 'AD', false, false]]);
  assert.equal(sh.data[2][4], '=COUNTIF(E5:E6,TRUE)');
  assert.deepEqual(ss.getSheetByName('Kế hoạch').data.map((l) => l[0]), ['Buổi', 'Thứ 7', 'Chủ nhật']);

  // Bình tích Thứ 7, Chi tích cả hai
  sh.data[4][4] = true; sh.data[5][4] = true; sh.data[5][5] = true;
  let r = plain(app.signupFor(tok, s1));
  assert.deepEqual([r.found, r.ids, r.total, r.unmatched], [true, ['M1', 'M2'], 2, []]);

  // Buổi tạo sau khi đã có sheet: chưa có cột, bấm thêm cột thì chèn trước Ghi chú
  d = plain(app.saveSession(tok, { eventId: ev, name: 'Thứ 7 tuần sau', duration: 90 }));
  const s3 = d.event.sessions.find((x) => x.name === 'Thứ 7 tuần sau').id;
  assert.equal(app.signupFor(tok, s3).found, false);
  r = plain(app.addSignupColumn(tok, s3));
  assert.deepEqual([r.found, r.ids], [true, []]);
  assert.deepEqual(sh.data[3].slice(4), ['Thứ 7', 'Chủ nhật', 'Thứ 7 tuần sau', 'Ghi chú']);
  assert.equal(sh.data[2][6], '=COUNTIF(G5:G6,TRUE)');
  assert.deepEqual(sh.data.slice(4).map((l) => l[6]), [false, false]);
  assert.equal(ss.getSheetByName('Kế hoạch').data[3][0], 'Thứ 7 tuần sau');
  const log = app.readTable_('audit_log').filter((x) => x.action === 'change_setting' && x.row_id === 'log_signup_' + ev);
  assert.equal(log.length, 1);
});

test('dán link sheet có sẵn, bỏ liên kết; file mẫu phải là mẫu tool cũ', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const ev = app.readTable_('events')[0].event_id;
  assert.throws(() => app.setSignupLink(tok, ev, 'không phải link'), /chưa đúng/);
  const blank = new FakeSpreadsheet(ID);
  app.__files[ID] = blank;
  assert.throws(() => app.setSignupLink(tok, ev, 'https://docs.google.com/spreadsheets/d/' + ID), /không có bảng đăng ký/);
  blank.sheets[0].data = [['Họ và tên', 'Thứ 7'], ['Lê Chi', true], ['Ai đó', true]];
  let d = plain(app.setSignupLink(tok, ev, 'https://docs.google.com/spreadsheets/d/' + ID + '/edit'));
  assert.equal(d.event.signupUrl, 'https://docs.google.com/spreadsheets/d/' + ID);
  const r = plain(app.signupFor(tok, app.readTable_('log_sessions')[0].session_id));
  assert.deepEqual([r.ids, r.unmatched], [['M2'], ['Ai đó']]);
  d = plain(app.setSignupLink(tok, ev, ''));
  assert.equal(d.event.signupUrl, '');
  assert.throws(() => app.saveLogFiles(tok, { templateUrl: ID }), /tab “Đăng ký log”/);
  assert.throws(() => app.signupFor(app.login('binh@gmail.com', 'chungCLB').token, 'x'), /Chỉ BOD/);
});

test('tạo từ file mẫu tool cũ: chép mẫu, điền người, không chép số điện thoại', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const ev = app.readTable_('events')[0].event_id;
  const tpl = new FakeSpreadsheet(ID);
  tpl.sheets[0].name = 'Đăng ký log';
  tpl.sheets[0].data = [['ĐĂNG KÝ LOG'], [''], ['Họ và tên', 'Lớp', 'Ban', 'SĐT', '', ''], ['', '', '', '', 'Buổi', 'Ghi chú']];
  app.__files[ID] = tpl;
  app.saveLogFiles(tok, { templateUrl: 'https://docs.google.com/spreadsheets/d/' + ID });
  const d = plain(app.createSignupSheet(tok, ev));
  const ss = app.__files[app.idFromUrl_(d.event.signupUrl)];
  const sh = ss.getSheetByName('Đăng ký log');
  assert.equal(sh.data[3][4], 'Thứ 7');
  assert.deepEqual(sh.data[4].slice(0, 5), ['Trần Thị Bình', '11A1', 'PR', '', false]);
  assert.equal(sh.data[2][4], '=COUNTIF(E5:E6,TRUE)');
  assert.equal(tpl.sheets[0].data[3][4], 'Buổi');
  assert.deepEqual(plain(app.signupFor(tok, app.readTable_('log_sessions')[0].session_id)).found, true);
});
