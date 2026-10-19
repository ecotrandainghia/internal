/**
 * Quy tắc đăng nhập và quyền: ai được vào app, là BOD hay thành viên, mang nhãn gì, có phải lần đăng nhập đầu không.
 * File này không gọi gì của Google nên chạy thử được bằng Node (tests/).
 */

var SESSION_DAYS = 60;          // ghi nhớ đăng nhập: mỗi lần mở app, hạn được kéo dài thêm 60 ngày
var LAST_LOGIN_REFRESH_MS = 36e5; // mở app thì cập nhật Lần đăng nhập cuối, tối đa mỗi giờ một lần
var PASSWORD_ROUNDS = 300;

/** Nhiệm kỳ của một ngày: năm học bắt đầu từ tháng 8. Ví dụ 10/2026 → 2627, 3/2027 → 2627. */
function termIdForDate_(d) {
  var y = d.getFullYear() % 100, start = d.getMonth() >= 7 ? y : (y + 99) % 100;
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  return two(start) + two((start + 1) % 100);
}

/** Trả về chuỗi lỗi, hoặc '' nếu mật khẩu mới dùng được. */
function checkNewPassword_(pw) {
  var s = String(pw == null ? '' : pw);
  if (s.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (s.length > 100) return 'Mật khẩu dài quá.';
  return '';
}

/**
 * Băm mật khẩu một chiều, kèm muối riêng: lặp SHA-256 nhiều lần.
 * digest: hàm (chuỗi) → chuỗi base64 của SHA-256; máy chủ truyền vào hàm dùng Utilities.
 */
function hashPassword_(pw, salt, digest) {
  var h = salt + ':' + pw;
  for (var i = 0; i < PASSWORD_ROUNDS; i++) h = digest(h);
  return h;
}

function isEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function normalizeEmail_(s) {
  return String(s || '').trim().toLowerCase();
}

/** Kiểm tra thông tin Google trả về cho một mã đăng nhập (ID token). Trả về '' nếu hợp lệ. */
function checkGoogleToken_(info, clientId, nowSec) {
  if (!info || !info.email) return 'Không xác nhận được tài khoản Google. Bạn thử lại nhé.';
  if (String(info.aud) !== String(clientId)) return 'Mã đăng nhập không phải của app CLB ECO.';
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(String(info.iss)) < 0) return 'Mã đăng nhập không phải do Google cấp.';
  if (!(info.email_verified === true || info.email_verified === 'true')) return 'Email Google này chưa được xác minh.';
  if (Number(info.exp) < nowSec) return 'Mã đăng nhập đã hết hạn. Bạn thử lại nhé.';
  return '';
}

/** Dòng Thành viên theo nhiệm kỳ mới nhất của một người (nhiệm kỳ lớn nhất), hoặc null. */
function latestTermRow_(memberTerms, memberId) {
  var best = null;
  memberTerms.forEach(function (r) {
    if (r.member_id !== memberId) return;
    if (!best || String(r.term_id) > String(best.term_id)) best = r;
  });
  return best;
}

/** Nhãn còn hiệu lực lúc now, trong nhiệm kỳ termId. */
function activeLabels_(labels, memberId, termId, now) {
  return labels.filter(function (l) {
    if (l.member_id !== memberId || String(l.term_id) !== String(termId)) return false;
    if (l.start_date && l.start_date.getTime() > now.getTime()) return false;
    return !l.end_date || l.end_date.getTime() >= now.getTime();
  });
}

/**
 * Người này có vào app được không: phải có tài khoản, và ở nhiệm kỳ mới nhất của mình vẫn Đang ở CLB.
 * BOD cũ vẫn vào được trong giai đoạn giao thoa vì dòng nhiệm kỳ cũ của họ vẫn là Đang ở CLB.
 * Trả về '' nếu được, hoặc câu báo lỗi.
 */
function loginBlock_(member, account, termRow) {
  if (!member || !account) return 'Email này chưa có tài khoản app CLB ECO. Bạn dùng email đã ghi trong danh sách thành viên nhé.';
  if (!termRow || termRow.status !== 'active') return 'Tài khoản này đã ngừng vì bạn không còn trong danh sách thành viên CLB.';
  return '';
}

/**
 * Thông tin người dùng gửi cho trang web. Không có mật khẩu hay muối.
 * data: { members, member_terms, accounts, member_labels } đã đọc từ sheet.
 */
function buildUser_(memberId, data, now) {
  var member = data.members.filter(function (m) { return m.member_id === memberId; })[0];
  var account = data.accounts.filter(function (a) { return a.member_id === memberId; })[0];
  var termRow = latestTermRow_(data.member_terms, memberId);
  var labels = termRow ? activeLabels_(data.member_labels, memberId, termRow.term_id, now) : [];
  var types = [];
  labels.forEach(function (l) { if (types.indexOf(l.label_type) < 0) types.push(l.label_type); });
  var isBod = !!termRow && termRow.dept_code === 'BOD';
  return {
    memberId: memberId,
    name: member.full_name,
    email: member.email,
    termId: termRow ? termRow.term_id : '',
    deptCode: termRow ? termRow.dept_code : '',
    position: termRow ? termRow.position : '',
    isBod: isBod,
    labels: types,
    leadDepts: labels.filter(function (l) { return l.label_type === 'dept_lead' && l.detail; }).map(function (l) { return l.detail; }),
    theme: ['light', 'dark', 'system'].indexOf(account.theme) >= 0 ? account.theme : 'system',
    avatarUrl: account.avatar_url || '',
    passwordChanged: !!account.password_changed,
    dataConsent: !!account.data_consent_at,
    firstLogin: !account.last_login_at
  };
}

/** Tìm Mã TV theo email (không phân biệt hoa thường). */
function memberIdByEmail_(members, email) {
  var e = normalizeEmail_(email);
  if (!e) return '';
  var hit = members.filter(function (m) { return normalizeEmail_(m.email) === e; })[0];
  return hit ? hit.member_id : '';
}

/** Phiên còn hạn không. session: { memberId, exp } đã đọc ra; nowMs: giờ hiện tại. */
function sessionValid_(session, nowMs) {
  return !!session && !!session.memberId && Number(session.exp) > nowMs;
}

/** Có cần ghi lại hạn mới không (chỉ ghi khi đã dùng quá một ngày, cho đỡ tốn lượt ghi). */
function sessionNeedsRenew_(session, nowMs) {
  return Number(session.exp) - nowMs < (SESSION_DAYS - 1) * 864e5;
}
