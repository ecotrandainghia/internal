const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const asBinh = (app) => app.login('binh@gmail.com', 'chungCLB').token;

test('phân quyền nhân sự: gán, chặn trùng, gỡ thì mất quyền ngay mà vẫn giữ dòng', () => {
  const { app, term } = setUp();
  const token = asBod(app);
  assert.throws(() => app.accountAdmin(asBinh(app)), /Chỉ BOD/);
  let d = plain(app.accountAdmin(token));
  assert.deepEqual(d.people.map((p) => [p.name, p.dept]), [['Nguyễn Văn An', 'BOD'], ['Lê Chi', 'AD'], ['Trần Thị Bình', 'PR']]);
  assert.deepEqual(d.leads.dept_lead.map((l) => [l.name, l.dept]), [['Lê Chi', 'PR']]);
  assert.throws(() => app.addStaffLabel(token, { type: 'dept_lead', memberId: 'M1', dept: '' }), /Chọn ban/);
  assert.throws(() => app.addStaffLabel(token, { type: 'dept_lead', memberId: 'M2', dept: 'PR' }), /Lê Chi đã là NS phụ trách ban PR rồi/);
  assert.throws(() => app.addStaffLabel(token, { type: 'boss', memberId: 'M1' }), /không hợp lệ/);
  d = plain(app.addStaffLabel(token, { type: 'dept_lead', memberId: 'M2', dept: 'hr' }));
  assert.deepEqual(d.leads.dept_lead.map((l) => [l.name, l.dept]), [['Lê Chi', 'HR'], ['Lê Chi', 'PR']]);
  d = plain(app.addStaffLabel(token, { type: 'seeding_lead', memberId: 'M1', dept: 'PR' }));
  assert.deepEqual(d.leads.seeding_lead.map((l) => [l.id, l.dept]), [['M1', '']]);
  assert.equal(plain(app.openApp(asBinh(app))).user.labels.includes('seeding_lead'), true);
  d = plain(app.removeStaffLabel(token, d.leads.seeding_lead[0].labelId));
  assert.deepEqual(d.leads.seeding_lead, []);
  assert.equal(plain(app.openApp(asBinh(app))).user.labels.includes('seeding_lead'), false);
  assert.equal(app.readTable_('member_labels').filter((l) => l.label_type === 'seeding_lead').length, 1, 'gỡ không xoá dòng');
  const logs = app.readTable_('audit_log').filter((a) => a.table_name === 'member_labels');
  assert.ok(logs.length >= 3, 'ghi Nhật ký');
  assert.equal(d.termLabel, app.termLabel_(term));
});

test('đặt lại mật khẩu về mật khẩu chung, đổi mật khẩu chung, bật đăng nhập Google', () => {
  const { app } = setUp();
  const token = asBod(app);
  const binh = asBinh(app);
  app.changePassword(binh, 'chungCLB', 'binhMoi123');
  assert.throws(() => app.login('binh@gmail.com', 'chungCLB'), /không đúng/);
  assert.equal(plain(app.accountAdmin(token)).people.find((p) => p.id === 'M1').ownPassword, true);
  assert.throws(() => app.resetPassword(token, app.readTable_('members')[0].member_id), /Tài khoản của tôi/);
  app.resetPassword(token, 'M1');
  assert.equal(app.openApp(app.login('binh@gmail.com', 'chungCLB').token).user.name, 'Trần Thị Bình');
  assert.equal(app.openApp(binh), null, 'máy cũ phải đăng nhập lại');
  assert.throws(() => app.changeClubPassword(token, '1'), /.+/);
  app.changeClubPassword(token, 'chungMoi2026');
  assert.ok(app.login('chi@gmail.com', 'chungMoi2026').token);
  assert.ok(app.login('an@gmail.com', 'matkhauAn').token, 'người có mật khẩu riêng không bị ảnh hưởng');
  assert.throws(() => app.saveGoogleClientId(token, 'abc'), /chưa đúng dạng/);
  assert.equal(plain(app.saveGoogleClientId(token, '123-abc.apps.googleusercontent.com')).googleClientId, '123-abc.apps.googleusercontent.com');
  assert.equal(app.getSetting_('google_client_id', ''), '123-abc.apps.googleusercontent.com');
  assert.equal(plain(app.saveGoogleClientId(token, '')).googleClientId, '');
});
