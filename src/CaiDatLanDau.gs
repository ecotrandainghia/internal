/**
 * Cài đặt lần đầu. Khi dự án Apps Script chưa gắn với file dữ liệu nào, mở link app sẽ ra trang này.
 * Chỉ chủ dự án (tài khoản CLB đã triển khai app) mới làm được. Ứng dụng web cho mọi người mở không cần đăng nhập
 * nên Google có thể không cho biết ai đang mở trang; khi đó người cài đặt bấm gửi mã xác nhận tới email tài khoản CLB
 * và nhập mã đó (chỉ người đọc được hộp thư CLB mới cài đặt được).
 *
 * Hai cách:
 * - Tạo mới: app tạo thư mục "CLB ECO - App" trên Drive, file dữ liệu trong đó, các bảng, tài khoản BOD đầu tiên
 *   và mọi lịch chạy tự động.
 * - Dùng file có sẵn: dán link file dữ liệu (ví dụ bản sao lưu, hoặc file của dự án cũ khi chuyển tài khoản CLB).
 */

/** Người đang mở trang có phải chủ dự án không (tài khoản chạy app). */
function laChuDuAn_() {
  var dangMo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var chu = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return !!dangMo && dangMo === chu;
}

function trangCaiDatLanDau_() {
  var t = HtmlService.createTemplateFromFile('TrangCaiDatLanDau');
  t.laChu = laChuDuAn_();
  t.email = t.laChu ? String(Session.getEffectiveUser().getEmail()) : anEmail_(Session.getEffectiveUser().getEmail());
  return t.evaluate().setTitle('Cài đặt app CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Che bớt email, ví dụ c***@gmail.com. */
function anEmail_(email) {
  var m = /^(.)[^@]*(@.*)$/.exec(String(email || ''));
  return m ? m[1] + '***' + m[2] : '';
}

/** Gửi mã xác nhận 6 số tới email tài khoản CLB (dùng khi Google không cho biết ai đang mở trang). */
function guiMaCaiDat() {
  if (daCaiDat_()) throw new Error('App đã được cài đặt rồi. Tải lại trang để vào app.');
  var cache = CacheService.getScriptCache();
  if (cache.get('maCaiDatVuaGui')) throw new Error('Vừa gửi mã rồi. Chờ 2 phút rồi thử lại nhé.');
  var ma = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('maCaiDat', ma, 1800);
  cache.remove('maCaiDatSai');
  cache.put('maCaiDatVuaGui', '1', 120);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Mã cài đặt app CLB ECO: ' + ma,
    'Mã xác nhận để cài đặt app CLB ECO là ' + ma + '. Mã dùng được trong 30 phút.\n\nNếu bạn không cài đặt app, bỏ qua thư này.');
  return anEmail_(Session.getEffectiveUser().getEmail());
}

/** Chỉ cài đặt khi app chưa cài và người cài là chủ dự án (hoặc nhập đúng mã đã gửi tới email tài khoản CLB). */
function canChuDuAn_(maXacNhan) {
  if (daCaiDat_()) throw new Error('App đã được cài đặt rồi. Tải lại trang để vào app.');
  if (laChuDuAn_()) return;
  var cache = CacheService.getScriptCache(), ma = cache.get('maCaiDat');
  if (ma && String(maXacNhan || '').trim() === ma) return;
  // Sai 5 lần thì bỏ mã, phải gửi mã mới (chặn đoán mò).
  var sai = Number(cache.get('maCaiDatSai') || 0) + 1;
  if (sai >= 5) { cache.remove('maCaiDat'); cache.remove('maCaiDatSai'); } else cache.put('maCaiDatSai', String(sai), 1800);
  throw new Error('Mã xác nhận chưa đúng hoặc đã hết hạn. Bấm gửi mã rồi xem hộp thư của tài khoản CLB.');
}

/** Kiểm tra thông tin BOD đầu tiên và mật khẩu chung. Trả về yêu cầu đã chuẩn hoá. */
function kiemTraCaiDat_(yc) {
  yc = yc || {};
  var ten = String(yc.ten || '').trim().replace(/\s+/g, ' ');
  var email = String(yc.email || '').trim().toLowerCase();
  if (!ten) throw new Error('Nhập họ tên của bạn (BOD).');
  if (!emailHopLe_(email)) throw new Error('Email chưa đúng.');
  var loi = kiemTraMatKhauMoi_(yc.matKhau) || kiemTraMatKhauMoi_(yc.matKhauChung);
  if (loi) throw new Error(loi);
  return { ten: ten, email: email, matKhau: String(yc.matKhau), matKhauChung: String(yc.matKhauChung) };
}

/** Tạo tài khoản BOD đầu tiên (nếu email đó chưa có tài khoản) và mật khẩu chung. */
function taoBodDauTien_(yc) {
  if (!timTaiKhoan_(yc.email)) {
    var muoi = Utilities.getUuid();
    themDong_('TaiKhoan', [{ Email: yc.email, MaTV: '', HoVaTen: yc.ten, VaiTro: 'BOD', MatKhau: bamMatKhau_(yc.matKhau, muoi), Muoi: muoi, NgayTao: new Date() }]);
  }
  datMatKhauMacDinh_(yc.matKhauChung);
  datCaiDat_('NgayCaiDat', new Date());
}

/** Tạo mới toàn bộ dữ liệu. */
function caiDatTaoMoi(yc) {
  canChuDuAn_(yc && yc.maXacNhan);
  yc = kiemTraCaiDat_(yc);
  var ss = SpreadsheetApp.create('CLB ECO - Dữ liệu');
  DriveApp.getFileById(ss.getId()).moveTo(thuMucGoc_());
  datFileDuLieu_(ss.getId());
  khoiTaoCoSoDuLieu_();
  PropertiesService.getScriptProperties().setProperty('CauTrucBang', JSON.stringify(BANG));
  taoBodDauTien_(yc);
  caiLichChay_();
  CacheService.getScriptCache().remove('maCaiDat');
  ghiNhatKy_('caiDat', 'OK', 'Cài đặt lần đầu: tạo mới');
  return ScriptApp.getService().getUrl();
}

/** Dùng một file dữ liệu có sẵn (dán link hoặc ID). */
function caiDatDungFileCo(yc) {
  canChuDuAn_(yc && yc.maXacNhan);
  yc = yc || {};
  var id = maTuLink_(yc.link);
  if (!id) throw new Error('Link file dữ liệu chưa đúng.');
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { throw new Error('Không mở được file này. Kiểm tra link và quyền của tài khoản CLB.'); }
  if (!ss.getSheetByName('TaiKhoan') || !ss.getSheetByName('ThanhVien')) throw new Error('File này không phải file dữ liệu của app (thiếu tab TaiKhoan, ThanhVien).');
  datFileDuLieu_(id);
  khoiTaoCoSoDuLieu_();
  PropertiesService.getScriptProperties().setProperty('CauTrucBang', JSON.stringify(BANG));
  var coBod = docBang_('TaiKhoan').some(function (t) { return String(t.VaiTro) === 'BOD'; });
  if (!coBod || !layBiMat_('MatKhauMacDinh')) taoBodDauTien_(kiemTraCaiDat_(yc));
  caiLichChay_();
  CacheService.getScriptCache().remove('maCaiDat');
  ghiNhatKy_('caiDat', 'OK', 'Cài đặt lần đầu: dùng file có sẵn');
  return ScriptApp.getService().getUrl();
}
