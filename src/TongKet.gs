/**
 * Tổng kết (quy chế 2026-2027, mục II.5 và III.4–III.5): kết quả KPI log, KPI task, xét certificate
 * (bù trừ bằng top 40% bảng xếp hạng bù trừ) và danh sách khen thưởng top 15% từng giai đoạn. Chỉ BOD xem.
 */

/** Tính toàn bộ tổng kết của nhiệm kỳ đang chạy. */
function tinhTongKet_() {
  var ky = layKyHienTai_();
  var board = layDuLieuBoard();
  var gd2 = !!ky && Number(ky.HocKy) === 2;
  var task = docTask_(), quen = docHrQuen_(), moc2 = batDauGiaiDoan2_(), supRes = tenSupRes_(), suKienLog = docSuKienLog_();
  var diem = {};
  board.thanhVien.forEach(function (p) { diem[p.ten.toLowerCase()] = p; });
  var ds = docThanhVien_().filter(khongPhaiBod_).map(function (tv) {
    var k = kpiCuaNguoi_(tv, task, quen, moc2, supRes, suKienLog);
    var p = diem[String(tv.HoVaTen).toLowerCase()] || { diem: 0, diemCaKy: null };
    return {
      ten: String(tv.HoVaTen), ban: String(tv.Ban || ''), boSung: k.boSung, kpi: k,
      diemCaKy: gd2 ? (p.diemCaKy === null ? p.diem : p.diemCaKy) : p.diem,
      diemGd2: gd2 ? p.diem : 0
    };
  });
  var cert = xetCertificate_(ds);
  var choDanhGia = 0;
  ds.forEach(function (p, i) {
    cert[i].choDanhGia = p.kpi.task ? p.kpi.task.cho : 0;
    cert[i].log = p.kpi.log.tiLe;
    cert[i].chiTietLog = p.kpi.log.thamGia + '/' + String(p.kpi.log.giaoCuoi).replace('.', ',');
    choDanhGia += cert[i].choDanhGia;
  });
  return {
    ky: board.ky, gd2: gd2,
    cert: cert,
    choDanhGia: choDanhGia,
    suKienChuaChot: suKienLog.filter(function (s) { return !String(s.TrangThai); }).map(function (s) { return String(s.TenSuKien); }),
    khenThuong: danhSachKhenThuong_(board.thanhVien, gd2)
  };
}

function layTongKet(phien) {
  canDangNhap_(phien, 'baocao');
  return tinhTongKet_();
}

/** Xuất tổng kết ra file Excel: tab Certificate và tab Khen thưởng. Trả về { ten, base64 }. */
function xuatExcelTongKet(phien) {
  canDangNhap_(phien, 'baocao');
  var tk = tinhTongKet_();
  var ten = 'Tổng kết ' + (tk.ky ? 'nhiệm kỳ ' + tk.ky.nhiemKy + (tk.gd2 ? '' : ' giai đoạn 1') : '') + ' ' + hienNgay_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  var ss = SpreadsheetApp.create(ten);
  try {
    var ghi = function (sh, dau, dong) {
      sh.getRange(1, 1, 1, dau.length).setValues([dau]).setFontWeight('bold').setBackground('#274e13').setFontColor('#ffffff');
      if (dong.length) sh.getRange(2, 1, dong.length, dau.length).setValues(dong);
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, dau.length);
    };
    var pt = function (x) { return x === null || x === undefined ? 'Không có việc' : x + '%'; };
    ghi(ss.getSheets()[0].setName('Certificate'), ['Họ và tên', 'Ban', 'Nhóm', 'KPI log', 'KPI task', 'Xét bù trừ', 'Hạng bù trừ', 'Điểm bù trừ', 'Kết quả'],
      tk.cert.map(function (c) {
        return [c.ten, c.ban, c.boSung ? 'Bổ sung' : 'Chính thức', pt(c.log), c.mien ? 'Miễn (SUP-RES)' : pt(c.task), c.buTru ? 'Có' : '',
          c.hangBuTru ? c.hangBuTru + '/' + c.soBuTru : '', c.buTru ? c.diemBuTru : '', c.ketQua];
      }));
    var kt = ss.insertSheet('Khen thưởng'), dong = [];
    [['Top 15% giai đoạn 1', tk.khenThuong.gd1], ['Top 15% giai đoạn 2', tk.khenThuong.gd2], ['Top cả hai giai đoạn (điểm cả nhiệm kỳ)', tk.khenThuong.caHai]].forEach(function (x) {
      x[1].forEach(function (p) { dong.push([x[0], p.ten, p.ban, p.diem]); });
    });
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
