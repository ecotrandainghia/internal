/**
 * Đăng nhập, phiên, đổi mật khẩu, lần đăng nhập đầu. Trang web gọi các hàm không có dấu _ ở cuối
 * (google.script.run); hàm nào cần đăng nhập thì nhận mã phiên (token) làm tham số đầu tiên.
 *
 * Phiên cất trong thuộc tính của dự án (session_<mã>), không nằm trong file dữ liệu.
 * Mật khẩu chung của CLB cũng vậy: chỉ cất bản băm, ở chỗ bí mật (secret_default_password_*).
 */

var SESSION_PREFIX = 'session_';
var DEFAULT_PW_HASH = 'secret_default_password_hash';
var DEFAULT_PW_SALT = 'secret_default_password_salt';

function sha256Base64_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function newSalt_() {
  return Utilities.getUuid();
}

/** Dữ liệu cần để biết ai là ai: đọc một lần cho mỗi lần gọi. */
function peopleData_() {
  return { members: readTable_('members'), member_terms: readTable_('member_terms'), accounts: readTable_('accounts'),
    member_labels: readTable_('member_labels') };
}

/* ===================== Mật khẩu ===================== */

/** Mật khẩu có đúng không. Tài khoản chưa đổi mật khẩu thì so với mật khẩu chung của CLB. */
function passwordMatches_(account, pw) {
  var props = PropertiesService.getScriptProperties();
  var hash = String(account.password_hash || ''), salt = String(account.password_salt || '');
  if (!hash) { hash = props.getProperty(DEFAULT_PW_HASH) || ''; salt = props.getProperty(DEFAULT_PW_SALT) || ''; }
  return !!hash && hashPassword_(String(pw == null ? '' : pw), salt, sha256Base64_) === hash;
}

/** Đặt mật khẩu chung của CLB (cài đặt lần đầu, hoặc BOD đổi trong Cài đặt). */
function setDefaultPassword_(pw) {
  var err = checkNewPassword_(pw);
  if (err) throw new Error(err);
  var salt = newSalt_(), props = PropertiesService.getScriptProperties();
  props.setProperty(DEFAULT_PW_SALT, salt);
  props.setProperty(DEFAULT_PW_HASH, hashPassword_(String(pw), salt, sha256Base64_));
}

/** Ghi mật khẩu riêng của một người. */
function setOwnPassword_(memberId, pw) {
  var salt = newSalt_();
  updateRecord_('accounts', memberId, { password_hash: hashPassword_(String(pw), salt, sha256Base64_), password_salt: salt,
    password_changed: true });
}

/* ===================== Phiên ===================== */

function readSession_(token) {
  if (!token || !/^[A-Za-z0-9-]{20,100}$/.test(String(token))) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(SESSION_PREFIX + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function createSession_(memberId) {
  dropExpiredSessions_();
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(SESSION_PREFIX + token,
    JSON.stringify({ memberId: memberId, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return token;
}

/** Xoá các phiên đã hết hạn. Gọi kèm mỗi lần đăng nhập là đủ, không cần lịch chạy. */
function dropExpiredSessions_() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX) !== 0) return;
    var s = null;
    try { s = JSON.parse(all[k]); } catch (e) { s = null; }
    if (!sessionValid_(s, now)) props.deleteProperty(k);
  });
}

/** Xoá mọi phiên của một người (đổi mật khẩu thì các máy khác phải đăng nhập lại). Giữ lại phiên keep. */
function dropSessionsOf_(memberId, keep) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX) !== 0 || k === SESSION_PREFIX + keep) return;
    try { if (JSON.parse(all[k]).memberId === memberId) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/**
 * Bắt buộc đăng nhập. Trả về { memberId, user, data }. Phiên hết hạn hay tài khoản đã ngừng thì báo SESSION_EXPIRED
 * để trang web quay về màn đăng nhập. need = 'bod': chỉ BOD mới dùng được.
 */
function requireUser_(token, need) {
  var s = readSession_(token);
  if (!sessionValid_(s, Date.now())) throw new Error('SESSION_EXPIRED');
  var data = peopleData_();
  var member = data.members.filter(function (m) { return m.member_id === s.memberId; })[0];
  var account = data.accounts.filter(function (a) { return a.member_id === s.memberId; })[0];
  if (loginBlock_(member, account, latestTermRow_(data.member_terms, s.memberId))) {
    PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX + token);
    throw new Error('SESSION_EXPIRED');
  }
  var user = buildUser_(s.memberId, data, new Date());
  if (need === 'bod' && !user.isBod) throw new Error('Chỉ BOD mới dùng được chức năng này.');
  return { memberId: s.memberId, user: user, session: s, data: data };
}

/* ===================== Gọi từ trang web ===================== */

/** Đăng nhập bằng email và mật khẩu. Trả về { token, user }. */
function login(email, password) {
  var data = peopleData_();
  var id = memberIdByEmail_(data.members, email);
  var member = data.members.filter(function (m) { return m.member_id === id; })[0];
  var account = data.accounts.filter(function (a) { return a.member_id === id; })[0];
  // Mất dòng Tài khoản (ví dụ lỡ xoá trong sheet) thì coi như chưa đổi mật khẩu: so với mật khẩu chung, đúng thì tạo lại dòng
  if (!account && member && passwordMatches_({}, password)) account = restoreAccount_(id, data);
  if (!account || !passwordMatches_(account, password)) throw new Error('Email hoặc mật khẩu không đúng.');
  var block = loginBlock_(member, account, latestTermRow_(data.member_terms, id));
  if (block) throw new Error(block);
  return startSession_(id, data);
}

/**
 * Đăng nhập bằng Google (chỉ có khi mở app qua trang vỏ cài trên điện thoại, máy tính).
 * Trang vỏ lấy mã từ Google; ở đây hỏi lại Google để chắc mã thật và đúng ứng dụng của CLB.
 */
function loginWithGoogle(idToken) {
  var clientId = String(getSetting_('google_client_id', '')).trim();
  if (!clientId) throw new Error('CLB chưa bật đăng nhập bằng Google.');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(idToken || '')),
    { muteHttpExceptions: true });
  var info = null;
  try { info = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null; } catch (e) { info = null; }
  var err = checkGoogleToken_(info, clientId, Math.floor(Date.now() / 1000));
  if (err) throw new Error(err);
  var data = peopleData_();
  var id = memberIdByEmail_(data.members, info.email);
  var member = data.members.filter(function (m) { return m.member_id === id; })[0];
  var account = data.accounts.filter(function (a) { return a.member_id === id; })[0];
  if (!account && member) account = restoreAccount_(id, data);
  var block = loginBlock_(member, account, latestTermRow_(data.member_terms, id));
  if (block) throw new Error(block.replace('Email này', 'Email ' + info.email));
  return startSession_(id, data);
}

/** Tạo lại dòng Tài khoản mặc định cho thành viên đang hoạt động bị mất dòng. Người đã nghỉ thì không tạo. */
function restoreAccount_(id, data) {
  var term = latestTermRow_(data.member_terms, id);
  if (!term || term.status !== 'active') return null;
  var row = withLock_(function () {
    return findRecord_('accounts', id) || insertRecords_('accounts', [{ member_id: id, theme: 'system', notify_zalo: true, notify_app: false, self_remind: false }])[0];
  });
  data.accounts.push(row);
  return row;
}

/** Tạo phiên, ghi Lần đăng nhập cuối. user.firstLogin tính trước khi ghi, để trang web biết có hiện ba bước đầu không. */
function startSession_(memberId, data) {
  var user = buildUser_(memberId, data, new Date());
  updateRecord_('accounts', memberId, { last_login_at: new Date() });
  var token = createSession_(memberId);
  return { token: token, user: user, home: homeFor_(token) };
}

/** Số liệu trang chủ gửi kèm lúc mở app, đỡ một lần chờ. Lỗi thì bỏ qua, trang chủ tự tải lại. */
function homeFor_(token) {
  try { return homeData(token); } catch (e) { return null; }
}

/**
 * Mở app khi máy đã nhớ phiên: trả về { user } hoặc null nếu phiên hết hạn. Mỗi lần mở thì gia hạn phiên
 * và cập nhật Lần đăng nhập cuối (tối đa mỗi giờ một lần).
 */
function openApp(token) {
  var me;
  try { me = requireUser_(token); } catch (e) { if (e.message === 'SESSION_EXPIRED') return null; throw e; }
  ensureAppFoldersOnce_();
  var now = Date.now();
  if (sessionNeedsRenew_(me.session, now)) {
    me.session.exp = now + SESSION_DAYS * 864e5;
    PropertiesService.getScriptProperties().setProperty(SESSION_PREFIX + token, JSON.stringify(me.session));
  }
  var account = me.data.accounts.filter(function (a) { return a.member_id === me.memberId; })[0];
  if (!account.last_login_at || now - account.last_login_at.getTime() > LAST_LOGIN_REFRESH_MS) {
    updateRecord_('accounts', me.memberId, { last_login_at: new Date(now) });
  }
  return { user: me.user, home: homeFor_(token) };
}

function logout(token) {
  if (readSession_(token)) PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX + token);
  return true;
}

/** Đổi mật khẩu của mình. Các máy khác đang đăng nhập tài khoản này phải đăng nhập lại. */
function changePassword(token, current, next) {
  var me = requireUser_(token);
  var account = me.data.accounts.filter(function (a) { return a.member_id === me.memberId; })[0];
  if (!passwordMatches_(account, current)) throw new Error('Mật khẩu hiện tại không đúng.');
  var err = checkNewPassword_(next);
  if (err) throw new Error(err);
  setOwnPassword_(me.memberId, next);
  dropSessionsOf_(me.memberId, token);
  return true;
}

/** Lưu giao diện sáng, tối, theo máy vào tài khoản (mở ở máy khác vẫn đúng). */
function saveTheme(token, theme) {
  var me = requireUser_(token);
  if (['light', 'dark', 'system'].indexOf(theme) < 0) throw new Error('Giao diện không hợp lệ.');
  updateRecord_('accounts', me.memberId, { theme: theme });
  return theme;
}

/** Đồng ý (hoặc thôi đồng ý) cho CLB dùng dữ liệu của mình ở dạng ẩn danh. Không bắt buộc. */
function setDataConsent(token, agree) {
  var me = requireUser_(token);
  updateRecord_('accounts', me.memberId, { data_consent_at: agree ? new Date() : '' });
  return !!agree;
}
