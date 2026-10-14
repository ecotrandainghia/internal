/**
 * App tự chạy và tự giữ dữ liệu lâu dài, không cần ai biết code:
 * - Mỗi đêm (2 giờ sáng): sao lưu file dữ liệu (giữ 30 bản gần nhất), chép kết quả nhiệm kỳ, chuyển dữ liệu
 *   nhiệm kỳ cũ sang file lưu trữ, dọn phiên đăng nhập hết hạn và nhật ký cũ, kiểm tra dung lượng file.
 * - Trang Cài đặt, Hệ thống: xem lịch chạy, nhật ký, bản sao lưu, file lưu trữ; sửa lịch chạy, sao lưu ngay,
 *   khôi phục từ bản sao lưu, làm mới dữ liệu.
 */

var GIU_BAN_SAO_LUU = 30;
/** Tên tiếng Việt của các việc ghi nhật ký mà không phải lịch chạy. */
var TEN_VIEC_KHAC = { saoLuu: 'Sao lưu (bấm tay)', khoiPhuc: 'Khôi phục từ bản sao lưu', caiDat: 'Cài đặt lần đầu', taiDanhSach: 'Tải danh sách thành viên' };
var TOI_DA_O_GOOGLE_SHEET = 10000000;
var CANH_BAO_DUNG_LUONG = 0.7;

/* ===================== Việc ban đêm ===================== */

function chayHangDem(e) {
  if (!laLichChay_(e)) return;
  chayViec_('chayHangDem', chayHangDem_);
}

function chayHangDem_() {
  var kq = {}, loi = [];
  var buoc = function (ten, viec) { try { kq[ten] = viec(); } catch (x) { loi.push(ten + ': ' + (x && x.message || x)); } };
  buoc('saoLuu', saoLuu_);
  buoc('ketQua', luuKetQuaNhiemKy_);
  buoc('luuTru', luuTruNhiemKyCu_);
  buoc('phien', function () { donPhienHetHan_(); return true; });
  buoc('nhatKy', donNhatKy_);
  buoc('dungLuong', kiemTraDungLuong_);
  if (loi.length) throw new Error(loi.join(' | '));
  return kq;
}

/* ===================== Sao lưu ===================== */

/** Chép file dữ liệu vào thư mục Sao lưu, bỏ bớt bản cũ chỉ giữ GIU_BAN_SAO_LUU bản. Trả về tên bản mới. */
function saoLuu_() {
  var thuMuc = thuMucCon_('Sao lưu');
  var ten = 'CLB ECO - Sao lưu ' + Utilities.formatDate(new Date(), muiGio_(), 'yyyy-MM-dd HH.mm');
  DriveApp.getFileById(soDuLieu_().getId()).makeCopy(ten, thuMuc);
  var ds = cacBanSaoLuu_();
  ds.slice(GIU_BAN_SAO_LUU).forEach(function (b) { try { DriveApp.getFileById(b.id).setTrashed(true); } catch (x) { /* bỏ qua */ } });
  return ten;
}

/** Các bản sao lưu, mới nhất trước: [{ id, ten, luc }]. */
function cacBanSaoLuu_() {
  var ds = [], it = thuMucCon_('Sao lưu').getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) { var f = it.next(); ds.push({ id: f.getId(), ten: f.getName(), luc: f.getDateCreated().getTime() }); }
  return ds.sort(function (a, b) { return b.luc - a.luc; });
}

/* ===================== Lưu trữ nhiệm kỳ cũ ===================== */

/**
 * Chuyển dòng của các nhiệm kỳ đã xong lâu (xem nhiemKyCanLuuTru_) sang một file riêng cho mỗi nhiệm kỳ, trong thư mục
 * Lưu trữ. File chính nhẹ lại; kết quả của nhiệm kỳ (KetQuaNhiemKy), thành viên, tài khoản vẫn ở file chính.
 */
function luuTruNhiemKyCu_() {
  var khoang = khoangNhiemKy_(docBang_('GiaiDoan'));
  var daLuu = {};
  docBang_('NhiemKy').forEach(function (n) { if (n.NgayLuuTru) daLuu[String(n.NhiemKy)] = true; });
  var can = nhiemKyCanLuuTru_(khoang, Date.now(), daLuu);
  can.forEach(function (nk) { luuTruMotNhiemKy_(nk, khoang); });
  return can.length ? can.join(', ') : '';
}

function luuTruMotNhiemKy_(nk, khoang) {
  var ss = SpreadsheetApp.create('CLB ECO - Lưu trữ nhiệm kỳ ' + nk);
  DriveApp.getFileById(ss.getId()).moveTo(thuMucCon_('Lưu trữ'));
  var dau = ss.getSheets()[0];
  voiKhoa_(function () {
    BANG_LUU_TRU.forEach(function (b) {
      var ten = b[0], chia = chiaDongLuuTru_(docBang_(ten), b[1], khoang, nk);
      if (!chia.chuyen.length) return;
      var cot = BANG[ten], sh = ss.insertSheet(ten);
      sh.getRange(1, 1, 1, cot.length).setValues([cot]).setFontWeight('bold');
      sh.getRange(2, 1, chia.chuyen.length, cot.length).setValues(chia.chuyen.map(function (d) { return cot.map(function (c) { return d[c] === undefined ? '' : d[c]; }); }));
      sh.setFrozenRows(1);
      ghiDeBang_(ten, chia.giu);
    });
    if (ss.getSheets().length > 1) ss.deleteSheet(dau);
    var sh = bangDuLieu_('NhiemKy'), v = sh.getDataRange().getValues(), td = v[0];
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][td.indexOf('NhiemKy')]) !== String(nk)) continue;
      sh.getRange(r + 1, td.indexOf('IdLuuTru') + 1).setValue(ss.getId());
      sh.getRange(r + 1, td.indexOf('NgayLuuTru') + 1).setValue(new Date());
    }
  });
  xoaBoNhoTam_();
  ghiNhatKy_('chayHangDem', 'OK', 'Đã chuyển dữ liệu nhiệm kỳ ' + nk + ' sang file lưu trữ');
}

/* ===================== Dọn dẹp, dung lượng ===================== */

function donNhatKy_() {
  var ds = docBang_('NhatKyHeThong');
  if (ds.length <= GIU_NHAT_KY_DONG) return '';
  voiKhoa_(function () { ghiDeBang_('NhatKyHeThong', ds.slice(ds.length - GIU_NHAT_KY_DONG)); });
  return 'Bỏ ' + (ds.length - GIU_NHAT_KY_DONG) + ' dòng cũ';
}

/** Số ô đang dùng của file dữ liệu so với giới hạn 10 triệu ô của Google Sheet. */
function dungLuong_() {
  var o = 0;
  soDuLieu_().getSheets().forEach(function (sh) { o += sh.getMaxRows() * sh.getMaxColumns(); });
  return { o: o, toiDa: TOI_DA_O_GOOGLE_SHEET, tiLe: Math.round(o * 100 / TOI_DA_O_GOOGLE_SHEET) };
}

/** Gần đầy thì báo BOD (tối đa mỗi tuần một lần). */
function kiemTraDungLuong_() {
  var d = dungLuong_();
  if (d.o < TOI_DA_O_GOOGLE_SHEET * CANH_BAO_DUNG_LUONG) return d.tiLe + '%';
  var kho = PropertiesService.getScriptProperties(), cuoi = Number(kho.getProperty('baoDungLuong') || 0);
  if (Date.now() - cuoi > 7 * 864e5) {
    kho.setProperty('baoDungLuong', String(Date.now()));
    baoChoBod_('File dữ liệu của app sắp đầy', 'File dữ liệu đang dùng ' + d.tiLe + '% sức chứa của Google Sheet. ' +
      'App tự chuyển dữ liệu nhiệm kỳ đã xong hơn một năm sang file lưu trữ. Nếu vẫn gần đầy, mở app, Cài đặt, Hệ thống để xem chi tiết.');
  }
  return d.tiLe + '%';
}

/* ===================== Trang Cài đặt, Hệ thống ===================== */

function layHeThong(phien) {
  canDangNhap_(phien, 'caidat');
  var nk = docBang_('NhatKyHeThong');
  return {
    lichChay: tinhTrangLichChay_(),
    nhatKy: nk.slice(-60).reverse().map(function (d) {
      return { luc: new Date(d.ThoiGian).getTime(), viec: TEN_VIEC[d.Viec] || TEN_VIEC_KHAC[d.Viec] || String(d.Viec), ketQua: String(d.KetQua), chiTiet: String(d.ChiTiet || '') };
    }),
    saoLuu: cacBanSaoLuu_().slice(0, GIU_BAN_SAO_LUU).map(function (b) { return { id: b.id, ten: b.ten, luc: b.luc }; }),
    luuTru: docBang_('NhiemKy').map(function (n) {
      return { nhiemKy: String(n.NhiemKy), id: String(n.IdLuuTru || ''), luc: n.NgayLuuTru ? new Date(n.NgayLuuTru).getTime() : 0 };
    }).reverse(),
    dungLuong: dungLuong_(),
    fileDuLieu: soDuLieu_().getUrl(),
    thuMuc: thuMucGoc_().getUrl(),
    luuTruSauNgay: LUU_TRU_SAU_NGAY,
    giuSaoLuu: GIU_BAN_SAO_LUU
  };
}

/** Cài lại lịch chạy còn thiếu (an toàn khi bấm nhiều lần). */
function suaLichChay(phien) {
  canDangNhap_(phien, 'caidat');
  return caiLichChay_();
}

function saoLuuNgay(phien) {
  canDangNhap_(phien, 'caidat');
  var ten = saoLuu_();
  ghiNhatKy_('saoLuu', 'OK', ten);
  return ten;
}

/**
 * Khôi phục: chép một bản sao lưu thành file dữ liệu mới và dùng file đó. File đang dùng được đổi tên
 * "(trước khôi phục)" và để lại trong thư mục app, không bị xoá.
 */
function khoiPhucSaoLuu(phien, id) {
  var tk = canDangNhap_(phien, 'caidat');
  var ban = cacBanSaoLuu_().filter(function (b) { return b.id === String(id); })[0];
  if (!ban) throw new Error('Không tìm thấy bản sao lưu này.');
  return voiKhoa_(function () {
    var cu = DriveApp.getFileById(soDuLieu_().getId());
    var moi = DriveApp.getFileById(ban.id).makeCopy('CLB ECO - Dữ liệu', thuMucGoc_());
    cu.setName(cu.getName() + ' (trước khôi phục ' + Utilities.formatDate(new Date(), muiGio_(), 'yyyy-MM-dd HH.mm') + ')');
    datFileDuLieu_(moi.getId());
    ghiNhatKy_('khoiPhuc', 'OK', String(tk.HoVaTen) + ' khôi phục từ ' + ban.ten);
    return ban.ten;
  });
}

/** Bỏ mọi bản nhớ tạm (khi ai đó sửa tay trên file dữ liệu và app chưa thấy). */
function lamMoiDuLieu(phien) {
  canDangNhap_(phien, 'caidat');
  xoaMoiBoNhoTam_();
  CacheService.getScriptCache().remove('xephang');
  DA_NAP_CAU_HINH_ = false;
  PropertiesService.getScriptProperties().deleteProperty('CauTrucBang');
  return true;
}
