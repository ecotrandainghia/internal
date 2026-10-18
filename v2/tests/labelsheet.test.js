const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const asBinh = (app) => app.login('binh@gmail.com', 'chungCLB').token;

function sheet(app, head, rows) {
  const ss = app.SpreadsheetApp.create('Sheet nhãn');
  ss.getSheets()[0].data = [head].concat(rows);
  return ss.getUrl();
}
const CORE = ['Họ và tên', 'Email', 'Cách vào core team'];
const UCV = ['Họ và tên', 'Email', 'Vị trí ứng cử'];

test('đọc sheet Core team, UCV: nối bằng email, tên phải khớp, báo dòng lỗi', () => {
  const { app } = setUp();
  const token = asBod(app);
  const link = sheet(app, CORE, [['Tran Thi Binh', 'BINH@gmail.com', 'Top 15% GD1'], ['Lê Chi', 'chi@gmail.com', ''], ['Người Lạ', 'la@gmail.com', 'Đơn'],
    ['Nguyễn Văn An', 'chi@gmail.com', 'Đơn'], ['', '', ''], ['Hà My', '', 'Đơn'], ['Nguyễn Văn Ann', 'an@gmail.com', 'Đơn']]);
  const v = plain(app.previewLabelSheet(token, { type: 'core_team', link }));
  assert.ok(v.errors.includes('Dòng 8: email an@gmail.com là của Nguyễn Văn An trong app, nhưng sheet ghi Nguyễn Văn Ann.'));
  assert.equal(v.errors.length, 5);
  assert.ok(v.errors.includes('Email chi@gmail.com bị lặp (dòng 3 và 5).'));
  assert.ok(v.errors.includes('Dòng 7: thiếu email.'));
  assert.ok(v.errors.includes('Dòng 3 (Lê Chi): chưa ghi Cách vào core team.'));
  assert.ok(v.errors.includes('Dòng 4 (Người Lạ): không có thành viên đang ở CLB với email la@gmail.com.'));
  assert.equal(v.ready, false);
  assert.ok(!v.errors.some((e) => /Dòng 2/.test(e)), 'tên bỏ dấu giống nhau là khớp');
});

test('tải UCV: gắn nhãn người mới (có hộp thư), gỡ người không còn, hoàn tác trả lại', () => {
  const { app, term } = setUp();
  const token = asBod(app);
  let link = sheet(app, UCV, [['Trần Thị Bình', 'binh@gmail.com', 'Chủ nhiệm, Phó']]);
  let r = plain(app.applyLabelSheet(token, { type: 'ucv', link }));
  assert.equal(r.summary, '1 mới vào, 0 rời UCV, 0 giữ nguyên');
  assert.ok(plain(app.openApp(asBinh(app))).user.labels.includes('ucv'));
  assert.equal(r.page.uploads[0].type, 'ucv');
  assert.throws(() => app.applyLabelSheet(token, { type: 'ucv', link }), /giống hệt/);
  link = sheet(app, UCV, [['Lê Chi', 'chi@gmail.com', '']]);
  const v = plain(app.previewLabelSheet(token, { type: 'ucv', link }));
  assert.deepEqual([v.added, v.left, v.kept], [['Lê Chi'], ['Trần Thị Bình'], 0]);
  r = plain(app.applyLabelSheet(token, { type: 'ucv', link }));
  assert.equal(plain(app.openApp(asBinh(app))).user.labels.includes('ucv'), false, 'rời UCV thì mất nhãn');
  assert.equal(app.readTable_('member_labels').filter((l) => l.label_type === 'ucv').length, 2, 'gỡ không xoá dòng');
  const ups = r.page.uploads.filter((u) => u.type === 'ucv');
  assert.deepEqual(ups.map((u) => u.canUndo), [true, false]);
  assert.throws(() => app.undoRoster(token, ups[1].id), /mới nhất/);
  app.undoRoster(token, ups[0].id);
  assert.ok(plain(app.openApp(asBinh(app))).user.labels.includes('ucv'), 'hoàn tác trả lại nhãn');
  assert.deepEqual(plain(app.readTable_('member_labels').filter((l) => l.label_type === 'ucv').map((l) => l.member_id)), ['M1']);
  assert.equal(String(app.readTable_('member_labels').find((l) => l.label_type === 'ucv').term_id), String(term));
});

test('tải Core team: ghi cách vào, đổi cách vào; không đụng lần tải danh sách thành viên', () => {
  const { app } = setUp();
  const token = asBod(app);
  app.applyLabelSheet(token, { type: 'core_team', link: sheet(app, CORE, [['Trần Thị Bình', 'binh@gmail.com', 'Thư mời']]) });
  assert.equal(app.readTable_('member_labels').find((l) => l.label_type === 'core_team').detail, 'Thư mời');
  const v = plain(app.previewLabelSheet(token, { type: 'core_team', link: sheet(app, CORE, [['Trần Thị Bình', 'binh@gmail.com', 'Đơn tuyển']]) }));
  assert.deepEqual([v.added, v.left, v.changed, v.kept, v.ready], [[], [], ['Trần Thị Bình: Đơn tuyển'], 1, true]);
});
