/**
 * Tổng kết nhiệm kỳ: KPI log, KPI task, xét chứng nhận (bù trừ theo bảng xếp hạng bù trừ) và danh sách khen thưởng
 * top từng giai đoạn. Mọi phần trăm lấy từ quy tắc của nhiệm kỳ (Cài đặt, Quy tắc). Chỉ BOD xem.
 *
 * Kết quả mỗi nhiệm kỳ được chép vào bảng KetQuaNhiemKy (mỗi đêm và khi BOD bấm Lưu kết quả), để nhiều năm sau
 * vẫn xem lại được dù dữ liệu chi tiết đã chuyển sang file lưu trữ.
 */

/** Tính toàn bộ tổng kết của nhiệm kỳ đang chạy. */
function tinhTongKet_() {
  var qt = quyTac_();
  var board = duLieuBoard_();
  var n = board.ky ? board.ky.giaiDoan : 0;
  var task = docTask_(), mocGd = mocGiaiDoanNay_(), suKienLog = docSuKienLog_();
  var diem = {};
  board.thanhVien.forEach(function (p) { diem[p.ten.toLowerCase()] = p; });
  var ds = docThanhVien_().filter(khongPhaiBod_).map(function (tv) {
    var k = kpiCuaNguoi_(tv, task, mocGd, suKienLog);
    var p = diem[String(tv.HoVaTen).toLowerCase()] || { gd: [] };
    return { ten: String(tv.HoVaTen), maTV: String(tv.MaTV || ''), ban: String(tv.Ban || ''), gdVao: k.gdVao, kpi: k, gd: p.gd || [], caKy: p.caKy };
  });
  var cert = xetCertificate_(ds, qt);
  var choDanhGia = 0;
  ds.forEach(function (p, i) {
    var c = cert[i];
    c.maTV = p.maTV;
    c.gd = p.gd;
    c.choDanhGia = p.kpi.task ? p.kpi.task.cho : 0;
    c.khoi = p.kpi.khoi || null;
    c.chiTietLog = p.kpi.log.thamGia + '/' + String(p.kpi.log.giaoCuoi).replace('.', ',');
    choDanhGia += c.choDanhGia;
  });
  return {
    ky: board.ky,
    quyTac: { tiLeTop: qt.tiLeTop, datTask: qt.datTask, datLog: qt.datLog, mucBuTru: qt.mucBuTru, tiLeBuTru: qt.tiLeBuTru, soGiaiDoan: qt.soGiaiDoan },
    cert: cert,
    choDanhGia: choDanhGia,
    suKienChuaChot: suKienLog.filter(function (s) { return !String(s.TrangThai); }).map(function (s) { return String(s.TenSuKien); }),
    khenThuong: danhSachKhenThuong_(board.thanhVien, n)
  };
}

function layTongKet(phien) {
  canDangNhap_(phien, 'baocao');
  var kq = tinhTongKet_();
  kq.nhiemKyCu = cacNhiemKyDaLuu_();
  return kq;
}

/* ===================== Kết quả các nhiệm kỳ (lưu lâu dài) ===================== */

/**
 * Chép kết quả nhiệm kỳ đang chạy vào KetQuaNhiemKy (ghi đè các dòng cũ của nhiệm kỳ này).
 * Chạy mỗi đêm, nên khi sang nhiệm kỳ mới, bản cuối cùng của nhiệm kỳ cũ vẫn còn.
 */
function luuKetQuaNhiemKy_() {
  var ky = layKyHienTai_();
  if (!ky) return 0;
  var tk = tinhTongKet_(), nk = String(ky.NhiemKy), bayGio = new Date();
  var diem = {};
  duLieuBoard_().thanhVien.forEach(function (p) { diem[p.ten.toLowerCase()] = p; });
  var moi = tk.cert.map(function (c) {
    var p = diem[String(c.ten).toLowerCase()] || {};
    var top = (p.topGd || []).map(function (t, i) { return t ? 'GĐ' + (i + 1) : ''; }).filter(String);
    if (p.topCaKy) top.push('Cả nhiệm kỳ');
    return {
      NhiemKy: nk, MaTV: c.maTV, HoVaTen: c.ten, Ban: c.ban, LoaiThanhVien: c.boSung ? LOAI_TV.BO_SUNG : LOAI_TV.CHINH_THUC,
      DiemTheoGiaiDoan: (c.gd || []).map(function (x) { return x === null ? '-' : x; }).join(' | '),
      DiemCaKy: p.caKy === null || p.caKy === undefined ? '' : p.caKy, Top: top.join(', '),
      KpiTask: c.task === null ? '' : c.task, KpiLog: c.log === null ? '' : c.log, ChungNhan: c.ketQua, ThoiGian: bayGio
    };
  });
  voiKhoa_(function () {
    var giu = docBang_('KetQuaNhiemKy').filter(function (d) { return String(d.NhiemKy) !== nk; });
    ghiDeBang_('KetQuaNhiemKy', giu.concat(moi));
  });
  return moi.length;
}

/** BOD bấm Lưu kết quả ở trang Tổng kết (thường không cần: app tự lưu mỗi đêm). */
function luuKetQuaNhiemKy(phien) {
  canDangNhap_(phien, 'baocao');
  return luuKetQuaNhiemKy_();
}

/** Các nhiệm kỳ đã có kết quả lưu, mới nhất trước. */
function cacNhiemKyDaLuu_() {
  var ds = [];
  docBang_('KetQuaNhiemKy').forEach(function (d) { var nk = String(d.NhiemKy); if (nk && ds.indexOf(nk) < 0) ds.push(nk); });
  return ds.sort().reverse();
}

/** Kết quả đã lưu của một nhiệm kỳ (xem lại nhiệm kỳ cũ). */
function layKetQuaNhiemKy(phien, nhiemKy) {
  canDangNhap_(phien, 'baocao');
  return docBang_('KetQuaNhiemKy').filter(function (d) { return String(d.NhiemKy) === String(nhiemKy); }).map(function (d) {
    return { maTV: String(d.MaTV || ''), ten: String(d.HoVaTen), ban: String(d.Ban || ''), loai: String(d.LoaiThanhVien || ''), diemGd: String(d.DiemTheoGiaiDoan || ''),
      diemCaKy: d.DiemCaKy === '' ? null : Number(d.DiemCaKy), top: String(d.Top || ''), task: d.KpiTask === '' ? null : Number(d.KpiTask),
      log: d.KpiLog === '' ? null : Number(d.KpiLog), chungNhan: String(d.ChungNhan || '') };
  }).sort(function (a, b) { return soSanhBan_(a.ban, b.ban) || (a.ten < b.ten ? -1 : 1); });
}

/* ===================== Xuất Excel ===================== */

/** Xuất tổng kết ra file Excel: tab Chứng nhận và tab Khen thưởng. Trả về { ten, base64 }. */
function xuatExcelTongKet(phien) {
  canDangNhap_(phien, 'baocao');
  var tk = tinhTongKet_();
  var n = tk.ky ? tk.ky.giaiDoan : 0;
  var ten = 'Tổng kết ' + (tk.ky ? 'nhiệm kỳ ' + tk.ky.nhiemKy + ' (đến giai đoạn ' + n + ')' : '') + ' ' + hienNgay_(Utilities.formatDate(new Date(), muiGio_(), 'yyyy-MM-dd'));
  var ss = SpreadsheetApp.create(ten);
  try {
    var ghi = function (sh, dau, dong) {
      sh.getRange(1, 1, 1, dau.length).setValues([dau]).setFontWeight('bold').setBackground('#274e13').setFontColor('#ffffff');
      if (dong.length) sh.getRange(2, 1, dong.length, dau.length).setValues(dong);
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, dau.length);
    };
    var pt = function (x) { return x === null || x === undefined ? 'Không có việc' : x + '%'; };
    ghi(ss.getSheets()[0].setName('Chứng nhận'), ['Mã thành viên', 'Họ và tên', 'Ban', 'Vào từ giai đoạn', 'KPI log', 'KPI task', 'Xét bù trừ', 'Hạng bù trừ', 'Điểm bù trừ', 'Kết quả'],
      tk.cert.map(function (c) {
        return [c.maTV, c.ten, c.ban, c.gdVao, pt(c.log), pt(c.task), c.buTru ? 'Có' : '', c.hangBuTru ? c.hangBuTru + '/' + c.soBuTru : '', c.buTru ? c.diemBuTru : '', c.ketQua];
      }));
    var kt = ss.insertSheet('Khen thưởng'), dong = [], top = tk.quyTac.tiLeTop;
    var them = function (nhan, ds) { ds.forEach(function (p) { dong.push([nhan, p.ten, p.ban, p.diem]); }); };
    tk.khenThuong.gd.forEach(function (g) { them('Top ' + top + '% giai đoạn ' + g.giaiDoan, g.ds); });
    them('Top ' + top + '% cả nhiệm kỳ', tk.khenThuong.caKy);
    them('Lọt top mọi giai đoạn', tk.khenThuong.moiGiaiDoan);
    ghi(kt, ['Danh sách', 'Họ và tên', 'Ban', 'Điểm'], dong);
    SpreadsheetApp.flush();
    var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error('Google không xuất được file (mã ' + res.getResponseCode() + ').');
    return { ten: ten + '.xlsx', base64: Utilities.base64Encode(res.getContent()) };
  } finally {
    DriveApp.getFileById(ss.getId()).setTrashed(true);
  }
}
