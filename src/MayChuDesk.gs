/**
 * Máy chủ app CLB ECO: đăng nhập, phân quyền và các chức năng cho BOD, ban nhân sự, UCV.
 * Mọi hàm gọi từ giao diện đều nhận "phien" (mã phiên đăng nhập) làm tham số đầu tiên.
 */

var THOI_HAN_PHIEN_NGAY = 60; // Ghi nhớ đăng nhập: mỗi lần mở app CLB ECO, hạn được kéo dài thêm 60 ngày.
var GIOI_HAN_SAI_MAT_KHAU = 8;

/* ===================== Đăng nhập ===================== */

function dangNhap(email, matKhau) {
  email = String(email || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var khoaDem = 'sai_' + email;
  var soLanSai = Number(cache.get(khoaDem) || 0);
  if (soLanSai >= GIOI_HAN_SAI_MAT_KHAU) throw new Error('Sai mật khẩu quá nhiều lần. Bạn thử lại sau 15 phút.');

  var tk = timTaiKhoan_(email);
  if (!tk || !dungMatKhau_(tk, matKhau)) {
    cache.put(khoaDem, String(soLanSai + 1), 900);
    throw new Error('Email hoặc mật khẩu không đúng.');
  }
  cache.remove(khoaDem);
  return taoPhien_(tk);
}

function taoPhien_(tk) {
  donPhienHetHan_();
  var phien = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('phien_' + phien, JSON.stringify({
    email: String(tk.Email).toLowerCase(), hetHan: Date.now() + THOI_HAN_PHIEN_NGAY * 864e5
  }));
  return { phien: phien, nguoiDung: thongTinNguoiDung_(tk) };
}

/**
 * Đăng nhập bằng Google (chỉ có khi mở app CLB ECO qua trang vỏ cài trên điện thoại/máy tính).
 * Trang vỏ lấy mã xác nhận (ID token) từ Google; ở đây hỏi lại Google để chắc mã thật, đúng ứng dụng của CLB.
 */
function dangNhapGoogle(idToken) {
  var clientId = String(layCaiDat_('GoogleClientId') || '');
  if (!clientId) throw new Error('CLB chưa bật đăng nhập bằng Google.');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(idToken || '')), { muteHttpExceptions: true });
  var info = null;
  try { info = JSON.parse(res.getContentText()); } catch (e) { info = null; }
  var loi = kiemTraTokenGoogle_(res.getResponseCode() === 200 ? info : null, clientId, Math.floor(Date.now() / 1000));
  if (loi) throw new Error(loi);
  var tk = timTaiKhoan_(info.email);
  if (!tk) throw new Error('Email ' + info.email + ' chưa có tài khoản app CLB ECO. Bạn đăng nhập bằng email đã ghi trong danh sách thành viên nhé.');
  return taoPhien_(tk);
}

function dangXuat(phien) {
  PropertiesService.getScriptProperties().deleteProperty('phien_' + phien);
  return true;
}

/** Mở app: người dùng và trang chào trong một lần hỏi máy chủ (mở nhanh hơn). Phiên hết hạn thì trả về null. */
function moDesk(phien) {
  var u = layNguoiDung_(phien);
  if (!u) return null;
  return { nguoiDung: u, trangChu: layTrangChu(phien) };
}

/** Trả về người dùng của phiên, hoặc null nếu phiên hết hạn. Mỗi lần mở app thì gia hạn phiên. */
function layNguoiDung_(phien) {
  var u = docPhien_(phien);
  if (!u) return null;
  var props = PropertiesService.getScriptProperties();
  try {
    var p = JSON.parse(props.getProperty('phien_' + phien));
    if (p.hetHan - Date.now() < (THOI_HAN_PHIEN_NGAY - 1) * 864e5) {
      p.hetHan = Date.now() + THOI_HAN_PHIEN_NGAY * 864e5;
      props.setProperty('phien_' + phien, JSON.stringify(p));
    }
  } catch (e) { /* không gia hạn được thì thôi */ }
  return thongTinNguoiDung_(u);
}

function doiMatKhau(phien, matKhauCu, matKhauMoi) {
  var tk = canDangNhap_(phien);
  if (!dungMatKhau_(tk, matKhauCu)) throw new Error('Mật khẩu hiện tại không đúng.');
  var loi = kiemTraMatKhauMoi_(matKhauMoi);
  if (loi) throw new Error(loi);
  ghiMatKhau_(tk.Email, matKhauMoi);
  return true;
}

/** Mật khẩu có đúng không. Tài khoản chưa đổi mật khẩu thì so với mật khẩu mặc định của CLB. */
function dungMatKhau_(tk, matKhau) {
  var bam = String(tk.MatKhau || ''), muoi = String(tk.Muoi || '');
  if (!bam) { bam = layBiMat_('MatKhauMacDinh'); muoi = layBiMat_('MuoiMacDinh'); }
  return !!bam && bamMatKhau_(String(matKhau || ''), muoi) === bam;
}

function thongTinNguoiDung_(tk) {
  var vaiTro = String(tk.VaiTro);
  var gd = String(tk.GiaoDien || '');
  var pv = vaiTro === 'HR' ? phamViHrCua_(tk) : { co: false };
  return {
    email: String(tk.Email), ten: String(tk.HoVaTen), vaiTro: vaiTro, chucVu: vaiTro === 'BOD' ? chucVuCua_(tk) : '',
    nhomHr: nhomHr_(tk.NhomHr), phuTrach: !!pv.co, anh: anhDaiDien_(tk.Email),
    gmail: vaiTro === 'BOD' ? linkGmail_('#inbox') : '', giaoDien: ['light', 'dark'].indexOf(gd) >= 0 ? gd : 'auto'
  };
}

/* ===================== Ảnh đại diện ===================== */

/** Ảnh đại diện (ảnh JPEG nhỏ dạng data URL, đã thu nhỏ trên máy người dùng). Chưa có thì ''. */
function anhDaiDien_(email) {
  try {
    var sh = soDuLieu_().getSheetByName('AnhDaiDien');
    if (!sh || sh.getLastRow() < 2) return '';
    var o = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(String(email)).matchEntireCell(true).matchCase(false).findNext();
    return o ? String(sh.getRange(o.getRow(), 2).getValue() || '') : '';
  } catch (e) { return ''; }
}

/** Lưu (hoặc bỏ, khi anh rỗng) ảnh đại diện của chính mình. */
function luuAnhDaiDien(phien, anh) {
  var tk = canDangNhap_(phien);
  anh = String(anh || '');
  if (anh && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(anh)) throw new Error('Ảnh không hợp lệ.');
  if (anh.length > 40000) throw new Error('Ảnh lớn quá, bạn chọn ảnh khác nhé.');
  voiKhoa_(function () {
    var sh = bangDuLieu_('AnhDaiDien');
    var v = sh.getDataRange().getValues(), e = String(tk.Email).toLowerCase();
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][0]).toLowerCase() !== e) continue;
      if (anh) sh.getRange(r + 1, 2, 1, 2).setValues([[anh, new Date()]]); else sh.deleteRow(r + 1);
      return;
    }
    if (anh) sh.appendRow([String(tk.Email), anh, new Date()]);
  });
  return anh;
}

/** Chức vụ ghi trong danh sách thành viên (tìm theo email, rồi theo họ tên). */
function chucVuCua_(tk) {
  var e = String(tk.Email).toLowerCase(), ten = String(tk.HoVaTen).toLowerCase();
  var ds = docBang_('ThanhVien');
  var tv = ds.filter(function (t) { return String(t.Email).toLowerCase() === e; })[0] || ds.filter(function (t) { return String(t.HoVaTen).toLowerCase() === ten; })[0];
  return tv ? String(tv.ChucVu || '').trim() : '';
}

function timTaiKhoan_(email) {
  var e = String(email || '').toLowerCase();
  var ds = docBang_('TaiKhoan');
  for (var i = 0; i < ds.length; i++) if (String(ds[i].Email).toLowerCase() === e) return ds[i];
  return null;
}

function docPhien_(phien) {
  if (!phien) return null;
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('phien_' + phien);
  if (!raw) return null;
  var p = JSON.parse(raw);
  if (p.hetHan < Date.now()) { props.deleteProperty('phien_' + phien); return null; }
  return timTaiKhoan_(p.email);
}

/** Bắt buộc đăng nhập (và có quyền với chức năng, nếu nêu). Trả về tài khoản. */
function canDangNhap_(phien, chucNang) {
  var tk = docPhien_(phien);
  if (!tk) throw new Error('PHIEN_HET_HAN');
  if (chucNang && !coQuyen_(String(tk.VaiTro), chucNang)) throw new Error('Bạn không có quyền dùng chức năng này.');
  return tk;
}

function ghiMatKhau_(email, matKhau) {
  voiKhoa_(function () {
    var sh = bangDuLieu_('TaiKhoan');
    var v = sh.getDataRange().getValues();
    var td = v[0];
    var cE = td.indexOf('Email'), cM = td.indexOf('MatKhau'), cS = td.indexOf('Muoi');
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][cE]).toLowerCase() === String(email).toLowerCase()) {
        var muoi = Utilities.getUuid();
        sh.getRange(r + 1, cM + 1).setValue(bamMatKhau_(String(matKhau), muoi));
        sh.getRange(r + 1, cS + 1).setValue(muoi);
        return;
      }
    }
    throw new Error('Không tìm thấy tài khoản ' + email + '.');
  });
}

/** Xoá các phiên đã hết hạn. Gọi kèm mỗi lần đăng nhập thành công là đủ, không cần lịch chạy. */
function donPhienHetHan_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('phien_') !== 0) return;
    try { if (JSON.parse(all[k]).hetHan < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/* ===================== Cộng điểm ===================== */

function layDuLieuCongDiem(phien) {
  canDangNhap_(phien, 'congdiem');
  var ky = layKyHienTai_();
  return {
    ky: ky ? { nhiemKy: String(ky.NhiemKy), giaiDoan: Number(ky.GiaiDoan) } : null,
    thanhVien: docThanhVien_().filter(khongPhaiBod_).map(function (tv) { return { ten: String(tv.HoVaTen), maTV: String(tv.MaTV || ''), ban: String(tv.Ban), nhom: nhomBan_(tv.Ban) }; }),
    loai: docBang_('LoaiHoatDong').filter(loaiCongTay_).map(function (l) { return { ten: String(l.TenLoai), diem: Number(l.Diem) || 0 }; }),
    ganDay: lichSuGanDay_(ky, 30)
  };
}

function lichSuGanDay_(ky, soDong) {
  if (!ky) return [];
  return docBang_('LichSuDiem').filter(function (d) { return cungKy_(d, ky.NhiemKy, ky.GiaiDoan); })
    .map(function (d) {
      return {
        thoiGian: new Date(d.ThoiGian).getTime(), ten: String(d.HoVaTen), loai: String(d.LoaiHoatDong),
        tenHoatDong: String(d.TenHoatDong || ''), diem: Number(d.Diem) || 0, nguoiCong: String(d.NguoiCong)
      };
    })
    .sort(function (a, b) { return b.thoiGian - a.thoiGian; })
    .slice(0, soDong);
}

function congDiem(phien, yeuCau) {
  var tk = canDangNhap_(phien, 'congdiem');
  var khoa = layKhoa_();
  try {
    var kq = taoDongCongDiem_(yeuCau, docThanhVien_().filter(khongPhaiBod_), docBang_('LoaiHoatDong').filter(loaiCongTay_), String(tk.HoVaTen), layKyHienTai_(), new Date(), docBang_('LichSuDiem'));
    if (kq.loi) throw new Error(kq.loi);
    themDong_('LichSuDiem', kq.dong);
    xoaBoNhoTam_();
    return kq.dong.length;
  } finally {
    traKhoa_(khoa);
  }
}

/** Xoá một lần cộng nhầm, nhận diện bằng thời gian cộng và họ tên. */
function xoaDongDiem(phien, thoiGianMs, hoVaTen) {
  canDangNhap_(phien, 'congdiem');
  return voiKhoa_(function () {
    var sh = bangDuLieu_('LichSuDiem');
    var v = sh.getDataRange().getValues();
    var cT = v[0].indexOf('ThoiGian'), cN = v[0].indexOf('HoVaTen');
    for (var r = v.length - 1; r >= 1; r--) {
      if (new Date(v[r][cT]).getTime() === Number(thoiGianMs) && String(v[r][cN]) === String(hoVaTen)) {
        sh.deleteRow(r + 1);
        xoaBoNhoTam_();
        return true;
      }
    }
    throw new Error('Không tìm thấy dòng cần xoá, có thể đã bị xoá trước đó.');
  });
}

/* ===================== Góp ý ===================== */

function layGopY(phien) {
  canDangNhap_(phien, 'gopy');
  return docBangNhiemKy_('GopY', 'ThoiGian').map(function (g) {
    return {
      thoiGian: new Date(g.ThoiGian).getTime(), noiDung: String(g.NoiDung), daDoc: g.DaDoc === true || g.DaDoc === 'TRUE',
      ten: String(g.HoVaTen || ''), daDung: g.DaDung ? new Date(g.DaDung).getTime() : 0, nguoiDanhDau: String(g.NguoiDanhDau || '')
    };
  }).sort(function (a, b) { return b.thoiGian - a.thoiGian; });
}

/** BOD xác nhận góp ý có ghi tên đã được đưa vào sử dụng: cộng điểm cho người gửi (theo loại gắn với góp ý, có giới hạn mỗi giai đoạn). */
function danhDauGopYDuocDung(phien, thoiGianMs) {
  var tk = canDangNhap_(phien, 'gopy');
  return voiKhoa_(function () {
    var sh = bangDuLieu_('GopY');
    var v = sh.getDataRange().getValues(), td = v[0];
    var cT = td.indexOf('ThoiGian'), cTen = td.indexOf('HoVaTen'), cDung = td.indexOf('DaDung'), cNg = td.indexOf('NguoiDanhDau'), cDoc = td.indexOf('DaDoc');
    for (var r = 1; r < v.length; r++) {
      if (new Date(v[r][cT]).getTime() !== Number(thoiGianMs)) continue;
      var ten = String(v[r][cTen] || '').trim();
      if (!ten) throw new Error('Góp ý này không ghi tên nên không cộng điểm được.');
      if (v[r][cDung]) throw new Error('Góp ý này đã được đánh dấu trước đó.');
      var loaiHd = docBang_('LoaiHoatDong');
      var loai = loaiDungCho_(loaiHd, DUNG_CHO.GOP_Y);
      if (!loai) throw new Error('Chưa có loại hoạt động dùng cho góp ý. Chọn trong Cài đặt, mục Thang điểm hoạt động.');
      var kq = taoDongCongDiem_({ loai: String(loai.TenLoai), tenHoatDong: String(v[r][td.indexOf('NoiDung')]).slice(0, 80), nguoi: [ten] },
        docThanhVien_().filter(khongPhaiBod_), loaiHd, String(tk.HoVaTen), layKyHienTai_(), new Date(), docBang_('LichSuDiem'));
      if (kq.loi) throw new Error(kq.loi);
      themDong_('LichSuDiem', kq.dong);
      sh.getRange(r + 1, cDung + 1).setValue(new Date());
      sh.getRange(r + 1, cNg + 1).setValue(String(tk.HoVaTen));
      sh.getRange(r + 1, cDoc + 1).setValue(true);
      xoaBoNhoTam_();
      return { ten: ten, diem: Number(loai.Diem) || 0 };
    }
    throw new Error('Không tìm thấy góp ý này.');
  });
}

function danhDauDaDoc(phien, thoiGianMs) {
  canDangNhap_(phien, 'gopy');
  return voiKhoa_(function () {
    var sh = bangDuLieu_('GopY');
    var v = sh.getDataRange().getValues();
    var cT = v[0].indexOf('ThoiGian'), cD = v[0].indexOf('DaDoc');
    for (var r = 1; r < v.length; r++) {
      if (new Date(v[r][cT]).getTime() === Number(thoiGianMs)) { sh.getRange(r + 1, cD + 1).setValue(true); return true; }
    }
    return false;
  });
}

/* ===================== Cài đặt ===================== */

function layCaiDatDesk(phien) {
  canDangNhap_(phien, 'caidat');
  var tv = docThanhVien_();
  return {
    loai: docBang_('LoaiHoatDong').map(function (l) { return { ten: String(l.TenLoai), diem: Number(l.Diem) || 0, congTay: loaiCongTay_(l), gioiHan: gioiHanLoai_(l), dungCho: String(l.DungCho || '') }; }),
    mucDiemQuyChe: MUC_DIEM_QUY_CHE,
    quyChe: String(layCaiDat_('QuyChe') || ''),
    baoGopY: baoGopYQuaMail_(),
    baoThuChoDuyet: batSuKien_('BaoThuChoDuyet'),
    baoSeeding: baoSeedingMoi_(),
    nhac: caiDatNhacZalo_(),
    anhNen: String(layCaiDat_('AnhNenPhienBan') || ''),
    ghim: docBang_('BangGhim').map(function (g) { return { tieuDe: String(g.TieuDe), link: String(g.DuongDan) }; }),
    quyTac: quyTac_(),
    coCau: CO_CAU.ban,
    dungCho: cacDungCho_(),
    mail: { cheDoUcv: cheDoXemUcv_(), soDanhBa: docBang_('DanhBa').length, soThanhVien: tv.filter(function (t) { return emailHopLe_(t.Email); }).length },
    googleClientId: String(layCaiDat_('GoogleClientId') || ''),
    chuDe: chuDeHopLe_(layCaiDat_('ChuDe')),
    log: { linkMau: String(layCaiDat_('LinkMauLog') || ''), linkThuMuc: String(layCaiDat_('LinkThuMucLog') || '') },
    zalo: (function () {
      var n = dongBoNguoiNhanZalo_();
      return { coBot: !!layTokenZalo_(), daKetNoi: n.filter(function (x) { return x.chatId; }).length, tong: n.length };
    })(),
    taiKhoan: docBang_('TaiKhoan').filter(function (t) { return String(t.VaiTro) !== 'TV'; }).map(function (t) { return { email: String(t.Email), ten: String(t.HoVaTen), vaiTro: String(t.VaiTro), banQuanLy: banQuanLy_(t.BanQuanLy), nhomHr: nhomHr_(t.NhomHr) }; }),
    thanhVien: tv.map(function (t) { return { ten: String(t.HoVaTen), maTV: String(t.MaTV || ''), ban: String(t.Ban), email: String(t.Email || '') }; })
  };
}

function luuLoaiHoatDong(phien, ds) {
  canDangNhap_(phien, 'caidat');
  var kq = chuanHoaLoaiHoatDong_(ds);
  if (kq.loi) throw new Error(kq.loi);
  ghiDeBang_('LoaiHoatDong', kq.ds);
  xoaBoNhoTam_();
  return true;
}

/** Giao diện theo mùa hoặc ngày lễ cho cả app. Trống là giao diện mặc định. */
function luuChuDe(phien, ma) {
  canDangNhap_(phien, 'caidat');
  var m = chuDeHopLe_(ma);
  if (String(ma || '').trim() && !m) throw new Error('Không có giao diện này.');
  datCaiDat_('ChuDe', m);
  xoaBoNhoTam_();
  return m;
}

/** Quy chế cộng điểm là một link (thường là file Google Docs). Bỏ trống để ẩn. */
function luuQuyChe(phien, link) {
  canDangNhap_(phien, 'caidat');
  var l = String(link || '').trim();
  if (l && !linkHopLe_(l)) throw new Error('Link quy chế phải bắt đầu bằng http:// hoặc https://');
  datCaiDat_('QuyChe', l);
  xoaBoNhoTam_();
  return true;
}

/** Có báo cho BOD khi có góp ý mới không. Mặc định là có. */
function baoGopYQuaMail_() {
  return String(layCaiDat_('BaoGopYQuaMail') || '') !== 'tat';
}

/** Báo góp ý mới cho BOD (theo cách mỗi người chọn). Tối đa một lần mỗi 10 phút để không tốn lượt gửi trong ngày. */
function thongBaoGopYMoi_(noiDung) {
  if (!baoGopYQuaMail_()) return;
  var cache = CacheService.getScriptCache();
  if (cache.get('daBaoGopY')) return;
  cache.put('daBaoGopY', '1', 600);
  baoChoBod_('Góp ý mới', 'Có góp ý ẩn danh mới trong app CLB ECO:\n\n' + String(noiDung).slice(0, 1500) +
    '\n\nMở app CLB ECO, mục Góp ý để xem tất cả. Trong 10 phút tới nếu có thêm góp ý thì sẽ không báo nữa.');
}

function luuGhim(phien, ds) {
  canDangNhap_(phien, 'caidat');
  var kq = chuanHoaGhim_(ds);
  if (kq.loi) throw new Error(kq.loi);
  ghiDeBang_('BangGhim', kq.ds);
  xoaBoNhoTam_();
  return true;
}

/**
 * Nâng quyền một thành viên lên ban nhân sự (HR) hoặc UCV. Thành viên đã có tài khoản thì giữ mật khẩu cũ;
 * chưa có thì tạo, dùng mật khẩu ban đầu (nếu nhập) hoặc mật khẩu mặc định của CLB.
 */
function themBanNhanSu(phien, hoVaTen, matKhau, vaiTro) {
  vaiTro = vaiTro === 'UCV' ? 'UCV' : 'HR';
  canDangNhap_(phien, 'caidat');
  var tv = docThanhVien_().filter(function (t) { return String(t.HoVaTen) === String(hoVaTen); })[0];
  if (!tv) throw new Error('Không có "' + hoVaTen + '" trong danh sách thành viên.');
  var email = String(tv.Email || '').trim().toLowerCase();
  if (!email) throw new Error(hoVaTen + ' chưa có email trong danh sách thành viên.');
  if (laBanBod_(tv.Ban)) throw new Error(hoVaTen + ' là BOD, đã có mọi quyền.');
  matKhau = String(matKhau || '');
  if (matKhau) { var loi = kiemTraMatKhauMoi_(matKhau); if (loi) throw new Error(loi); }
  return voiKhoa_(function () {
    var tk = timTaiKhoan_(email);
    if (tk && String(tk.VaiTro) === vaiTro) throw new Error(hoVaTen + ' đã là ' + vaiTro + '.');
    if (tk) {
      ghiCotTaiKhoan_(email, 'VaiTro', vaiTro);
      if (matKhau) ghiMatKhau_(email, matKhau);
      return true;
    }
    if (!matKhau && !layBiMat_('MatKhauMacDinh')) throw new Error('CLB chưa có mật khẩu chung. Nhập mật khẩu ban đầu cho ' + hoVaTen + ', hoặc đặt mật khẩu chung ở Cài đặt, Tài khoản, Mật khẩu chung.');
    var muoi = matKhau ? Utilities.getUuid() : '';
    themDong_('TaiKhoan', [{ Email: email, MaTV: String(tv.MaTV || ''), HoVaTen: tv.HoVaTen, VaiTro: vaiTro, MatKhau: matKhau ? bamMatKhau_(matKhau, muoi) : '', Muoi: muoi, NgayTao: new Date() }]);
    return true;
  });
}

/** Lưu phân ban cho một tài khoản HR (danh sách nhóm ban, trống là chưa phân ban: không phụ trách task nào). */
function luuBanQuanLy(phien, email, dsBan) {
  canDangNhap_(phien, 'caidat');
  var tk = timTaiKhoan_(email);
  if (!tk || String(tk.VaiTro) !== 'HR') throw new Error('Chỉ phân ban cho tài khoản HR.');
  quyTac_();
  ghiCotTaiKhoan_(tk.Email, 'BanQuanLy', banQuanLy_((dsBan || []).join(',')).filter(function (b) { return banCoo_().indexOf(b) >= 0; }).join(', '));
  return true;
}

/** Nhóm HR của một người (chỉ còn SUP-SEED: phụ trách seeding). HR và UCV đều được xếp nhóm. */
function luuNhomHr(phien, email, ds) {
  canDangNhap_(phien, 'caidat');
  var tk = timTaiKhoan_(email);
  if (!tk || ['HR', 'UCV'].indexOf(String(tk.VaiTro)) < 0) throw new Error('Chỉ xếp nhóm cho tài khoản HR hoặc UCV.');
  ghiCotTaiKhoan_(String(tk.Email), 'NhomHr', nhomHr_((ds || []).join(',')).join(', '));
  return true;
}

/** Gỡ quyền HR hoặc UCV: người đó về lại thành viên thường (vẫn đăng nhập được). BOD đi theo cột Ban của danh sách thành viên. */
function goTaiKhoan(phien, email) {
  canDangNhap_(phien, 'caidat');
  var tk = timTaiKhoan_(email);
  if (!tk) throw new Error('Không tìm thấy tài khoản.');
  if (tk.VaiTro === 'BOD') throw new Error('Quyền BOD đi theo danh sách thành viên. Muốn gỡ, hãy sửa cột Ban trên sheet nguồn rồi tải lại danh sách ở Cài đặt, Tài khoản, Tải danh sách thành viên.');
  ghiCotTaiKhoan_(String(tk.Email), 'VaiTro', 'TV');
  ghiCotTaiKhoan_(String(tk.Email), 'BanQuanLy', '');
  ghiCotTaiKhoan_(String(tk.Email), 'NhomHr', '');
  return true;
}

function datLaiMatKhau(phien, email, matKhauMoi) {
  canDangNhap_(phien, 'caidat');
  var loi = kiemTraMatKhauMoi_(matKhauMoi);
  if (loi) throw new Error(loi);
  ghiMatKhau_(email, matKhauMoi);
  return true;
}

/* ===================== Task ===================== */

var GIU_TASK_DA_KET_THUC_NGAY = 120;

/** Ngày hôm nay theo giờ Việt Nam, dạng yyyy-MM-dd. */
function homNay_() {
  return Utilities.formatDate(new Date(), muiGio_(), 'yyyy-MM-dd');
}

/** Ô ngày trong sheet có thể là kiểu ngày hoặc chữ; đưa về yyyy-MM-dd. */
function ngayChuoi_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, muiGio_(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

/** Trễ quá bao nhiêu ngày thì task tính là không hoàn thành (Cài đặt, Quy tắc). */
function soNgayKhongHoanThanh_() { return quyTac_().khtSauNgay; }

/** Còn bao nhiêu ngày thì task hiện "sắp đến hạn" (Cài đặt, Quy tắc). */
function soNgaySapDenHan_() { return quyTac_().sapDenHanNgay; }

/** Quyền với task của tài khoản đang đăng nhập (theo vai trò, ban HR được phân, chức vụ BOD). */
function quyenTaskCua_(tk) {
  var banCua = {};
  docBang_('ThanhVien').forEach(function (t) { banCua[String(t.HoVaTen)] = String(t.Ban); });
  return quyenTask_(tk, String(tk.VaiTro) === 'BOD' ? chucVuCua_(tk) : '', banCua);
}

function kiemTraDuocGiao_(q, ten) {
  if (!q.sua(ten)) throw new Error('Bạn không có quyền với task của ' + ten + '. ' + (q.moTa || ''));
}

/** Đọc toàn bộ task kèm trạng thái đã tính. */
function docTask_() {
  var hom = homNay_(), sap = soNgaySapDenHan_(), kht = soNgayKhongHoanThanh_();
  return docBangNhiemKy_('Task', 'ThoiGianTao').map(function (t) {
    var han = ngayChuoi_(t.HanChot);
    var luu = String(t.TrangThai || TRANG_THAI_TASK.GIAO);
    var trangThai = trangThaiTask_(luu, han, hom, sap, kht);
    var xong = t.ThoiGianXong ? new Date(t.ThoiGianXong).getTime() : null;
    // Task cũ chưa có ngày nộp: lấy ngày bấm Đã xong.
    var ngayNop = ngayChuoi_(t.NgayNop) || (xong ? ngayChuoi_(new Date(xong)) : '');
    var chatLuong = String(t.ChatLuong || ''), dungHan = dungHanTask_(trangThai, han, ngayNop);
    return {
      thoiGianTao: new Date(t.ThoiGianTao).getTime(), ten: String(t.TenTask), moTa: String(t.MoTa || ''), hanChot: han,
      nguoi: String(t.NguoiPhuTrach), nguoiTao: String(t.NguoiTao), kieuTao: String(t.KieuTao),
      trangThaiLuu: luu, trangThai: trangThai, thoiGianXong: xong,
      ngayNop: trangThai === TRANG_THAI_TASK.XONG ? ngayNop : '', hanGoc: ngayChuoi_(t.HanGoc), ngayXinGiaHan: ngayChuoi_(t.NgayXinGiaHan),
      chatLuong: chatLuong, dauHieu: String(t.DauHieu || ''), nguoiDanhGia: String(t.NguoiDanhGia || ''), phanHoi: String(t.PhanHoi || ''),
      hrPhuTrach: String(t.HrPhuTrach || ''), dungHan: dungHan, ketQua: ketQuaTask_(dungHan, chatLuong)
    };
  });
}

function layDuLieuTask(phien) {
  var tk = canDangNhap_(phien, 'task');
  var moc = Date.now() - GIU_TASK_DA_KET_THUC_NGAY * 864e5;
  var q = quyenTaskCua_(tk), banCua = {}, khoiCua = {};
  docBang_('ThanhVien').forEach(function (t) { banCua[String(t.HoVaTen)] = String(t.Ban); khoiCua[String(t.HoVaTen)] = khoiLop_(t.Lop); });
  var ds = docTask_().filter(function (t) {
    if (!q.xem(t.nguoi)) return false;
    if (t.trangThai === TRANG_THAI_TASK.KHT) return new Date(t.hanChot).getTime() >= moc;
    if (t.trangThaiLuu !== TRANG_THAI_TASK.XONG && t.trangThaiLuu !== TRANG_THAI_TASK.HUY) return true;
    return (t.thoiGianXong || t.thoiGianTao) >= moc;
  }).map(function (t) { t.sua = q.sua(t.nguoi); t.nhom = nhomBan_(banCua[t.nguoi]) || 'Khác'; t.khoi = khoiCua[t.nguoi] || null; return t; })
    .sort(function (a, b) { return a.hanChot < b.hanChot ? -1 : a.hanChot > b.hanChot ? 1 : b.thoiGianTao - a.thoiGianTao; });
  return {
    homNay: homNay_(),
    sapDenHanNgay: soNgaySapDenHan_(),
    khongHoanThanhSau: soNgayKhongHoanThanh_(),
    task: ds,
    thanhVien: docThanhVien_().filter(function (tv) { return q.sua(tv.HoVaTen); }).map(function (tv) { return { ten: String(tv.HoVaTen), ban: String(tv.Ban), nhom: nhomBan_(tv.Ban) }; }),
    phamVi: q.moTa,
    dsNhom: ds.map(function (t) { return t.nhom; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(soSanhBan_),
    thongBao: (function () {
      var toi = nguoiNhanThongBao_().filter(function (n) { return n.email.toLowerCase() === String(tk.Email).toLowerCase(); })[0];
      return toi ? { cach: toi.cach } : null;
    })()
  };
}

function taoTask(phien, yeuCau) {
  var tk = canDangNhap_(phien, 'task');
  var q = quyenTaskCua_(tk);
  ((yeuCau && yeuCau.nguoi) || []).forEach(function (n) { kiemTraDuocGiao_(q, n); });
  var khoa = layKhoa_();
  var kq;
  try {
    kq = taoDongTask_(yeuCau, docThanhVien_(), String(tk.HoVaTen), String(tk.VaiTro), new Date());
    if (kq.loi) throw new Error(kq.loi);
    themDong_('Task', kq.dong);
  } finally {
    traKhoa_(khoa);
  }
  return kq.dong.length;
}

/** Tìm dòng task theo thời gian tạo và người phụ trách. Trả về số dòng trong sheet (tính từ 1). */
function timDongTask_(v, thoiGianTao, nguoi) {
  var cT = v[0].indexOf('ThoiGianTao'), cN = v[0].indexOf('NguoiPhuTrach');
  for (var r = 1; r < v.length; r++) {
    if (new Date(v[r][cT]).getTime() === Number(thoiGianTao) && String(v[r][cN]) === String(nguoi)) return r + 1;
  }
  throw new Error('Không tìm thấy task, có thể người khác vừa sửa. Bạn tải lại trang nhé.');
}

/** Sửa tên, mô tả, hạn chót hoặc người phụ trách của một task. */
function suaTask(phien, thoiGianTao, nguoiCu, moi) {
  var q = quyenTaskCua_(canDangNhap_(phien, 'task'));
  kiemTraDuocGiao_(q, nguoiCu);
  kiemTraDuocGiao_(q, moi && moi.nguoi);
  var k = kiemTraTask_({ ten: moi && moi.ten, moTa: moi && moi.moTa, hanChot: moi && moi.hanChot, nguoi: [moi && moi.nguoi] }, docThanhVien_());
  if (k.loi) throw new Error(k.loi);
  var khoa = layKhoa_();
  try {
    var sh = bangDuLieu_('Task');
    var v = sh.getDataRange().getValues();
    var dong = timDongTask_(v, thoiGianTao, nguoiCu);
    var td = v[0];
    var gia = v[dong - 1].slice();
    gia[td.indexOf('TenTask')] = k.ten;
    gia[td.indexOf('MoTa')] = k.moTa;
    gia[td.indexOf('HanChot')] = k.hanChot;
    gia[td.indexOf('NguoiPhuTrach')] = k.nguoi[0];
    sh.getRange(dong, 1, 1, td.length).setValues([gia]);
  } finally {
    traKhoa_(khoa);
  }
  return true;
}

/**
 * Đánh dấu Đã xong, Đã huỷ, hoặc mở lại (Đã giao). BOD và HR phụ trách làm thay thành viên.
 * Đánh xong thì chọn đúng hạn hay trễ hạn (kieuXong 'dung' / 'tre'), kể cả khi bấm muộn hoặc task đã quá hạn lâu.
 */
function doiTrangThaiTask(phien, thoiGianTao, nguoi, trangThai, kieuXong) {
  var tk = canDangNhap_(phien, 'task');
  if ([TRANG_THAI_TASK.XONG, TRANG_THAI_TASK.HUY, TRANG_THAI_TASK.GIAO].indexOf(trangThai) < 0) throw new Error('Trạng thái không hợp lệ.');
  if (trangThai === TRANG_THAI_TASK.XONG && kieuXong !== 'dung' && kieuXong !== 'tre') throw new Error('Chọn task xong đúng hạn hay trễ hạn.');
  kiemTraDuocGiao_(quyenTaskCua_(tk), nguoi);
  voiKhoa_(function () {
    var sh = bangDuLieu_('Task');
    var v = sh.getDataRange().getValues();
    var dong = timDongTask_(v, thoiGianTao, nguoi);
    var td = v[0];
    var nop = ngayNopTheoKieu_(kieuXong, ngayChuoi_(v[dong - 1][td.indexOf('HanChot')]), homNay_());
    sh.getRange(dong, td.indexOf('TrangThai') + 1).setValue(trangThai);
    sh.getRange(dong, td.indexOf('ThoiGianXong') + 1).setValue(trangThai === TRANG_THAI_TASK.GIAO ? '' : new Date());
    sh.getRange(dong, td.indexOf('NgayNop') + 1).setValue(trangThai === TRANG_THAI_TASK.XONG ? nop : '');
    if (trangThai !== TRANG_THAI_TASK.XONG) ['ChatLuong', 'DauHieu', 'NguoiDanhGia', 'LucDanhGia'].forEach(function (c) { sh.getRange(dong, td.indexOf(c) + 1).setValue(''); });
  });
  return true;
}

function luuGoogleClientId(phien, clientId) {
  canDangNhap_(phien, 'caidat');
  var id = String(clientId || '').trim();
  if (id && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Mã Client ID chưa đúng dạng. Mã đúng kết thúc bằng .apps.googleusercontent.com');
  datCaiDat_('GoogleClientId', id);
  return true;
}

/* ===================== Ảnh nền trang đăng nhập ===================== */

/** BOD tải ảnh nền (JPEG đã thu nhỏ trên máy, dạng base64). Chuỗi rỗng nghĩa là bỏ ảnh nền. */
function luuAnhNen(phien, base64) {
  canDangNhap_(phien, 'caidat');
  var b = String(base64 || '').replace(/^data:image\/\w+;base64,/, '');
  if (b.length > 4 * 1048576) throw new Error('Ảnh lớn quá. Bạn chọn ảnh khác nhé.');
  var cu = String(layCaiDat_('AnhNenId') || '');
  var moi = '';
  if (b) {
    var thuMuc = thuMucAnhNen_();
    moi = thuMuc.createFile(Utilities.newBlob(Utilities.base64Decode(b), 'image/jpeg', 'Ảnh nền đăng nhập.jpg')).getId();
  }
  datCaiDat_('AnhNenId', moi);
  datCaiDat_('AnhNenPhienBan', moi ? String(Date.now()) : '');
  if (cu) { try { DriveApp.getFileById(cu).setTrashed(true); } catch (e) { /* đã xoá */ } }
  return String(layCaiDat_('AnhNenPhienBan') || '');
}

function thuMucAnhNen_() {
  return thuMucCon_('Ảnh nền');
}

/** Trang đăng nhập hỏi ảnh nền (không cần đăng nhập). Máy đã có đúng bản thì không gửi lại ảnh. */
function layAnhNen(phienBanCo) {
  var pb = String(layCaiDat_('AnhNenPhienBan') || '');
  if (!pb || pb === String(phienBanCo || '')) return { phienBan: pb };
  var id = String(layCaiDat_('AnhNenId') || '');
  try { return { phienBan: pb, data: 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()) }; }
  catch (e) { return { phienBan: '' }; }
}

/* ===================== Trang chào ===================== */

/** Tóm tắt cho trang chào, tuỳ vai trò. */
function layTrangChu(phien) {
  var tk = canDangNhap_(phien);
  var vaiTro = String(tk.VaiTro), ten = String(tk.HoVaTen);
  var kq = {
    vaiTro: vaiTro,
    ghim: docBang_('BangGhim').filter(function (g) { return linkHopLe_(g.DuongDan); })
      .map(function (g) { return { tieuDe: String(g.TieuDe || g.DuongDan), link: String(g.DuongDan).trim() }; }),
    quyChe: String(layCaiDat_('QuyChe') || ''),
    loaiHoatDong: docBang_('LoaiHoatDong').map(function (l) { return { ten: String(l.TenLoai), diem: Number(l.Diem) || 0, tuDong: !loaiCongTay_(l), gioiHan: gioiHanLoai_(l) }; })
  };
  if (vaiTro !== 'BOD') {
    // Điểm và hạng của chính mình (BOD không tham gia cộng điểm).
    var xh = duLieuBoard_().thanhVien;
    var toi = xh.filter(function (p) { return String(p.ten).toLowerCase() === ten.toLowerCase(); })[0];
    if (toi) kq.diemCuaToi = { diem: toi.diem, hang: 1 + xh.filter(function (p) { return p.diem > toi.diem; }).length, tong: xh.length };
  }
  var tatCaTask = docTask_();
  var dsTask = tatCaTask.filter(function (t) { return t.trangThai !== TRANG_THAI_TASK.XONG && t.trangThai !== TRANG_THAI_TASK.HUY && t.trangThai !== TRANG_THAI_TASK.KHT; });
  var dem = function (ds) {
    return { dangLam: ds.length, sap: ds.filter(function (t) { return t.trangThai === TRANG_THAI_TASK.SAP; }).length, tre: ds.filter(function (t) { return t.trangThai === TRANG_THAI_TASK.TRE; }).length };
  };
  if (vaiTro !== 'BOD') {
    kq.taskCuaToi = dem(dsTask.filter(function (t) { return t.nguoi === ten; }));
    var tv = docThanhVien_().filter(function (t) { return String(t.HoVaTen).toLowerCase() === ten.toLowerCase(); })[0];
    if (tv) { var lg = kpiLogCuaNguoi_(tv, docSuKienLog_(), mocGiaiDoanNay_()); kq.logCuaToi = { tiLe: lg.tiLe, thamGia: lg.thamGia, giaoCuoi: lg.giaoCuoi }; }
    if (vaiTro === 'HR') {
      var pv = phamViHrCua_(tk);
      if (pv.co) kq.taskThanhVien = dem(dsTask.filter(function (t) { return t.nguoi !== ten && pv.thuoc(t.nguoi); }));
    }
  } else {
    kq.taskBod = { choDanhGia: tatCaTask.filter(function (t) { return t.ketQua === KET_QUA.CHO; }).length, tre: dsTask.filter(function (t) { return t.trangThai === TRANG_THAI_TASK.TRE; }).length };
    kq.logMo = docSuKienLog_().filter(function (x) { return String(x.TrangThai || '') !== SU_KIEN_CHOT && String(x.TrangThai || '') !== SU_KIEN_HUY; }).length;
  }
  if (vaiTro === 'BOD') {
    kq.choDuyet = docBangNhiemKy_('ViecMail', 'ThoiGian').filter(function (v) { return String(v.TrangThai) === TRANG_THAI_VIEC.CHO; }).length;
    kq.gopYMoi = docBangNhiemKy_('GopY', 'ThoiGian').filter(function (g) { return !(g.DaDoc === true || g.DaDoc === 'TRUE'); }).length;
  }
  if (vaiTro === 'UCV') {
    var thu = docBangNhiemKy_('ViecMail', 'ThoiGian').filter(function (v) { return String(v.NguoiTao) === ten; });
    var demThu = function (st) { return thu.filter(function (v) { return String(v.TrangThai) === st; }).length; };
    kq.thu = { nhap: demThu(TRANG_THAI_VIEC.NHAP), cho: demThu(TRANG_THAI_VIEC.CHO), sua: demThu(TRANG_THAI_VIEC.SUA), duyet: demThu(TRANG_THAI_VIEC.DUYET) };
  }
  var toi = nguoiNhanThongBao_().filter(function (n) { return n.email.toLowerCase() === String(tk.Email).toLowerCase(); })[0];
  kq.thongBao = toi ? { cach: toi.cach, soMay: toi.soMay, daKetNoiZalo: !!toi.chatId, tuNhac: toi.tuNhac } : null;
  return kq;
}
