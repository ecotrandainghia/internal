/**
 * KPI log trong app eco (quy chế 2026-2027, mục II.1). BOD tạo sự kiện log với số buổi dự kiến và số buổi giao,
 * thêm từng buổi (hoặc nhập từ file đăng ký log), điểm danh, đánh dấu buổi huỷ. Khi sự kiện kết thúc, BOD chốt:
 * số buổi được giao cuối tính theo số buổi thực diễn ra, và ai làm vượt được cộng điểm log vượt.
 */

/** Các sự kiện log của nhiệm kỳ này, mỗi sự kiện kèm mảng buoi. */
function docSuKienLog_() {
  var buoi = docBangNhiemKy_('BuoiLog', 'ThoiGian');
  return docBangNhiemKy_('SuKienLog', 'ThoiGian').map(function (s) {
    var ma = new Date(s.ThoiGian).getTime();
    s.buoi = buoi.filter(function (b) { return Number(b.SuKien) === ma; }).map(function (b) {
      b.ThoiGian = new Date(b.ThoiGian).getTime();
      b.Ngay = ngayChuoi_(b.Ngay);
      return b;
    });
    return s;
  }).sort(function (a, b) { return new Date(b.ThoiGian).getTime() - new Date(a.ThoiGian).getTime(); });
}

/** Trang Làm log, phần sự kiện: các sự kiện, buổi, số buổi giao và kết quả từng người. */
function layLog(phien) {
  canDangNhap_(phien, 'log');
  var tv = docThanhVien_().filter(khongPhaiBod_);
  var loai = docBang_('LoaiHoatDong');
  return {
    thanhVien: tv.map(function (t) { return { ten: String(t.HoVaTen), ban: String(t.Ban || ''), lop: String(t.Lop || '') }; }),
    dsBan: tv.reduce(function (a, t) { var b = String(t.Ban || '').trim().toUpperCase(); if (b && a.indexOf(b) < 0) a.push(b); return a; }, []),
    coLoai: { 90: !!loaiDungCho_(loai, DUNG_CHO.LOG_90), 180: !!loaiDungCho_(loai, DUNG_CHO.LOG_180) },
    file: docBangNhiemKy_('FileLog', 'ThoiGian').map(function (f) { return { thoiGian: new Date(f.ThoiGian).getTime(), ten: String(f.TenFile), link: String(f.DuongDan) }; })
      .sort(function (a, b) { return b.thoiGian - a.thoiGian; }).slice(0, 20),
    suKien: docSuKienLog_().map(function (s) {
      var ketQua = [];
      tv.forEach(function (t) {
        var k = kpiLogSuKien_(s, s.buoi, t);
        if (k.giao) ketQua.push({ ten: String(t.HoVaTen), ban: String(t.Ban || ''), giao: k.giao, giaoCuoi: hienSoBuoi_(k.giaoCuoi), thamGia: k.thamGia, vuot: k.vuot.length });
      });
      return {
        ma: new Date(s.ThoiGian).getTime(), ten: String(s.TenSuKien), duKien: Number(s.SoBuoiDuKien) || 0, giaoMacDinh: Number(s.GiaoMacDinh) || 0,
        giaoRieng: docGiaoRieng_(s.GiaoRieng), link: String(s.LinkDangKy || ''), nguoiTao: String(s.NguoiTao || ''),
        trangThai: String(s.TrangThai || ''), chotLuc: s.ChotLuc ? new Date(s.ChotLuc).getTime() : 0, nguoiChot: String(s.NguoiChot || ''),
        thucDien: soBuoiThucDien_(s, s.buoi),
        buoi: buoiHieuLuc_(s.buoi).map(function (b) {
          return { ma: b.ThoiGian, ten: String(b.TenBuoi), ngay: b.Ngay, thoiLuong: Number(b.ThoiLuong) || 90, trangThai: String(b.TrangThai || TRANG_THAI_BUOI.CHUA), dangKy: tachTen_(b.DangKy), coMat: tachTen_(b.CoMat) };
        }),
        ketQua: ketQua
      };
    })
  };
}

/** Ghi các cột của một dòng tìm theo ThoiGian (ms). Gọi trong voiKhoa_. Trả về dòng cũ (đối tượng). */
function suaDongLog_(ten, ms, ghi) {
  var sh = bangDuLieu_(ten);
  var v = sh.getDataRange().getValues(), td = v[0];
  var dong = timDongTheoThoiGian_(v, 'ThoiGian', ms);
  if (!dong) throw new Error(ten === 'SuKienLog' ? 'Không tìm thấy sự kiện này.' : 'Không tìm thấy buổi này.');
  var cu = {};
  td.forEach(function (c, i) { cu[c] = v[dong - 1][i]; });
  Object.keys(ghi).forEach(function (c) { sh.getRange(dong, td.indexOf(c) + 1).setValue(ghi[c]); });
  return cu;
}

function canSuKienMo_(ms) {
  var s = docBang_('SuKienLog').filter(function (x) { return new Date(x.ThoiGian).getTime() === Number(ms); })[0];
  if (!s) throw new Error('Không tìm thấy sự kiện này.');
  if (String(s.TrangThai) === SU_KIEN_HUY) throw new Error('Sự kiện này đã huỷ.');
  if (String(s.TrangThai) === SU_KIEN_CHOT) throw new Error('Sự kiện đã chốt. Bấm Mở lại để sửa, sửa xong chốt lại.');
  return s;
}

/** Tạo hoặc sửa sự kiện log (yc.ma để sửa). */
function luuSuKienLog(phien, yc) {
  var tk = canDangNhap_(phien, 'log');
  var k = chuanHoaSuKienLog_(yc);
  if (k.loi) throw new Error(k.loi);
  var link = String((yc && yc.link) || '').trim();
  if (link && !linkHopLe_(link)) throw new Error('Link file đăng ký phải bắt đầu bằng https://');
  k.dong.LinkDangKy = link;
  return voiKhoa_(function () {
    if (yc.ma) { canSuKienMo_(yc.ma); suaDongLog_('SuKienLog', yc.ma, k.dong); return Number(yc.ma); }
    var bayGio = new Date();
    themDong_('SuKienLog', [Object.assign({ ThoiGian: bayGio, NguoiTao: String(tk.HoVaTen) }, k.dong)]);
    return bayGio.getTime();
  });
}

/** Huỷ sự kiện (tạo nhầm): không tính KPI nữa, gỡ điểm log vượt nếu đã chốt. Dữ liệu vẫn giữ trong sheet. */
function huySuKienLog(phien, ms) {
  canDangNhap_(phien, 'log');
  return voiKhoa_(function () {
    var cu = suaDongLog_('SuKienLog', ms, { TrangThai: SU_KIEN_HUY });
    if (String(cu.TrangThai) === SU_KIEN_CHOT) goDiemLog_(cu.ChotLuc);
    xoaBoNhoTam_();
    return true;
  });
}

/** Tạo hoặc sửa một buổi (yc.ma để sửa): tên, ngày, thời lượng, trạng thái, người đăng ký, người có mặt. */
function luuBuoiLog(phien, yc) {
  canDangNhap_(phien, 'log');
  yc = yc || {};
  var k = chuanHoaBuoiLog_(yc);
  if (k.loi) throw new Error(k.loi);
  var tv = docBang_('ThanhVien');
  var tenDung = {};
  tv.forEach(function (t) { tenDung[String(t.HoVaTen).trim().toLowerCase()] = String(t.HoVaTen).trim(); });
  ['DangKy', 'CoMat'].forEach(function (c) {
    k.dong[c] = tachTen_(k.dong[c]).map(function (n) { return tenDung[n.toLowerCase()] || n; }).join(', ');
  });
  return voiKhoa_(function () {
    canSuKienMo_(yc.suKien);
    if (yc.ma) {
      var cu = docBang_('BuoiLog').filter(function (b) { return new Date(b.ThoiGian).getTime() === Number(yc.ma); })[0];
      if (!cu || Number(cu.SuKien) !== Number(yc.suKien)) throw new Error('Không tìm thấy buổi này.');
      suaDongLog_('BuoiLog', yc.ma, k.dong);
      return Number(yc.ma);
    }
    var bayGio = new Date();
    themDong_('BuoiLog', [Object.assign({ ThoiGian: bayGio, SuKien: Number(yc.suKien) }, k.dong)]);
    return bayGio.getTime();
  });
}

/** Xoá buổi tạo nhầm (chỉ ẩn, dòng vẫn còn trong sheet). */
function xoaBuoiLog(phien, suKien, ma) {
  canDangNhap_(phien, 'log');
  return voiKhoa_(function () {
    canSuKienMo_(suKien);
    suaDongLog_('BuoiLog', ma, { TrangThai: TRANG_THAI_BUOI.XOA });
    return true;
  });
}

/**
 * Nhập người đăng ký từ file đăng ký log (file tạo ở phần Tạo file đăng ký, hoặc file cùng mẫu).
 * Buổi trùng tên thì ghi đè danh sách đăng ký; buổi chưa có thì tạo mới (90 phút, chưa diễn ra).
 */
function nhapDangKyLog(phien, suKien, link) {
  canDangNhap_(phien, 'log');
  var ma = maTuLink_(link);
  if (!ma) throw new Error('Link file đăng ký không hợp lệ.');
  var ss;
  try { ss = SpreadsheetApp.openById(ma); } catch (e) { throw new Error('Không mở được file đăng ký. Kiểm tra link và quyền truy cập của tài khoản CLB.'); }
  var tab = timTab_(ss, 'Đăng ký log');
  var ds = docDangKyLog_((tab || ss.getSheets()[0]).getDataRange().getValues(), !!tab);
  if (!ds.length) throw new Error('Không thấy cột buổi nào trong file. File cần có dòng tiêu đề với cột Họ và tên và một cột cho mỗi buổi.');
  var tenDung = {};
  docBang_('ThanhVien').forEach(function (t) { tenDung[String(t.HoVaTen).trim().toLowerCase()] = String(t.HoVaTen).trim(); });
  var khongKhop = [];
  return voiKhoa_(function () {
    canSuKienMo_(suKien);
    var co = buoiHieuLuc_(docBang_('BuoiLog').filter(function (b) { return Number(b.SuKien) === Number(suKien); }));
    var moi = [], soSua = 0, bayGio = Date.now();
    ds.forEach(function (b, i) {
      var dangKy = b.dangKy.map(function (n) {
        var dung = tenDung[n.toLowerCase()];
        if (!dung && khongKhop.indexOf(n) < 0) khongKhop.push(n);
        return dung || n;
      }).join(', ');
      var trung = co.filter(function (x) { return String(x.TenBuoi).trim().toLowerCase() === b.ten.toLowerCase(); })[0];
      if (trung) { suaDongLog_('BuoiLog', new Date(trung.ThoiGian).getTime(), { DangKy: dangKy }); soSua++; }
      else moi.push({ ThoiGian: new Date(bayGio + i), SuKien: Number(suKien), TenBuoi: b.ten.slice(0, 100), Ngay: '', ThoiLuong: 90, TrangThai: TRANG_THAI_BUOI.CHUA, DangKy: dangKy, CoMat: '' });
    });
    themDong_('BuoiLog', moi);
    suaDongLog_('SuKienLog', suKien, { LinkDangKy: String(link).trim() });
    return { soMoi: moi.length, soSua: soSua, khongKhop: khongKhop };
  });
}

/** Gỡ các dòng điểm log vượt của một lần chốt (ThoiGian = lúc chốt). Gọi trong voiKhoa_. */
function goDiemLog_(chotLuc) {
  if (!chotLuc) return 0;
  var ms = new Date(chotLuc).getTime();
  var ls = bangDuLieu_('LichSuDiem');
  var w = ls.getDataRange().getValues();
  var lT = w[0].indexOf('ThoiGian'), lN = w[0].indexOf('NguoiCong'), xoa = 0;
  for (var i = w.length - 1; i >= 1; i--) {
    if (new Date(w[i][lT]).getTime() === ms && String(w[i][lN]).indexOf('Log: ') === 0) { ls.deleteRow(i + 1); xoa++; }
  }
  return xoa;
}

/**
 * Chốt sự kiện: từ giờ số buổi được giao cuối tính theo số buổi thực diễn ra; cộng điểm log vượt.
 * Không chốt được khi còn buổi chưa diễn ra (đánh dấu đã diễn ra hoặc huỷ trước).
 */
function chotSuKienLog(phien, ms) {
  var tk = canDangNhap_(phien, 'log');
  return voiKhoa_(function () {
    var s = docSuKienLog_().filter(function (x) { return new Date(x.ThoiGian).getTime() === Number(ms); })[0];
    if (!s) throw new Error('Không tìm thấy sự kiện này.');
    if (String(s.TrangThai) === SU_KIEN_HUY) throw new Error('Sự kiện này đã huỷ.');
    if (String(s.TrangThai) === SU_KIEN_CHOT) throw new Error('Sự kiện đã chốt rồi.');
    var chua = buoiHieuLuc_(s.buoi).filter(function (b) { return b.TrangThai === TRANG_THAI_BUOI.CHUA; });
    if (chua.length) throw new Error('Còn ' + chua.length + ' buổi chưa diễn ra (' + chua.map(function (b) { return b.TenBuoi; }).join(', ') + '). Điểm danh, đánh dấu huỷ hoặc xoá các buổi đó trước khi chốt.');
    var bayGio = new Date();
    s.TrangThai = SU_KIEN_CHOT;
    var kq = dongDiemLogVuot_(s, s.buoi, docBang_('ThanhVien').filter(khongPhaiBod_), docBang_('LoaiHoatDong'), layKyHienTai_(), 'Log: ' + String(tk.HoVaTen), bayGio);
    if (kq.loi) throw new Error(kq.loi);
    themDong_('LichSuDiem', kq.dong);
    suaDongLog_('SuKienLog', ms, { TrangThai: SU_KIEN_CHOT, ChotLuc: bayGio, NguoiChot: String(tk.HoVaTen) });
    xoaBoNhoTam_();
    var diem = 0, nguoi = {};
    kq.dong.forEach(function (d) { diem += Number(d.Diem) || 0; nguoi[d.HoVaTen] = 1; });
    return { soBuoi: kq.dong.length, soNguoi: Object.keys(nguoi).length, diem: diem };
  });
}

/** Mở lại sự kiện đã chốt để sửa: gỡ điểm log vượt của lần chốt đó. Chốt lại sẽ cộng lại. */
function moLaiSuKienLog(phien, ms) {
  canDangNhap_(phien, 'log');
  return voiKhoa_(function () {
    var cu = suaDongLog_('SuKienLog', ms, { TrangThai: '', ChotLuc: '', NguoiChot: '' });
    if (String(cu.TrangThai) !== SU_KIEN_CHOT) { suaDongLog_('SuKienLog', ms, { TrangThai: cu.TrangThai, ChotLuc: cu.ChotLuc, NguoiChot: cu.NguoiChot }); throw new Error('Sự kiện này chưa chốt.'); }
    var xoa = goDiemLog_(cu.ChotLuc);
    xoaBoNhoTam_();
    return xoa;
  });
}
