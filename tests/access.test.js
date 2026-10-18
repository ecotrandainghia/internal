const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { loadApp } = require('./gas');
const plain = (x) => JSON.parse(JSON.stringify(x));

const app = loadApp(['schema.gs', 'records.gs', 'access.gs']);
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

test('nhiệm kỳ theo ngày: năm học bắt đầu từ tháng 8', () => {
  assert.equal(app.termIdForDate_(new Date(2026, 9, 18)), '2627');
  assert.equal(app.termIdForDate_(new Date(2027, 2, 1)), '2627');
  assert.equal(app.termIdForDate_(new Date(2027, 6, 31)), '2627');
  assert.equal(app.termIdForDate_(new Date(2027, 7, 1)), '2728');
  assert.equal(app.termIdForDate_(new Date(2099, 8, 1)), '9900');
  assert.equal(app.termIdForDate_(new Date(2100, 0, 1)), '9900');
});

test('mật khẩu mới: ít nhất 6 ký tự', () => {
  assert.match(app.checkNewPassword_('12345'), /6 ký tự/);
  assert.match(app.checkNewPassword_(null), /6 ký tự/);
  assert.equal(app.checkNewPassword_('123456'), '');
  assert.match(app.checkNewPassword_('x'.repeat(101)), /dài quá/);
});

test('băm mật khẩu: muối:mật khẩu, SHA-256 base64 lặp 300 lần', () => {
  let h = 'muoi:matkhau';
  for (let i = 0; i < 300; i++) h = sha(h);
  assert.equal(app.hashPassword_('matkhau', 'muoi', sha), h);
  assert.notEqual(app.hashPassword_('matkhau', 'muoi khac', sha), h);
});

test('email', () => {
  assert.ok(app.isEmail_(' a.b@gmail.com '));
  assert.ok(!app.isEmail_('a@b'));
  assert.ok(!app.isEmail_('a b@c.com'));
  assert.equal(app.normalizeEmail_(' An@Gmail.COM '), 'an@gmail.com');
  const members = [{ member_id: 'A', email: 'An@Gmail.com' }, { member_id: 'B', email: '' }];
  assert.equal(app.memberIdByEmail_(members, 'an@gmail.com '), 'A');
  assert.equal(app.memberIdByEmail_(members, ''), '');
  assert.equal(app.memberIdByEmail_(members, 'x@gmail.com'), '');
});

test('mã Google: đúng ứng dụng, đúng Google cấp, email đã xác minh, còn hạn', () => {
  const ok = { email: 'a@gmail.com', aud: 'cid', iss: 'https://accounts.google.com', email_verified: 'true', exp: '200' };
  assert.equal(app.checkGoogleToken_(ok, 'cid', 100), '');
  assert.equal(app.checkGoogleToken_({ ...ok, iss: 'accounts.google.com', email_verified: true }, 'cid', 100), '');
  assert.match(app.checkGoogleToken_(null, 'cid', 100), /Không xác nhận/);
  assert.match(app.checkGoogleToken_({ ...ok, aud: 'khac' }, 'cid', 100), /không phải của app/);
  assert.match(app.checkGoogleToken_({ ...ok, iss: 'evil.com' }, 'cid', 100), /không phải do Google/);
  assert.match(app.checkGoogleToken_({ ...ok, email_verified: 'false' }, 'cid', 100), /chưa được xác minh/);
  assert.match(app.checkGoogleToken_(ok, 'cid', 300), /hết hạn/);
});

test('ai được vào: phải có tài khoản và nhiệm kỳ mới nhất vẫn Đang ở CLB', () => {
  const terms = [
    { member_id: 'A', term_id: '2526', status: 'active' },
    { member_id: 'A', term_id: '2627', status: 'left' },
    { member_id: 'B', term_id: '2526', status: 'active' }
  ];
  assert.equal(app.latestTermRow_(terms, 'A').term_id, '2627');
  assert.equal(app.latestTermRow_(terms, 'C'), null);
  assert.match(app.loginBlock_({}, null, terms[2]), /chưa có tài khoản/);
  assert.match(app.loginBlock_({}, {}, app.latestTermRow_(terms, 'A')), /đã ngừng/);
  assert.match(app.loginBlock_({}, {}, null), /đã ngừng/);
  // BOD cũ: nhiệm kỳ cũ vẫn Đang ở CLB thì vẫn vào được
  assert.equal(app.loginBlock_({}, {}, app.latestTermRow_(terms, 'B')), '');
});

test('thông tin người dùng: BOD, nhãn còn hạn, ban phụ trách, lần đầu đăng nhập', () => {
  const now = new Date(2026, 9, 18);
  const data = {
    members: [{ member_id: 'A', full_name: 'An', email: 'a@gmail.com' }],
    member_terms: [
      { member_id: 'A', term_id: '2526', dept_code: 'BOD', position: 'Chủ nhiệm', status: 'active' },
      { member_id: 'A', term_id: '2627', dept_code: 'HR', position: 'Thành viên', status: 'active' }
    ],
    accounts: [{ member_id: 'A', theme: 'lạ', password_changed: false, last_login_at: null, data_consent_at: null }],
    member_labels: [
      { member_id: 'A', term_id: '2627', label_type: 'dept_lead', detail: 'PR', start_date: null, end_date: null },
      { member_id: 'A', term_id: '2627', label_type: 'dept_lead', detail: 'HR', start_date: null, end_date: null },
      { member_id: 'A', term_id: '2627', label_type: 'birthday_lead', detail: '', start_date: null, end_date: new Date(2026, 8, 1) },
      { member_id: 'A', term_id: '2627', label_type: 'seeding_lead', detail: '', start_date: new Date(2026, 11, 1), end_date: null },
      { member_id: 'A', term_id: '2526', label_type: 'core_team', detail: '', start_date: null, end_date: null }
    ]
  };
  const u = plain(app.buildUser_('A', data, now));
  assert.equal(u.termId, '2627');
  assert.equal(u.deptCode, 'HR');
  assert.equal(u.isBod, false);
  assert.deepEqual(u.labels, ['dept_lead']);
  assert.deepEqual(u.leadDepts, ['PR', 'HR']);
  assert.equal(u.theme, 'system');
  assert.equal(u.firstLogin, true);
  assert.equal(u.dataConsent, false);
  assert.ok(!('password_hash' in u) && !('passwordHash' in u));

  data.accounts[0] = { member_id: 'A', theme: 'dark', password_changed: true, last_login_at: now, data_consent_at: now };
  data.member_terms[1].dept_code = 'BOD';
  const v = app.buildUser_('A', data, now);
  assert.equal(v.isBod, true);
  assert.equal(v.theme, 'dark');
  assert.equal(v.firstLogin, false);
  assert.equal(v.dataConsent, true);
  assert.equal(v.passwordChanged, true);
});

test('phiên: còn hạn, khi nào cần gia hạn', () => {
  const now = Date.now(), day = 864e5;
  assert.ok(app.sessionValid_({ memberId: 'A', exp: now + 1 }, now));
  assert.ok(!app.sessionValid_({ memberId: 'A', exp: now }, now));
  assert.ok(!app.sessionValid_({ exp: now + day }, now));
  assert.ok(!app.sessionValid_(null, now));
  assert.ok(!app.sessionNeedsRenew_({ exp: now + 60 * day }, now));
  assert.ok(app.sessionNeedsRenew_({ exp: now + 58 * day }, now));
});
