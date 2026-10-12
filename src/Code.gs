/**
 * Máy chủ của hệ thống quản lý CLB (Google Apps Script).
 * Script này gắn với file Google Sheet chứa dữ liệu; mỗi tab là một bảng.
 */

var GIOI_HAN_GOP_Y_MOI_PHUT = 20;

/* ===================== Trang web ===================== */

function doGet(e) {
  if (e && e.parameter && e.parameter.tb) {
    // App trên điện thoại hỏi nội dung thông báo mới.
    return ContentService.createTextOutput(JSON.stringify(layThongBaoChoMay_(e.parameter.tb))).setMimeType(ContentService.MimeType.JSON);
  }
  // Một app duy nhất. Link cũ (?app=desk) vẫn mở app này.
  var trang = HtmlService.createTemplateFromFile('Eco');
  trang.googleClientId = String(layCaiDat_('GoogleClientId') || '');
  trang.thuocTinhChuDe = thuocTinhChuDe_(layCaiDat_('ChuDe'));
  return trang.evaluate()
    .setTitle('eco')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setFaviconUrl('https://ecotdn.github.io/icons/tab-eco.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ===================== Menu hậu kỳ trong Google Sheet ===================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ECO hậu kỳ')
    .addItem('Tải danh sách lên hệ thống', 'moHopThoaiTaiDanhSach')
    .addToUi();
}

function moHopThoaiTaiDanhSach() {
  khoiTaoCoSoDuLieu_();
  var t = HtmlService.createTemplateFromFile('HauKy');
  t.linkNguon = layCaiDat_('LinkSheetThanhVien') || '';
  t.coMatKhauMacDinh = !!layCaiDat_('MatKhauMacDinh');
  t.tinhTrang = tinhTrangCacDot_(new Date());
  // Vé dùng một lần: chỉ người mở được menu trong file Sheet mới tải danh sách lên được.
  t.ve = Utilities.getUuid();
  CacheService.getScriptCache().put('ve_tai_danh_sach', t.ve, 3600);
  var html = t.evaluate().setWidth(520).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Tải danh sách lên hệ thống');
}

/** Các lần tải trước (tab LanTai) và các giai đoạn đã mở (tab KyHoatDong, cho dữ liệu từ trước khi có LanTai). */
function cacLanTai_() {
  return docBang_('KyHoatDong').concat(docBang_('LanTai'));
}

/** Mỗi kiểu tải (Oday, đợt 1, đợt 2) đã làm trong nhiệm kỳ tương ứng chưa, để hộp thoại hiện cho người tải. */
function tinhTrangCacDot_(bayGio) {
  var lanTai = cacLanTai_();
  return [KIEU_TAI.ODAY, KIEU_TAI.DOT1, KIEU_TAI.DOT2].map(function (k) {
    var kt = kieuTaiThucTe_(k, bayGio, lanTai);
    return { kieu: k, nhiemKy: kt.nhiemKy, daLam: kt.doiThanhCapNhat };
  });
}

function kiemTraVeTai_(yeuCau) {
  var ve = CacheService.getScriptCache().get('ve_tai_danh_sach');
  if (!ve || String((yeuCau || {}).ve || '') !== ve) throw new Error('Hộp thoại đã cũ. Đóng lại rồi mở menu ECO hậu kỳ → Tải danh sách lên hệ thống lần nữa.');
}

/** Đọc sheet nguồn và tính mọi thứ sẽ thay đổi, chưa ghi gì. */
function chuanBiTai_(yeuCau, bayGio) {
  if ([KIEU_TAI.ODAY, KIEU_TAI.DOT1, KIEU_TAI.DOT2, KIEU_TAI.CAP_NHAT].indexOf(yeuCau.kieu) < 0) throw new Error('Kiểu tải không hợp lệ.');
  var nguon;
  try {
    nguon = SpreadsheetApp.openByUrl(String(yeuCau.link || '').trim());
  } catch (err) {
    throw new Error('Không mở được sheet nguồn. Kiểm tra lại link và quyền truy cập của tài khoản CLB.');
  }
  var tab = yeuCau.tenTab ? nguon.getSheetByName(yeuCau.tenTab) : nguon.getSheets()[0];
  if (!tab) throw new Error('Không thấy tab "' + yeuCau.tenTab + '" trong sheet nguồn.');
  var doc = docDanhSachThanhVien_(tab.getDataRange().getValues());
  if (doc.loi.length) throw new Error(doc.loi.join('\n'));

  var kt = kieuTaiThucTe_(yeuCau.kieu, bayGio, cacLanTai_());
  var cu = docBang_('ThanhVien');
  var ds = ganLoaiThanhVien_(doc.thanhVien, cu, kt.kieu, kt.dauNhiemKy);
  return {
    kt: kt, ds: ds, cu: cu,
    soSanh: soSanhDanhSach_(cu, ds),
    soTkMoi: dongBoTaiKhoan_(docBang_('TaiKhoan'), ds).moi.length,
    kyHienTai: layKyHienTai_()
  };
}

/** Xem trước một lần tải: kiểu tải thực sự, số người thêm, sửa, ẩn. Gọi từ hộp thoại hậu kỳ, không ghi gì. */
function xemTruocTaiDanhSach(yeuCau) {
  kiemTraVeTai_(yeuCau);
  var c = chuanBiTai_(yeuCau || {}, new Date());
  var ky = tinhKyMoi_(c.kyHienTai, c.kt.kieu, new Date());
  return {
    kieu: c.kt.kieu, kieuChon: yeuCau.kieu, doiThanhCapNhat: c.kt.doiThanhCapNhat, nhiemKy: c.kt.nhiemKy,
    giaiDoan: ky ? 'Bắt đầu nhiệm kỳ ' + ky.NhiemKy + ', giai đoạn ' + ky.HocKy + '. Điểm của giai đoạn mới bắt đầu từ 0.'
      : c.kyHienTai ? 'Giữ nguyên nhiệm kỳ ' + c.kyHienTai.NhiemKy + ', giai đoạn ' + c.kyHienTai.HocKy + '.' : 'Chưa có giai đoạn nào (giai đoạn 1 bắt đầu khi tải đợt 1).',
    tong: c.ds.length,
    them: c.soSanh.them, sua: c.soSanh.sua, an: c.soSanh.an, doiBan: c.soSanh.doiBan,
    boSung: c.ds.filter(function (t) { return t.LoaiThanhVien === LOAI_TV.BO_SUNG; }).length,
    soTkMoi: c.soTkMoi, canMatKhau: c.soTkMoi > 0 && !layCaiDat_('MatKhauMacDinh'),
    sinhNhat: c.kt.kieu !== KIEU_TAI.ODAY && !!(ky || c.kyHienTai)
  };
}

/**
 * Tải danh sách thành viên từ sheet nguồn vào hệ thống. Gọi từ hộp thoại hậu kỳ.
 * Không xoá dữ liệu cũ: người rời CLB được ẩn (giữ hồ sơ ở tab ThanhVienCu), điểm và task cũ giữ nguyên.
 * @param {{link:string, tenTab:string, kieu:string, matKhauMacDinh:string}} yeuCau
 */
function taiDanhSachThanhVien(yeuCau) {
  yeuCau = yeuCau || {};
  kiemTraVeTai_(yeuCau);
  var matKhau = String(yeuCau.matKhauMacDinh || '');
  if (matKhau) { var loiMk = kiemTraMatKhauMoi_(matKhau); if (loiMk) throw new Error('Mật khẩu chung: ' + loiMk); }

  var bayGio = new Date();
  var c, ky, cu;
  var khoa = layKhoa_();
  try {
    c = chuanBiTai_(yeuCau, bayGio); // đọc lại trong khoá: có thể ai đó vừa sửa
    if (c.soTkMoi && !matKhau && !layCaiDat_('MatKhauMacDinh')) {
      throw new Error('Có ' + c.soTkMoi + ' thành viên chưa có tài khoản app eco. Nhập mật khẩu chung của CLB (ít nhất 6 ký tự).');
    }
    var kyMoi = tinhKyMoi_(c.kyHienTai, c.kt.kieu, bayGio);

    // Người không còn trong danh sách mới: ẩn khỏi app, giữ hồ sơ đầy đủ ở tab ThanhVienCu để sau này còn tra cứu.
    cu = capNhatThanhVienCu_(c.cu, c.ds, docBang_('ThanhVienCu'), bayGio);
    ghiDeBang_('ThanhVienCu', cu.ds);
    ghiDeBang_('ThanhVien', xepThanhVienTheoBan_(c.ds));
    if (c.soSanh.doiBan.length) {
      themDong_('DoiBan', c.soSanh.doiBan.map(function (d) { return { ThoiGian: bayGio, HoVaTen: d.HoVaTen, BanCu: d.BanCu, BanMoi: d.BanMoi }; }));
    }
    if (kyMoi) {
      themDong_('KyHoatDong', [{ NhiemKy: kyMoi.NhiemKy, HocKy: kyMoi.HocKy, BatDau: bayGio, KieuTaiLen: c.kt.kieu }]);
      themDong_('LuuTruThanhVien', c.ds.map(function (tv) {
        return { NhiemKy: kyMoi.NhiemKy, HocKy: kyMoi.HocKy, HoVaTen: tv.HoVaTen, Ban: tv.Ban };
      }));
    }
    themDong_('LanTai', [{ ThoiGian: bayGio, NhiemKy: c.kt.nhiemKy || (c.kyHienTai ? String(c.kyHienTai.NhiemKy) : ''), KieuChon: yeuCau.kieu, Kieu: c.kt.kieu,
      SoThem: c.soSanh.them.length, SoSua: c.soSanh.sua.length, SoAn: c.soSanh.an.length, TongSo: c.ds.length }]);

    if (matKhau) datMatKhauMacDinh_(matKhau);
    var soTaoMoi = dongBoTaiKhoanThanhVien_(c.ds, bayGio);
    datCaiDat_('LinkSheetThanhVien', yeuCau.link);
    xoaBoNhoTam_();
    ky = kyMoi || c.kyHienTai;
  } finally {
    traKhoa_(khoa);
  }

  var dong = [];
  if (c.kt.doiThanhCapNhat) dong.push('"' + yeuCau.kieu + '" đã làm trong nhiệm kỳ ' + c.kt.nhiemKy + ' nên lần này được tính là Cập nhật.');
  dong.push('Đã tải ' + c.ds.length + ' thành viên (' + c.kt.kieu + '): thêm ' + c.soSanh.them.length + ', sửa thông tin ' + c.soSanh.sua.length + ', ẩn ' + c.soSanh.an.length + ' người đã rời.');
  dong.push(ky ? 'Hiện tại: nhiệm kỳ ' + ky.NhiemKy + ', giai đoạn ' + ky.HocKy + '.' : 'Chưa có giai đoạn nào; giai đoạn 1 bắt đầu khi tải "Sau tuyển đợt 1".');
  if (soTaoMoi) dong.push('Đã tạo ' + soTaoMoi + ' tài khoản mới (đăng nhập bằng mật khẩu chung hoặc Google).');
  if (c.soSanh.doiBan.length) dong.push(c.soSanh.doiBan.length + ' người đổi ban, đã ghi lại ngày đổi.');
  if (cu.soMoiRoi) dong.push('Hồ sơ người đã rời vẫn được giữ ở tab ThanhVienCu.');
  // Lịch sinh nhật: từ đợt 1 trở đi (Oday chưa đồng bộ). Lỗi ở đây không làm hỏng việc tải danh sách.
  if (c.kt.kieu !== KIEU_TAI.ODAY && ky) {
    try {
      var sn = dongBoSinhNhat_(c.ds, String(ky.NhiemKy));
      dong.push('Lịch "' + sn.ten + '": thêm ' + sn.soTao + ', bỏ ' + sn.soXoa + ', giữ ' + sn.soGiu + ' sinh nhật.' + (sn.conLai ? ' Còn ' + sn.conLai + ' người chưa kịp thêm, bấm Đồng bộ lại trong app (Cài đặt, Lịch sinh nhật).' : '') + (sn.thieuNgay.length ? ' ' + sn.thieuNgay.length + ' người chưa có ngày sinh hợp lệ.' : ''));
    } catch (e) {
      dong.push('Chưa đồng bộ được lịch sinh nhật: ' + e.message + ' Có thể tài khoản CLB chưa cấp quyền Google Calendar: mở Apps Script, chạy hàm khoiTaoCoSoDuLieu một lần rồi bấm Đồng bộ lại trong app.');
    }
  }
  return dong.join('\n');
}

/* ===================== Lịch sinh nhật (Google Calendar của tài khoản CLB) ===================== */

/** Lịch sinh nhật của nhiệm kỳ: mỗi nhiệm kỳ một lịch riêng, tạo khi cần. */
function layLichSinhNhat_(nhiemKy, taoNeuChuaCo) {
  var luu = {};
  try { luu = JSON.parse(layCaiDat_('LichSinhNhat') || '{}') || {}; } catch (e) { luu = {}; }
  var cal = null;
  if (luu[nhiemKy]) { try { cal = CalendarApp.getCalendarById(luu[nhiemKy]); } catch (e) { cal = null; } }
  if (!cal && taoNeuChuaCo) {
    cal = CalendarApp.createCalendar(tenLichSinhNhat_(nhiemKy), { timeZone: 'Asia/Ho_Chi_Minh', summary: 'Sinh nhật thành viên CLB, app eco tự cập nhật mỗi lần tải danh sách.' });
    luu[nhiemKy] = cal.getId();
    datCaiDat_('LichSinhNhat', JSON.stringify(luu));
  }
  return cal;
}

/** Làm cho lịch sinh nhật khớp danh sách: thêm người mới, sửa người đổi ngày sinh hoặc ban, bỏ người đã rời. */
function dongBoSinhNhat_(thanhVien, nhiemKy) {
  var cal = layLichSinhNhat_(nhiemKy, true);
  var tatCa = docBang_('SinhNhat');
  var kh = keHoachSinhNhat_(thanhVien, tatCa.filter(function (r) { return String(r.NhiemKy) === nhiemKy; }));
  var boMa = {}, moi = [], nam = new Date().getFullYear(), batDau = Date.now(), conLai = 0;
  try {
    kh.xoa.forEach(function (r) {
      try { var se = cal.getEventSeriesById(String(r.MaSuKien)); if (se) se.deleteEventSeries(); } catch (e) { /* đã bị xoá tay */ }
      boMa[String(r.MaSuKien)] = true;
    });
    for (var i = 0; i < kh.tao.length; i++) {
      // Giữ thời gian chạy trong giới hạn của Apps Script; phần còn lại làm ở lần đồng bộ sau.
      if (Date.now() - batDau > 240000) { conLai = kh.tao.length - i; break; }
      var x = kh.tao[i], ngay = x.thang === 2 && x.ngay === 29 ? 28 : x.ngay;
      var se2 = cal.createAllDayEventSeries(x.TieuDe, new Date(nam, x.thang - 1, ngay), CalendarApp.newRecurrence().addYearlyRule(), { description: x.moTa });
      moi.push({ HoVaTen: x.HoVaTen, NgaySinh: x.NgaySinh, TieuDe: x.TieuDe, MaSuKien: se2.getId(), NhiemKy: nhiemKy });
      Utilities.sleep(80);
    }
  } finally {
    var thay = {};
    moi.forEach(function (m) { thay[String(m.HoVaTen).toLowerCase()] = true; });
    ghiDeBang_('SinhNhat', tatCa.filter(function (r) {
      return !boMa[String(r.MaSuKien)] && !(String(r.NhiemKy) === nhiemKy && thay[String(r.HoVaTen).toLowerCase()]);
    }).concat(moi));
  }
  return { ten: cal.getName(), id: cal.getId(), soTao: moi.length, soXoa: kh.xoa.length, soGiu: kh.soGiu, conLai: conLai, thieuNgay: kh.thieuNgay };
}

/** Giữ tài khoản khớp với danh sách: thêm người mới, cập nhật BOD theo cột Ban, bỏ người đã rời CLB. Trả về số tài khoản mới. */
function dongBoTaiKhoanThanhVien_(thanhVien, bayGio) {
  bangDuLieu_('TaiKhoan'); // thêm cột còn thiếu nếu sheet còn bản cũ
  var kq = dongBoTaiKhoan_(docBang_('TaiKhoan'), thanhVien);
  ghiDeBang_('TaiKhoan', kq.ds.concat(kq.moi.map(function (m) {
    return { Email: m.Email, HoVaTen: m.HoVaTen, VaiTro: m.VaiTro, MatKhau: '', Muoi: '', NgayTao: bayGio };
  })));
  return kq.moi.length;
}

/** Mật khẩu mặc định chung của CLB: tài khoản chưa đổi mật khẩu thì đăng nhập bằng mật khẩu này. Chỉ lưu bản băm. */
function datMatKhauMacDinh_(matKhau) {
  var muoi = Utilities.getUuid();
  datCaiDat_('MuoiMacDinh', muoi);
  datCaiDat_('MatKhauMacDinh', bamMatKhau_(matKhau, muoi));
}

function bamMatKhau_(matKhau, muoi) {
  var bam = muoi + ':' + matKhau;
  for (var i = 0; i < 300; i++) {
    var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bam, Utilities.Charset.UTF_8);
    bam = Utilities.base64Encode(b);
  }
  return bam;
}

/* ===================== Xếp hạng điểm và góp ý ===================== */

/** Bảng xếp hạng: ai mở app cũng xem được, không cần đăng nhập. Chỉ có họ tên, lớp, ban và điểm. */
function layDuLieuBoard() {
  var cache = CacheService.getScriptCache();
  var daLuu = cache.get('xephang');
  if (daLuu) return JSON.parse(daLuu);

  var ky = layKyHienTai_();
  var thanhVien = docThanhVien_();
  var lichSu = ky ? docBang_('LichSuDiem') : [];
  var luuTru = ky && Number(ky.HocKy) === 2 ? docBang_('LuuTruThanhVien') : [];
  var duLieu = {
    ky: ky ? { nhiemKy: String(ky.NhiemKy), hocKy: Number(ky.HocKy) } : null,
    thanhVien: tongHopBangDiem_(thanhVien.filter(khongPhaiBod_), lichSu, ky, luuTru) // BOD không tham gia cộng điểm
  };
  cache.put('xephang', JSON.stringify(duLieu), 60);
  return duLieu;
}

/** Lịch sử cộng điểm: thành viên xem của mình, BOD xem của mọi người. */
function layLichSuDiem(phien, ten, hocKy) {
  var tk = canDangNhap_(phien);
  if (!coQuyen_(String(tk.VaiTro), 'lichsudiem') && String(ten).toLowerCase() !== String(tk.HoVaTen).toLowerCase()) {
    throw new Error('Bạn chỉ xem được lịch sử điểm của mình.');
  }
  var ky = layKyHienTai_();
  if (!ky) return [];
  var hk = Number(hocKy) === 1 ? 1 : Number(ky.HocKy);
  var laThanhVien = docBang_('ThanhVien').some(function (tv) {
    return String(tv.HoVaTen).toLowerCase() === String(ten).toLowerCase();
  });
  if (!laThanhVien) return [];
  return lichSuCongKhai_(docBang_('LichSuDiem'), ten, ky.NhiemKy, hk);
}

/** Góp ý ẩn danh: phải đăng nhập (chặn người ngoài gửi bừa) nhưng không lưu tên người gửi. */
function guiGopY(phien, noiDung) {
  canDangNhap_(phien, 'guigopy');
  var loi = kiemTraGopY_(noiDung);
  if (loi) throw new Error(loi);
  var cache = CacheService.getScriptCache();
  var dem = Number(cache.get('demGopY') || 0);
  if (dem >= GIOI_HAN_GOP_Y_MOI_PHUT) throw new Error('Đang có nhiều góp ý gửi cùng lúc, bạn thử lại sau một phút nhé.');
  cache.put('demGopY', String(dem + 1), 60);
  themDong_('GopY', [{ ThoiGian: new Date(), NoiDung: String(noiDung).trim(), DaDoc: false }]);
  try { thongBaoGopYMoi_(String(noiDung).trim()); } catch (e) { /* không gửi được mail báo thì góp ý vẫn được lưu */ }
  return true;
}

/* ===================== Cơ sở dữ liệu ===================== */

/** Chọn hàm này rồi bấm Chạy trong Apps Script để cấp quyền lần đầu (hoặc khi bản mới cần thêm quyền). */
function khoiTaoCoSoDuLieu() {
  khoiTaoCoSoDuLieu_();
}

/** Tạo các tab còn thiếu, thêm cột còn thiếu, và dữ liệu mặc định. Chạy lại nhiều lần không sao. */
function khoiTaoCoSoDuLieu_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  if (!docBang_('LoaiHoatDong').length) {
    themDong_('LoaiHoatDong', ['Staff', 'Log', 'Tham gia hoạt động'].map(function (t) { return { TenLoai: t, Diem: 0 }; }));
  }
  var macDinh = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (macDinh && macDinh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(macDinh);
}

/** Bản cập nhật thêm tab hoặc cột mới thì tự thêm vào sheet ở lần dùng đầu tiên, không cần ai mở menu. */
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ten);
  if (!sh && BANG[ten]) { khoiTaoCoSoDuLieu_(); sh = ss.getSheetByName(ten); } // tab mới thêm ở bản cập nhật
  if (!sh) throw new Error('Thiếu tab ' + ten + '. Mở menu ECO hậu kỳ để khởi tạo.');
  delete BO_NHO_BANG_[ten];
  BANG_DA_GHI_[ten] = true;
  boNhoTamBang_(ten);
  return sh;
}

/**
 * Đọc cả bảng thành danh sách đối tượng.
 * Trong một lần chạy, mỗi bảng chỉ đọc từ sheet một lần. Vài bảng ít đổi (BANG_NHO_TAM) còn được nhớ tạm
 * giữa các lần chạy, để mở app nhanh hơn; ghi vào bảng nào thì bản nhớ tạm của bảng đó bị bỏ ngay.
 */
var BANG_NHO_TAM = ['CaiDat', 'TaiKhoan', 'ThanhVien', 'LoaiHoatDong'];
var GIAY_NHO_TAM = 600;
var BO_NHO_BANG_ = {};
var BANG_DA_GHI_ = {};
function docBang_(ten) {
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
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ten);
      chuoi = maHoaBang_(!sh || sh.getLastRow() < 2 ? [] : dongThanhDoiTuong_(sh.getDataRange().getValues()));
      // Ghi kèm phiên bản đã thấy trước khi đọc: nếu có người ghi chen vào giữa thì bản này tự hết hiệu lực.
      if (nhoTam) { try { bo.put('bang_' + ten, phienBan + '|' + chuoi, GIAY_NHO_TAM); } catch (e) { /* bảng lớn quá thì thôi không nhớ tạm */ } }
    }
    BO_NHO_BANG_[ten] = chuoi;
  }
  return giaiMaBang_(chuoi);
}

/** Bỏ bản nhớ tạm của một bảng (sau khi ghi, hoặc khi có người sửa tay trên sheet). */
function boNhoTamBang_(ten) {
  if (BANG_NHO_TAM.indexOf(ten) < 0) return;
  try {
    var bo = CacheService.getScriptCache();
    bo.put('phienban_' + ten, String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600);
    bo.remove('bang_' + ten);
  } catch (e) { /* bản nhớ tạm tự hết hạn sau GIAY_NHO_TAM giây */ }
}

/** Có người sửa tay trên sheet: bỏ bản nhớ tạm của tab đó để app thấy ngay. */
function onEdit(e) {
  try { boNhoTamBang_(e.range.getSheet().getName()); } catch (x) { /* bỏ qua */ }
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

/** Danh sách thành viên theo thứ tự ban chuẩn, dùng cho mọi chỗ hiện danh sách. */
function docThanhVien_() {
  return xepThanhVienTheoBan_(docBang_('ThanhVien'));
}

/**
 * Lúc bắt đầu nhiệm kỳ hiện tại, tính bằng ms: lần tải "Sau tuyển đợt 1" ĐẦU TIÊN của nhiệm kỳ này
 * (lỡ tải đợt 1 lại lần nữa trong cùng nhiệm kỳ thì không ẩn mất dữ liệu đã có). 0 = chưa có nhiệm kỳ nào.
 */
function batDauNhiemKy_() {
  return batDauNhiemKyTu_(docBang_('KyHoatDong'));
}

/** Đọc một tab, bỏ các dòng của nhiệm kỳ cũ (vẫn còn trong sheet, chỉ không hiện). */
function docBangNhiemKy_(ten, cotThoiGian) {
  return locNhiemKy_(docBang_(ten), function (d) { return d[cotThoiGian]; }, batDauNhiemKy_());
}

function layKyHienTai_() {
  var ds = docBang_('KyHoatDong');
  return ds.length ? ds[ds.length - 1] : null;
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

function xoaBoNhoTam_() {
  CacheService.getScriptCache().remove('xephang');
}

function include(ten) {
  return HtmlService.createHtmlOutputFromFile(ten).getContent();
}
