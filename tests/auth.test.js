const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./gas');

const FILES = ['schema.gs', 'records.gs', 'db.gs', 'access.gs', 'auth.gs', 'setup.gs', 'main.gs', 'season.gs', 'system.gs', 'datatabs.gs'];
const BOD = { name: 'Nguyễn  Văn An', email: ' An@Gmail.com ', position: 'Chủ nhiệm', password: 'matkhauAn', clubPassword: 'chungCLB' };

/** App đã cài xong, có một BOD (An). */
function setUp() {
  const app = loadApp(FILES);
  app.__viewer = 'clb@example.com';
  app.setupApp({ ...BOD });
  return app;
}

/** Thêm một thành viên chưa đổi mật khẩu (đăng nhập bằng mật khẩu chung). */
function addMember(app, id, email, extra = {}) {
  app.insertRecords_('members', [{ member_id: id, full_name: 'TV ' + id, email, join_batch: 'D1', join_term_id: '2627' }]);
  app.insertRecords_('member_terms', [{ member_id: id, term_id: '2627', dept_code: extra.dept || 'PR', position: 'Thành viên', status: 'active' }]);
  app.insertRecords_('accounts', [{ member_id: id, theme: 'system' }]);
}

test('trang web: chưa cài thì mở trang cài đặt, cài rồi thì mở app', () => {
  const app = loadApp(FILES);
  assert.equal(app.doGet().name, 'setup_view');
  app.__viewer = 'clb@example.com';
  app.setupApp({ ...BOD });
  const page = app.doGet();
  assert.equal(page.name, 'index');
  assert.equal(page.vars.googleClientId, '');
});

test('cài đặt lần đầu: tạo file dữ liệu, BOD đầu tiên, mật khẩu chung', () => {
  const app = loadApp(FILES);
  app.__viewer = 'clb@example.com';
  const url = app.setupApp({ ...BOD });
  assert.match(url, /\/exec$/);
  assert.ok(app.hasDataFile_());
  const m = app.readTable_('members');
  assert.equal(m.length, 1);
  assert.equal(m[0].full_name, 'Nguyễn Văn An');
  assert.equal(m[0].email, 'an@gmail.com');
  assert.equal(m[0].join_batch, 'CU');
  assert.match(m[0].member_id, /CU/);
  const t = app.readTable_('member_terms')[0];
  assert.equal(t.dept_code, 'BOD');
  assert.equal(t.status, 'active');
  const a = app.readTable_('accounts')[0];
  assert.ok(a.password_hash && a.password_salt);
  assert.equal(a.password_changed, true);
  assert.ok(app.__props.secret_default_password_hash);
  // Mật khẩu không nằm trong file dữ liệu ở dạng chữ thường
  assert.ok(!JSON.stringify(Object.values(app.__files)[0].sheets.map((s) => s.data)).includes('matkhauAn'));
  assert.throws(() => app.setupApp({ ...BOD }), /đã được cài đặt/);
});

test('cài đặt lần đầu: kiểm tra thông tin nhập', () => {
  const app = loadApp(FILES);
  app.__viewer = 'clb@example.com';
  assert.throws(() => app.setupApp({ ...BOD, name: ' ' }), /họ tên/);
  assert.throws(() => app.setupApp({ ...BOD, email: 'an' }), /Email/);
  assert.throws(() => app.setupApp({ ...BOD, clubPassword: '123' }), /6 ký tự/);
  assert.throws(() => app.setupApp({ ...BOD, clubPassword: BOD.password }), /nên khác/);
  assert.ok(!app.hasDataFile_());
});

test('cài đặt lần đầu: người khác phải nhập mã gửi tới email CLB, đoán sai 5 lần thì mã bị huỷ', () => {
  const app = loadApp(FILES);
  app.__viewer = '';
  assert.throws(() => app.setupApp({ ...BOD }), /Mã chưa đúng/);
  assert.equal(app.sendSetupCode(), 'c***@example.com');
  assert.equal(app.__mails.length, 1);
  assert.equal(app.__mails[0].to, 'clb@example.com');
  assert.throws(() => app.sendSetupCode(), /Vừa gửi mã/);
  const code = app.__cache.setup_code;
  for (let i = 0; i < 4; i++) assert.throws(() => app.setupApp({ ...BOD, code: '000000' }), /Mã chưa đúng/);
  assert.equal(app.__cache.setup_code, code);
  assert.throws(() => app.setupApp({ ...BOD, code: '000000' }), /Mã chưa đúng/);
  assert.equal(app.__cache.setup_code, undefined);
  assert.throws(() => app.setupApp({ ...BOD, code }), /Mã chưa đúng/);

  delete app.__cache.setup_code_sent;
  app.sendSetupCode();
  app.setupApp({ ...BOD, code: ' ' + app.__cache.setup_code + ' ' });
  assert.ok(app.hasDataFile_());
  assert.equal(app.__cache.setup_code, undefined);
});

test('đăng nhập bằng mật khẩu riêng: lần đầu thì firstLogin, lần sau thì không', () => {
  const app = setUp();
  const r = app.login('AN@gmail.com', BOD.password);
  assert.ok(r.token.length >= 20);
  assert.equal(r.user.isBod, true);
  assert.equal(r.user.firstLogin, true);
  assert.equal(r.user.name, 'Nguyễn Văn An');
  assert.ok(app.readTable_('accounts')[0].last_login_at);
  assert.equal(app.login('an@gmail.com', BOD.password).user.firstLogin, false);
});

test('đăng nhập sai: cùng một câu báo, không lộ email nào có tài khoản', () => {
  const app = setUp();
  assert.throws(() => app.login('an@gmail.com', 'sai mat khau'), /^Error: Email hoặc mật khẩu không đúng\.$/);
  assert.throws(() => app.login('ai@gmail.com', BOD.password), /^Error: Email hoặc mật khẩu không đúng\.$/);
  // BOD đã có mật khẩu riêng thì mật khẩu chung không dùng được cho BOD
  assert.throws(() => app.login('an@gmail.com', BOD.clubPassword), /không đúng/);
});

test('thành viên chưa đổi mật khẩu thì đăng nhập bằng mật khẩu chung', () => {
  const app = setUp();
  addMember(app, '2627D1001', 'binh@gmail.com');
  const r = app.login('binh@gmail.com', BOD.clubPassword);
  assert.equal(r.user.isBod, false);
  assert.equal(r.user.passwordChanged, false);
  assert.throws(() => app.requireUser_(r.token, 'bod'), /Chỉ BOD/);
  assert.equal(app.requireUser_(r.token).memberId, '2627D1001');
});

test('đã rời CLB thì không đăng nhập được, phiên cũ cũng hết', () => {
  const app = setUp();
  addMember(app, '2627D1001', 'binh@gmail.com');
  const { token } = app.login('binh@gmail.com', BOD.clubPassword);
  app.updateRecord_('member_terms', { member_id: '2627D1001', term_id: '2627' }, { status: 'left' });
  assert.throws(() => app.login('binh@gmail.com', BOD.clubPassword), /đã ngừng/);
  assert.equal(app.openApp(token), null);
  assert.equal(app.readSession_(token), null);
});

test('mở lại app: nhớ phiên, gia hạn khi cần; đăng xuất thì hết phiên', () => {
  const app = setUp();
  const { token } = app.login('an@gmail.com', BOD.password);
  const key = 'session_' + token;
  const s = JSON.parse(app.__props[key]);
  s.exp = Date.now() + 10 * 864e5;
  app.__props[key] = JSON.stringify(s);
  const r = app.openApp(token);
  assert.equal(r.user.email, 'an@gmail.com');
  assert.ok(JSON.parse(app.__props[key]).exp > Date.now() + 59 * 864e5);
  assert.equal(app.openApp('khong-phai-ma-phien'), null);
  assert.equal(app.openApp(''), null);
  app.logout(token);
  assert.equal(app.openApp(token), null);
  assert.throws(() => app.saveTheme(token, 'dark'), /SESSION_EXPIRED/);
});

test('phiên hết hạn bị xoá khi có người đăng nhập', () => {
  const app = setUp();
  const { token } = app.login('an@gmail.com', BOD.password);
  app.__props['session_' + token] = JSON.stringify({ memberId: 'x', exp: Date.now() - 1 });
  app.__props['session_hong'] = 'không phải JSON';
  app.login('an@gmail.com', BOD.password);
  assert.equal(app.__props['session_' + token], undefined);
  assert.equal(app.__props['session_hong'], undefined);
});

test('đổi mật khẩu: kiểm tra mật khẩu cũ, máy khác phải đăng nhập lại', () => {
  const app = setUp();
  addMember(app, '2627D1001', 'binh@gmail.com');
  const a = app.login('binh@gmail.com', BOD.clubPassword).token;
  const b = app.login('binh@gmail.com', BOD.clubPassword).token;
  const other = app.login('an@gmail.com', BOD.password).token;
  assert.throws(() => app.changePassword(a, 'sai', 'moi123456'), /hiện tại không đúng/);
  assert.throws(() => app.changePassword(a, BOD.clubPassword, '123'), /6 ký tự/);
  app.changePassword(a, BOD.clubPassword, 'moi123456');
  assert.ok(app.openApp(a));
  assert.equal(app.openApp(b), null);
  assert.ok(app.openApp(other));
  assert.equal(app.openApp(a).user.passwordChanged, true);
  assert.throws(() => app.login('binh@gmail.com', BOD.clubPassword), /không đúng/);
  assert.ok(app.login('binh@gmail.com', 'moi123456').token);
});

test('lưu giao diện và đồng ý dùng dữ liệu', () => {
  const app = setUp();
  const { token } = app.login('an@gmail.com', BOD.password);
  assert.equal(app.saveTheme(token, 'dark'), 'dark');
  assert.throws(() => app.saveTheme(token, 'xanh'), /không hợp lệ/);
  assert.equal(app.openApp(token).user.theme, 'dark');
  app.setDataConsent(token, true);
  assert.equal(app.openApp(token).user.dataConsent, true);
  app.setDataConsent(token, false);
  assert.equal(app.openApp(token).user.dataConsent, false);
});

test('đăng nhập Google: phải bật trong Cài đặt, hỏi lại Google, email phải có trong danh sách', () => {
  const app = setUp();
  assert.throws(() => app.loginWithGoogle('abc'), /chưa bật/);
  app.setSetting_('google_client_id', 'cid.apps.googleusercontent.com');
  assert.equal(app.doGet().vars.googleClientId, 'cid.apps.googleusercontent.com');
  let info = { email: 'an@gmail.com', aud: 'cid.apps.googleusercontent.com', iss: 'accounts.google.com', email_verified: 'true',
    exp: String(Math.floor(Date.now() / 1000) + 600) };
  let asked = '';
  app.__fetch = (url) => { asked = url; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(info) }; };
  const r = app.loginWithGoogle('ma/token');
  assert.match(asked, /tokeninfo\?id_token=ma%2Ftoken$/);
  assert.equal(r.user.email, 'an@gmail.com');
  info = { ...info, email: 'la@gmail.com' };
  assert.throws(() => app.loginWithGoogle('x'), /Email la@gmail.com chưa có tài khoản/);
  info = { ...info, email: 'an@gmail.com', aud: 'khac' };
  assert.throws(() => app.loginWithGoogle('x'), /không phải của app/);
  app.__fetch = () => ({ getResponseCode: () => 400, getContentText: () => '{}' });
  assert.throws(() => app.loginWithGoogle('x'), /Không xác nhận/);
});
