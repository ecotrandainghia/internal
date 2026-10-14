/**
 * Tầng dữ liệu của app CLB: đọc, ghi file Google Sheet chứa dữ liệu, khoá ghi, bộ nhớ tạm, cấu hình,
 * nhật ký hệ thống và các lịch chạy tự động.
 *
 * Code nằm ở một dự án Apps Script riêng, không gắn vào file dữ liệu. File dữ liệu được mở theo ID lưu trong
 * thuộc tính của dự án (IdFileDuLieu), do trang Cài đặt lần đầu tạo ra hoặc chọn. Đổi sang file khác (ví dụ khôi phục
 * từ bản sao lưu) làm ở Cài đặt, Hệ thống.
 */

var KHOA_ID_DU_LIEU = 'IdFileDuLieu';

/* ===================== File dữ liệu ===================== */

var SO_DU_LIEU_ = null;
/** File Google Sheet chứa dữ liệu. Chưa cài đặt lần đầu thì báo lỗi CHUA_CAI_DAT. */
function soDuLieu_() {
  if (SO_DU_LIEU_) return SO_DU_LIEU_;
  var id = PropertiesService.getScriptProperties().getProperty(KHOA_ID_DU_LIEU);
  if (!id) throw new Error('CHUA_CAI_DAT');
  try { SO_DU_LIEU_ = SpreadsheetApp.openById(id); }
  catch (e) { throw new Error('Không mở được file dữ liệu của app. Có thể file đã bị xoá hoặc tài khoản CLB mất quyền. Khôi phục file trong Thùng rác Google Drive, hoặc chọn lại file ở Cài đặt lần đầu.'); }
  return SO_DU_LIEU_;
}

function daCaiDat_() {
  return !!PropertiesService.getScriptProperties().getProperty(KHOA_ID_DU_LIEU);
}

/** Dùng một file dữ liệu khác (cài đặt lần đầu, hoặc khôi phục từ bản sao lưu). */
function datFileDuLieu_(id) {
  PropertiesService.getScriptProperties().setProperty(KHOA_ID_DU_LIEU, String(id));
  SO_DU_LIEU_ = null;
  BO_NHO_BANG_ = {};
  DA_KIEM_TRA_BANG_ = false;
  DA_NAP_CAU_HINH_ = false;
  PropertiesService.getScriptProperties().deleteProperty('CauTrucBang');
  xoaMoiBoNhoTam_();
}

/** Múi giờ của app (giờ Việt Nam theo cài đặt dự án). */
function muiGio_() { return Session.getScriptTimeZone(); }

/* ===================== Thư mục của app trên Google Drive ===================== */

var TEN_THU_MUC_GOC = 'CLB ECO - App';

/** Thư mục gốc của app (chứa file dữ liệu, sao lưu, lưu trữ, tệp đính kèm...). Bị xoá thì tạo lại. */
function thuMucGoc_() {
  var kho = PropertiesService.getScriptProperties(), id = kho.getProperty('ThuMucGocId');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* tạo lại */ } }
  var moi = DriveApp.createFolder(TEN_THU_MUC_GOC);
  kho.setProperty('ThuMucGocId', moi.getId());
  return moi;
}

/** Thư mục con trong thư mục gốc theo tên (Sao lưu, Lưu trữ, Đính kèm mail, Ảnh nền...). Chưa có thì tạo. */
function thuMucCon_(ten) {
  var goc = thuMucGoc_(), it = goc.getFoldersByName(ten);
  return it.hasNext() ? it.next() : goc.createFolder(ten);
}

/* ===================== Cấu trúc bảng ===================== */

/** Chọn hàm này rồi bấm Chạy trong Apps Script nếu Google cần cấp lại quyền (thường không cần). */
function khoiTaoCoSoDuLieu() {
  khoiTaoCoSoDuLieu_();
}

/** Tạo các tab còn thiếu, thêm cột còn thiếu, và dữ liệu mặc định. Chạy lại nhiều lần không sao. */
function khoiTaoCoSoDuLieu_() {
  var ss = soDuLieu_();
  Object.keys(BANG).forEach(function (ten) {
    var sh = ss.getSheetByName(ten) || ss.insertSheet(ten);
    var cot = BANG[ten];
    var hienCo = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    var thieu = cot.filter(function (c) { return hienCo.indexOf(c) < 0; });
    if (thieu.length) {
      var batDau = hienCo.filter(String).length + 1;
      sh.getRange(1, batDau, 1, thieu.length).setValues([thieu]);
      sh.getRange(1, 1, 1, batDau + thieu.length - 1).setFontWeight('bold').setBackground('#274e13').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  BANG_NHO_TAM.forEach(boNhoTamBang_); // có thể vừa thêm cột: đọc lại cho đủ cột
  BO_NHO_BANG_ = {};
  if (!docBang_('LoaiHoatDong').length) themDong_('LoaiHoatDong', chuanHoaLoaiHoatDong_(MUC_DIEM_QUY_CHE).ds);
  if (!docBang_('Ban').length) ghiCoCau_(CO_CAU_MAC_DINH);
  if (!layCaiDat_('QuyTac')) datCaiDat_('QuyTac', JSON.stringify(QUY_TAC_MAC_DINH));
  var macDinh = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (macDinh && macDinh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(macDinh);
}

/** Bản cập nhật thêm tab hoặc cột mới thì tự thêm vào file dữ liệu ở lần dùng đầu tiên, không cần ai làm gì. */
var DA_KIEM_TRA_BANG_ = false;
function damBaoCauTrucBang_() {
  if (DA_KIEM_TRA_BANG_) return;
  DA_KIEM_TRA_BANG_ = true;
  var mau = JSON.stringify(BANG), kho = PropertiesService.getScriptProperties();
  if (kho.getProperty('CauTrucBang') === mau) return;
  khoiTaoCoSoDuLieu_();
  kho.setProperty('CauTrucBang', mau);
}

/** Lấy tab để ghi. Bảng này sắp đổi nên bản nhớ tạm của nó bị bỏ. */
function bangDuLieu_(ten) {
  damBaoCauTrucBang_();
  var ss = soDuLieu_();
  var sh = ss.getSheetByName(ten);
  if (!sh && BANG[ten]) { khoiTaoCoSoDuLieu_(); sh = ss.getSheetByName(ten); } // tab mới thêm ở bản cập nhật, hoặc lỡ tay xoá
  if (!sh) throw new Error('Thiếu tab ' + ten + ' trong file dữ liệu.');
  delete BO_NHO_BANG_[ten];
  BANG_DA_GHI_[ten] = true;
  boNhoTamBang_(ten);
  return sh;
}

/* ===================== Đọc bảng, bộ nhớ tạm ===================== */

/**
 * Đọc cả bảng thành danh sách đối tượng.
 * Trong một lần chạy, mỗi bảng chỉ đọc từ sheet một lần. Vài bảng ít đổi (BANG_NHO_TAM) còn được nhớ tạm
 * giữa các lần chạy, để mở app nhanh hơn; ghi vào bảng nào thì bản nhớ tạm của bảng đó bị bỏ ngay.
 * Ai sửa tay trên file dữ liệu thì app thấy sau tối đa GIAY_NHO_TAM giây (hoặc ngay khi bấm Làm mới ở Cài đặt, Hệ thống).
 */
var BANG_NHO_TAM = ['CaiDat', 'TaiKhoan', 'ThanhVien', 'LoaiHoatDong', 'Ban', 'NhiemKy', 'GiaiDoan'];
var GIAY_NHO_TAM = 600;
var BO_NHO_BANG_ = {};
var BANG_DA_GHI_ = {};
function docBang_(ten) {
  if (!DA_NAP_CAU_HINH_ && ten !== 'Ban' && ten !== 'NhiemKy' && ten !== 'CaiDat') napCauHinh_();
  var chuoi = BO_NHO_BANG_[ten];
  if (chuoi === undefined) {
    var nhoTam = BANG_NHO_TAM.indexOf(ten) >= 0 && !DO_SAU_KHOA_; // đang giữ khoá để ghi thì luôn đọc thẳng từ sheet
    var bo = nhoTam ? CacheService.getScriptCache() : null, phienBan = '';
    if (nhoTam) {
      try {
        var co = bo.getAll(['bang_' + ten, 'phienban_' + ten]);
        phienBan = co['phienban_' + ten] || '0';
        var luu = co['bang_' + ten];
        if (luu && luu.indexOf(phienBan + '|') === 0) chuoi = luu.slice(phienBan.length + 1);
      } catch (e) { nhoTam = false; }
    }
    if (chuoi === undefined) {
      var sh = soDuLieu_().getSheetByName(ten);
      chuoi = maHoaBang_(!sh || sh.getLastRow() < 2 ? [] : dongThanhDoiTuong_(sh.getDataRange().getValues()));
      // Ghi kèm phiên bản đã thấy trước khi đọc: nếu có người ghi chen vào giữa thì bản này tự hết hiệu lực.
      if (nhoTam) { try { bo.put('bang_' + ten, phienBan + '|' + chuoi, GIAY_NHO_TAM); } catch (e) { /* bảng lớn quá thì thôi không nhớ tạm */ } }
    }
    BO_NHO_BANG_[ten] = chuoi;
  }
  return giaiMaBang_(chuoi);
}

/** Bỏ bản nhớ tạm của một bảng (sau khi ghi). */
function boNhoTamBang_(ten) {
  if (BANG_NHO_TAM.indexOf(ten) < 0) return;
  try {
    var bo = CacheService.getScriptCache();
    bo.put('phienban_' + ten, String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600);
    bo.remove('bang_' + ten);
  } catch (e) { /* bản nhớ tạm tự hết hạn sau GIAY_NHO_TAM giây */ }
}

/** Bỏ mọi bản nhớ tạm: dùng sau khi sửa tay trên file dữ liệu, hoặc đổi file dữ liệu. */
function xoaMoiBoNhoTam_() {
  BANG_NHO_TAM.forEach(boNhoTamBang_);
  xoaBoNhoTam_();
  BO_NHO_BANG_ = {};
  DA_NAP_CAU_HINH_ = false;
}

function xoaBoNhoTam_() {
  CacheService.getScriptCache().remove('xephang');
}

/** Đúng là lịch chạy tự động của dự án gọi (không phải ai đó gọi thẳng từ trang web). */
function laLichChay_(e) {
  if (!e || !e.triggerUid) return false;
  var ma = String(e.triggerUid);
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === ma; });
}

/* ===================== Khoá ghi ===================== */

/**
 * Hai người bấm lưu cùng lúc thì lần lượt từng người ghi, không ai ghi đè hay chen vào dòng của người kia.
 * Cách dùng: var khoa = layKhoa_(); try { ... } finally { traKhoa_(khoa); }   hoặc   voiKhoa_(function () { ... }).
 * Gọi lồng nhau trong cùng một lần chạy vẫn được: chỉ lần ngoài cùng mới thật sự khoá.
 * khongChoDuoc = true: đang bận thì trả về false thay vì báo lỗi (dùng cho việc chạy tự động).
 */
var DO_SAU_KHOA_ = 0;
function layKhoa_(choMs, khongChoDuoc) {
  if (DO_SAU_KHOA_) { DO_SAU_KHOA_++; return null; }
  var khoa = LockService.getScriptLock();
  if (!khoa.tryLock(choMs || 30000)) {
    if (khongChoDuoc) return false;
    throw new Error('Đang có nhiều người lưu cùng lúc. Bạn đợi vài giây rồi thử lại nhé.');
  }
  DO_SAU_KHOA_ = 1;
  BO_NHO_BANG_ = {}; // đọc lại từ sheet: có thể người khác vừa ghi trước mình
  BANG_DA_GHI_ = {};
  return khoa;
}
function traKhoa_(khoa) {
  if (khoa === false) return;
  DO_SAU_KHOA_ = Math.max(0, DO_SAU_KHOA_ - 1);
  if (!khoa) return;
  try { SpreadsheetApp.flush(); } catch (e) { /* bỏ qua */ }
  Object.keys(BANG_DA_GHI_).forEach(boNhoTamBang_); // bỏ lần nữa sau khi ghi xong hẳn
  BANG_DA_GHI_ = {};
  khoa.releaseLock();
}
function voiKhoa_(viec) {
  var khoa = layKhoa_();
  try { return viec(); } finally { traKhoa_(khoa); }
}

/* ===================== Ghi bảng ===================== */

function tieuDe_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function themDong_(ten, doiTuong) {
  if (!doiTuong.length) return;
  voiKhoa_(function () {
    var sh = bangDuLieu_(ten);
    var td = tieuDe_(sh);
    var dong = doiTuong.map(function (o) { return td.map(function (c) { return o[c] === undefined ? '' : o[c]; }); });
    sh.getRange(sh.getLastRow() + 1, 1, dong.length, td.length).setValues(dong);
  });
}

/** Ghi đè cả bảng. Nếu danh sách mới lấy từ chính bảng đó thì phải đọc và ghi trong cùng một khoá (voiKhoa_). */
function ghiDeBang_(ten, doiTuong) {
  voiKhoa_(function () {
    var sh = bangDuLieu_(ten);
    var td = tieuDe_(sh);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, td.length).clearContent();
    if (!doiTuong.length) return;
    var dong = doiTuong.map(function (o) { return td.map(function (c) { return o[c] === undefined ? '' : o[c]; }); });
    sh.getRange(2, 1, dong.length, td.length).setValues(dong);
  });
}

function layCaiDat_(khoa) {
  var ds = docBang_('CaiDat');
  for (var i = 0; i < ds.length; i++) if (ds[i].Khoa === khoa) return ds[i].GiaTri;
  return null;
}

function datCaiDat_(khoa, giaTri) {
  voiKhoa_(function () {
    var sh = bangDuLieu_('CaiDat');
    var v = sh.getDataRange().getValues();
    var dong = v.length + 1;
    for (var r = 1; r < v.length; r++) if (v[r][0] === khoa) { dong = r + 1; break; }
    if (dong > v.length) sh.getRange(dong, 1).setValue(khoa);
    var o = sh.getRange(dong, 2);
    // Chữ thì giữ nguyên là chữ, để sheet không tự đổi thành ngày giờ hay số.
    o.setNumberFormat(typeof giaTri === 'string' ? '@' : 'General');
    o.setValue(giaTri);
  });
}

/* ===================== Bí mật (không để trong file dữ liệu) ===================== */

/**
 * Mã bot Zalo, mật khẩu chung của CLB (đã băm)... cất trong thuộc tính của dự án Apps Script, không nằm trong file dữ liệu:
 * ai được chia sẻ file dữ liệu cũng không đọc được.
 */
function layBiMat_(khoa) {
  return PropertiesService.getScriptProperties().getProperty('bimat_' + khoa) || '';
}
function datBiMat_(khoa, giaTri) {
  var kho = PropertiesService.getScriptProperties();
  if (giaTri === '' || giaTri === null || giaTri === undefined) kho.deleteProperty('bimat_' + khoa);
  else kho.setProperty('bimat_' + khoa, String(giaTri));
}

/* ===================== Cấu hình: cơ cấu ban, quy tắc ===================== */

var DA_NAP_CAU_HINH_ = false;
/** Nạp cơ cấu ban và quy tắc của nhiệm kỳ đang chạy (BOD chỉnh trong Cài đặt) vào CO_CAU, QUY_TAC. */
function napCauHinh_() {
  DA_NAP_CAU_HINH_ = true;
  try { apCauHinh_(docCoCau_(), quyTacNhiemKy_('')); } catch (e) { apCauHinh_(null, null); }
}

/** Quy tắc của nhiệm kỳ đang chạy (đã nạp cấu hình BOD lưu). Dùng hàm này thay vì đọc thẳng QUY_TAC ở máy chủ. */
function quyTac_() {
  if (!DA_NAP_CAU_HINH_) napCauHinh_();
  return QUY_TAC;
}

/** Cơ cấu ban đã lưu (bảng Ban), theo thứ tự. Trống thì mặc định. */
function docCoCau_() {
  var ds = docBang_('Ban').slice().sort(function (a, b) { return (Number(a.ThuTu) || 0) - (Number(b.ThuTu) || 0); });
  var co = function (v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 'co'; };
  return ds.filter(function (b) { return String(b.MaBan || '').trim(); }).map(function (b) {
    return { ma: chuanChu_(b.MaBan), ten: String(b.TenBan || b.MaBan), nhom: chuanChu_(b.Nhom) || chuanChu_(b.MaBan).split(' ')[0],
      vietTat: chuanChu_(b.VietTat || b.MaBan).replace(/[^A-Z0-9]/g, ''), laBod: co(b.LaBod), phuTrach: co(b.PhuTrach), dangDung: b.DangDung === '' ? true : co(b.DangDung) };
  });
}

function ghiCoCau_(ds) {
  ghiDeBang_('Ban', ds.map(function (b, i) {
    return { MaBan: b.ma, TenBan: b.ten, Nhom: b.nhom, VietTat: b.vietTat, LaBod: !!b.laBod, PhuTrach: !!b.phuTrach, DangDung: b.dangDung !== false, ThuTu: i + 1 };
  }));
  DA_NAP_CAU_HINH_ = false;
}

/** Quy tắc của một nhiệm kỳ ('' là nhiệm kỳ đang chạy). Nhiệm kỳ chưa có bản riêng thì dùng quy tắc chung đang lưu. */
function quyTacNhiemKy_(nhiemKy) {
  var nk = docBang_('NhiemKy');
  var dong = nhiemKy ? nk.filter(function (n) { return String(n.NhiemKy) === String(nhiemKy); })[0] : nk[nk.length - 1];
  var luu = dong && String(dong.QuyTac || '').trim() ? dong.QuyTac : layCaiDat_('QuyTac');
  return chuanHoaQuyTac_(luu);
}

/** Lưu quy tắc: cho nhiệm kỳ đang chạy và làm mặc định cho các nhiệm kỳ sau. */
function luuQuyTac_(qt) {
  var chuoi = JSON.stringify(chuanHoaQuyTac_(qt));
  voiKhoa_(function () {
    datCaiDat_('QuyTac', chuoi);
    var sh = bangDuLieu_('NhiemKy');
    var v = sh.getDataRange().getValues();
    if (v.length > 1) sh.getRange(v.length, v[0].indexOf('QuyTac') + 1).setValue(chuoi);
  });
  DA_NAP_CAU_HINH_ = false;
  xoaBoNhoTam_();
}

/* ===================== Nhiệm kỳ, giai đoạn, thành viên ===================== */

/** Giai đoạn đang chạy { NhiemKy, GiaiDoan, BatDau } hoặc null nếu chưa mở giai đoạn nào. */
function layKyHienTai_() {
  var ds = docBang_('GiaiDoan');
  return ds.length ? ds[ds.length - 1] : null;
}

/** Lúc bắt đầu từng giai đoạn của một nhiệm kỳ: { số giai đoạn: ms }. */
function mocGiaiDoan_(nhiemKy) {
  var kq = {};
  docBang_('GiaiDoan').forEach(function (g) {
    if (String(g.NhiemKy) !== String(nhiemKy)) return;
    var t = new Date(g.BatDau).getTime(), n = Number(g.GiaiDoan);
    if (!isNaN(t) && (!kq[n] || t < kq[n])) kq[n] = t;
  });
  return kq;
}

/** Mốc giai đoạn của nhiệm kỳ đang chạy. */
function mocGiaiDoanNay_() {
  var ky = layKyHienTai_();
  return ky ? mocGiaiDoan_(ky.NhiemKy) : {};
}

/**
 * Lúc bắt đầu nhiệm kỳ hiện tại, tính bằng ms: lúc mở giai đoạn 1 đầu tiên của nhiệm kỳ này.
 * Các trang hằng ngày chỉ hiện dữ liệu từ mốc này. 0 = chưa có nhiệm kỳ nào.
 */
function batDauNhiemKy_() {
  return batDauNhiemKyTu_(docBang_('GiaiDoan'));
}

/** Đọc một tab, bỏ các dòng của nhiệm kỳ cũ (vẫn còn giữ, chỉ không hiện ở trang hằng ngày). */
function docBangNhiemKy_(ten, cotThoiGian) {
  return locNhiemKy_(docBang_(ten), function (d) { return d[cotThoiGian]; }, batDauNhiemKy_());
}

/** Thành viên đang hoạt động, theo thứ tự ban. */
function docThanhVien_() {
  return xepThanhVienTheoBan_(docBang_('ThanhVien').filter(function (t) { return String(t.TrangThai || TRANG_THAI_TV.DANG) !== TRANG_THAI_TV.ROI && String(t.HoVaTen || '').trim(); }));
}

/* ===================== Nhật ký hệ thống ===================== */

var GIU_NHAT_KY_DONG = 3000;

/** Ghi một dòng nhật ký (việc chạy tự động, lỗi). Không bao giờ làm hỏng việc đang chạy. */
function ghiNhatKy_(viec, ketQua, chiTiet, ms) {
  try {
    themDong_('NhatKyHeThong', [{ ThoiGian: new Date(), Viec: viec, KetQua: ketQua, ChiTiet: String(chiTiet || '').slice(0, 1000), ThoiGianChay: ms || '' }]);
  } catch (e) { /* bỏ qua */ }
}

/**
 * Chạy một việc tự động có ghi nhật ký. Lỗi thì ghi lại và báo mail cho BOD (mỗi việc tối đa một mail mỗi ngày),
 * để không ai phải mở code mới biết app có chạy đều không.
 */
function chayViec_(ten, viec) {
  var batDau = Date.now();
  try {
    var kq = viec();
    ghiLanChayCuoi_(ten);
    // Lần chạy không làm gì (ví dụ 10 phút một lần mà không có thư hẹn giờ) thì không ghi, để nhật ký gọn.
    if (kq) ghiNhatKy_(ten, 'OK', typeof kq === 'object' ? JSON.stringify(kq).slice(0, 500) : kq, Date.now() - batDau);
    return kq;
  } catch (e) {
    var loi = String(e && e.message || e);
    ghiNhatKy_(ten, 'Lỗi', loi, Date.now() - batDau);
    try {
      var kho = PropertiesService.getScriptProperties(), khoa = 'baoloi_' + ten, hom = Utilities.formatDate(new Date(), muiGio_(), 'yyyy-MM-dd');
      if (kho.getProperty(khoa) !== hom) {
        kho.setProperty(khoa, hom);
        baoChoBod_('App gặp lỗi khi chạy tự động', 'Việc "' + TEN_VIEC[ten] + '" vừa bị lỗi:\n' + loi +
          '\n\nMở app, vào Cài đặt, Hệ thống để xem tình trạng. Thường lỗi tự hết ở lần chạy sau; nếu ngày mai vẫn còn, xem phần "Khi app báo lỗi" trong Cài đặt, Hệ thống.');
      }
    } catch (x) { /* bỏ qua */ }
    return null;
  }
}

/** Ghi lúc chạy gần nhất của một việc (để trang Hệ thống biết lịch còn chạy đều dù không có gì để làm). */
function ghiLanChayCuoi_(ten) {
  try { PropertiesService.getScriptProperties().setProperty('chaycuoi_' + ten, String(Date.now())); } catch (e) { /* bỏ qua */ }
}

/* ===================== Lịch chạy tự động ===================== */

/** Các việc chạy tự động: [hàm, tên tiếng Việt, cách cài]. */
var TEN_VIEC = {
  chayHangDem: 'Sao lưu và dọn dẹp ban đêm',
  nhacViecHangNgay: 'Nhắc hạn task',
  guiThuDaLenLich: 'Gửi thư hẹn giờ',
  nhacSeedingTheoGio: 'Nhắc điền báo cáo seeding'
};

/**
 * Cài lại mọi lịch chạy còn thiếu (an toàn khi bấm nhiều lần). Gọi khi cài đặt lần đầu và từ nút "Sửa lịch chạy"
 * ở Cài đặt, Hệ thống. Trả về danh sách lịch đang có.
 */
function caiLichChay_() {
  var co = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { co[t.getHandlerFunction()] = (co[t.getHandlerFunction()] || 0) + 1; });
  if (!co.chayHangDem) ScriptApp.newTrigger('chayHangDem').timeBased().atHour(2).everyDays(1).inTimezone(muiGio_()).create();
  if (!co.guiThuDaLenLich) ScriptApp.newTrigger('guiThuDaLenLich').timeBased().everyMinutes(10).create();
  if (!co.nhacSeedingTheoGio) ScriptApp.newTrigger('nhacSeedingTheoGio').timeBased().everyHours(1).create();
  if (!co.nhacViecHangNgay) caiLichNhac_(caiDatNhacZalo_().dsLuc);
  return tinhTrangLichChay_();
}

/** Lịch chạy đang có: [{ viec, ten, so }]. */
function tinhTrangLichChay_() {
  var co = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { co[t.getHandlerFunction()] = (co[t.getHandlerFunction()] || 0) + 1; });
  var kho = PropertiesService.getScriptProperties();
  return Object.keys(TEN_VIEC).map(function (k) { return { viec: k, ten: TEN_VIEC[k], so: co[k] || 0, chayCuoi: Number(kho.getProperty('chaycuoi_' + k)) || 0 }; });
}
