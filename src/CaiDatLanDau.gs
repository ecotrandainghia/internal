/**
 * Cài đặt lần đầu. Khi dự án Apps Script chưa gắn với file dữ liệu nào, mở link app sẽ ra trang này.
 * Chỉ chủ dự án (tài khoản CLB đã triển khai app) mới làm được; người khác chỉ thấy lời nhắn chờ cài đặt.
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
  var t = HtmlService.createTemplateFromFile('CaiDatLanDau');
  t.laChu = laChuDuAn_();
  t.email = t.laChu ? String(Session.getEffectiveUser().getEmail()) : '';
  return t.evaluate().setTitle('Cài đặt app CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function canChuDuAn_() {
  if (daCaiDat_()) throw new Error('App đã được cài đặt rồi. Tải lại trang để vào app.');
  if (!laChuDuAn_()) throw new Error('Chỉ tài khoản CLB (chủ dự án Apps Script) mới cài đặt được.');
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
  canChuDuAn_();
  yc = kiemTraCaiDat_(yc);
  var ss = SpreadsheetApp.create('CLB ECO - Dữ liệu');
  DriveApp.getFileById(ss.getId()).moveTo(thuMucGoc_());
  datFileDuLieu_(ss.getId());
  khoiTaoCoSoDuLieu_();
  PropertiesService.getScriptProperties().setProperty('CauTrucBang', JSON.stringify(BANG));
  taoBodDauTien_(yc);
  caiLichChay_();
  ghiNhatKy_('caiDat', 'OK', 'Cài đặt lần đầu: tạo mới');
  return ScriptApp.getService().getUrl();
}

/** Dùng một file dữ liệu có sẵn (dán link hoặc ID). */
function caiDatDungFileCo(yc) {
  canChuDuAn_();
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
  ghiNhatKy_('caiDat', 'OK', 'Cài đặt lần đầu: dùng file có sẵn');
  return ScriptApp.getService().getUrl();
}
