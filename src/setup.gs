/**
 * Cài đặt lần đầu. Khi dự án Apps Script chưa có file dữ liệu, mở link app sẽ ra trang này: tạo file dữ liệu,
 * tài khoản BOD đầu tiên và mật khẩu chung của CLB.
 *
 * Chỉ chủ dự án (tài khoản CLB đã triển khai app) mới làm được. Ứng dụng web cho mọi người mở không cần đăng nhập
 * nên Google có thể không cho biết ai đang mở trang; khi đó người cài đặt bấm gửi mã tới email tài khoản CLB
 * rồi nhập mã đó (chỉ người đọc được hộp thư CLB mới cài đặt được).
 */

/** Người đang mở trang có phải chủ dự án không. */
function isOwner_() {
  var viewer = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return !!viewer && viewer === owner;
}

/** Che bớt email, ví dụ c***@gmail.com. */
function maskEmail_(email) {
  var m = /^(.)[^@]*(@.*)$/.exec(String(email || ''));
  return m ? m[1] + '***' + m[2] : '';
}

function setupPage_() {
  var t = HtmlService.createTemplateFromFile('setup_view');
  t.isOwner = isOwner_();
  t.ownerEmail = t.isOwner ? String(Session.getEffectiveUser().getEmail()) : maskEmail_(Session.getEffectiveUser().getEmail());
  return t.evaluate().setTitle('Cài đặt app CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Gửi mã 6 số tới email tài khoản CLB. */
function sendSetupCode() {
  if (hasDataFile_()) throw new Error('App đã được cài đặt rồi. Tải lại trang để vào app.');
  var cache = CacheService.getScriptCache();
  if (cache.get('setup_code_sent')) throw new Error('Vừa gửi mã rồi. Chờ 2 phút rồi thử lại nhé.');
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('setup_code', code, 1800);
  cache.remove('setup_code_wrong');
  cache.put('setup_code_sent', '1', 120);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Mã cài đặt app CLB ECO: ' + code,
    'Mã để cài đặt app CLB ECO là ' + code + '. Mã dùng được trong 30 phút.\n\nNếu bạn không cài đặt app, bỏ qua thư này.');
  return maskEmail_(Session.getEffectiveUser().getEmail());
}

/** Chỉ cài khi app chưa cài và người cài là chủ dự án (hoặc nhập đúng mã đã gửi tới email tài khoản CLB). */
function requireOwner_(code) {
  if (hasDataFile_()) throw new Error('App đã được cài đặt rồi. Tải lại trang để vào app.');
  if (isOwner_()) return;
  var cache = CacheService.getScriptCache(), want = cache.get('setup_code');
  if (want && String(code || '').trim() === want) return;
  // Sai 5 lần thì bỏ mã, phải gửi mã mới (chặn đoán mò).
  var wrong = Number(cache.get('setup_code_wrong') || 0) + 1;
  if (wrong >= 5) { cache.remove('setup_code'); cache.remove('setup_code_wrong'); } else cache.put('setup_code_wrong', String(wrong), 1800);
  throw new Error('Mã chưa đúng hoặc đã hết hạn. Bấm gửi mã rồi xem hộp thư của tài khoản CLB.');
}

/** Kiểm tra thông tin BOD đầu tiên và mật khẩu chung. Trả về bản đã chuẩn hoá. */
function checkSetupRequest_(req) {
  req = req || {};
  var name = String(req.name || '').trim().replace(/\s+/g, ' ');
  var email = normalizeEmail_(req.email);
  if (!name) throw new Error('Nhập họ tên của bạn.');
  if (!isEmail_(email)) throw new Error('Email chưa đúng.');
  var err = checkNewPassword_(req.password) || checkNewPassword_(req.clubPassword);
  if (err) throw new Error(err);
  if (String(req.password) === String(req.clubPassword)) throw new Error('Mật khẩu của bạn nên khác mật khẩu chung của CLB.');
  return { name: name, email: email, position: String(req.position || '').trim(), password: String(req.password),
    clubPassword: String(req.clubPassword) };
}

/** Tạo tài khoản BOD đầu tiên trong file dữ liệu đang dùng. Mã TV đợt CU (có từ trước khi dùng app). */
function createFirstBod_(req, now) {
  var term = termIdForDate_(now);
  var members = readTable_('members');
  if (memberIdByEmail_(members, req.email)) return;
  var id = formatMemberId_(term, 'CU', nextMemberSeq_(term, 'CU', members.map(function (m) { return m.member_id; })));
  insertRecords_('members', [{ member_id: id, full_name: req.name, email: req.email, join_batch: 'CU', join_term_id: term }]);
  insertRecords_('member_terms', [{ member_id: id, term_id: term, dept_code: 'BOD', position: req.position, status: 'active' }]);
  var salt = newSalt_();
  insertRecords_('accounts', [{ member_id: id, password_hash: hashPassword_(req.password, salt, sha256Base64_), password_salt: salt,
    password_changed: true, theme: 'system', notify_zalo: true, notify_app: false, self_remind: false }]);
}

/** Trang cài đặt gọi: tạo file dữ liệu, BOD đầu tiên, mật khẩu chung. Trả về link app. */
function setupApp(req) {
  requireOwner_(req && req.code);
  req = checkSetupRequest_(req);
  useDataFile_(SpreadsheetApp.create(DATA_FILE_NAME).getId());
  ensureSchema_(true);
  createFirstBod_(req, new Date());
  setDefaultPassword_(req.clubPassword);
  ensureNightlyTrigger_();
  ensureViewTrigger_();
  dropOldAppLeftovers_();
  CacheService.getScriptCache().remove('setup_code');
  return ScriptApp.getService().getUrl();
}
