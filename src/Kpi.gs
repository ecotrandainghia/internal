/**
 * KPI task (quy chế 2026-2027, mục II.2 đến II.4).
 * - BOD đánh giá chất lượng task đã xong; app tự ra Đạt / Chưa đạt theo bảng đúng hạn × chất lượng (Cài đặt, Quy tắc).
 * - BOD ghi gia hạn khi thành viên xin trước hạn đủ số ngày trong Cài đặt, Quy tắc.
 * - Ban HR tính KPI task như mọi ban. App không theo dõi việc HR nhắc deadline nữa.
 * - HR phụ trách ban xem KPI của các ban mình phụ trách.
 * - HR phụ trách seeding đặt nhắc hẹn: hết số giờ seeding (Cài đặt, Quy tắc) thì app nhắc điền báo cáo seeding.
 */

function timDongTheoThoiGian_(v, cot, ms) {
  var c = v[0].indexOf(cot);
  for (var r = 1; r < v.length; r++) if (new Date(v[r][c]).getTime() === Number(ms)) return r + 1;
  return 0;
}

/** BOD đánh giá chất lượng một task đã xong (ghi tên người đánh giá). */
function danhGiaTask(phien, thoiGianTao, nguoi, yc) {
  var tk = canDangNhap_(phien, 'danhgia');
  yc = yc || {};
  var loi = kiemTraDanhGia_(yc.chatLuong, yc.dauHieu);
  if (loi) throw new Error(loi);
  return voiKhoa_(function () {
    var sh = bangDuLieu_('Task');
    var v = sh.getDataRange().getValues(), td = v[0];
    var dong = timDongTask_(v, thoiGianTao, nguoi);
    if (String(v[dong - 1][td.indexOf('TrangThai')]) !== TRANG_THAI_TASK.XONG) throw new Error('Chỉ đánh giá được task đã xong. Task không hoàn thành tự tính là Chưa đạt.');
    var ghi = { ChatLuong: yc.chatLuong, DauHieu: String(yc.dauHieu || '').trim(), NguoiDanhGia: String(tk.HoVaTen), LucDanhGia: new Date() };
    Object.keys(ghi).forEach(function (c) { sh.getRange(dong, td.indexOf(c) + 1).setValue(ghi[c]); });
    return true;
  });
}

/** Ghi gia hạn được chấp thuận (người quản lý task của người đó). Hạn cũ giữ ở cột HanGoc. */
function giaHanTask(phien, thoiGianTao, nguoi, yc) {
  var tk = canDangNhap_(phien, 'task');
  kiemTraDuocGiao_(quyenTaskCua_(tk), nguoi);
  yc = yc || {};
  return voiKhoa_(function () {
    var sh = bangDuLieu_('Task');
    var v = sh.getDataRange().getValues(), td = v[0];
    var dong = timDongTask_(v, thoiGianTao, nguoi);
    var r = v[dong - 1];
    var luu = String(r[td.indexOf('TrangThai')] || TRANG_THAI_TASK.GIAO);
    if (luu === TRANG_THAI_TASK.XONG || luu === TRANG_THAI_TASK.HUY) throw new Error('Task đã ' + (luu === TRANG_THAI_TASK.XONG ? 'xong' : 'huỷ') + ' nên không gia hạn được.');
    var han = ngayChuoi_(r[td.indexOf('HanChot')]);
    var loi = kiemTraGiaHan_(han, String(yc.hanMoi || ''), String(yc.ngayXin || ''), quyTac_());
    if (loi) throw new Error(loi);
    if (!ngayChuoi_(r[td.indexOf('HanGoc')])) sh.getRange(dong, td.indexOf('HanGoc') + 1).setValue(han);
    sh.getRange(dong, td.indexOf('HanChot') + 1).setValue(String(yc.hanMoi));
    sh.getRange(dong, td.indexOf('NgayXinGiaHan') + 1).setValue(String(yc.ngayXin));
    return true;
  });
}

/** Người làm task phản hồi đánh giá (nếu thấy chưa chính xác). Chỉ sửa được phản hồi của task mình. */
function phanHoiTask(phien, thoiGianTao, noiDung) {
  var tk = canDangNhap_(phien);
  var nd = String(noiDung || '').trim();
  if (nd.length > 1000) throw new Error('Phản hồi dài quá 1000 ký tự.');
  return voiKhoa_(function () {
    var sh = bangDuLieu_('Task');
    var v = sh.getDataRange().getValues(), td = v[0];
    var dong = timDongTask_(v, thoiGianTao, String(tk.HoVaTen));
    if (!String(v[dong - 1][td.indexOf('ChatLuong')] || '')) throw new Error('Task này chưa được đánh giá.');
    sh.getRange(dong, td.indexOf('PhanHoi') + 1).setValue(nd);
    return true;
  });
}

/** Task tính KPI của một người: chỉ task giao từ lúc giai đoạn người đó vào CLB bắt đầu. mocGd: { giai đoạn: ms }. */
function taskTinhKpi_(task, tv, mocGd) {
  var ten = String(tv.HoVaTen), g = gdVao_(tv);
  var moc = g >= 2 ? Number((mocGd || {})[g]) || 0 : 0;
  return task.filter(function (t) { return t.nguoi === ten && t.thoiGianTao >= moc; });
}

/** Thông tin KPI log và KPI task của một người (để hiện), kèm phần trăm đạt của ban người đó. */
function kpiCuaNguoi_(tv, task, mocGd, suKienLog) {
  var g = gdVao_(tv);
  return {
    ten: String(tv.HoVaTen), maTV: String(tv.MaTV || ''), ban: String(tv.Ban || ''), nhom: nhomBan_(tv.Ban), khoi: khoiLop_(tv.Lop),
    boSung: g >= 2, gdVao: g, datTask: mucDatCua_(tv.Ban, 'datTask'), datLog: mucDatCua_(tv.Ban, 'datLog'),
    log: kpiLogCuaNguoi_(tv, suKienLog || [], mocGd),
    task: tongKpiTask_(taskTinhKpi_(task, tv, mocGd))
  };
}

/** Phạm vi HR phụ trách của tài khoản đang đăng nhập (các ban ở cột BanQuanLy). */
function phamViHrCua_(tk) {
  var banCua = {};
  docBang_('ThanhVien').forEach(function (t) { banCua[String(t.HoVaTen)] = String(t.Ban); });
  return phamViHr_(tk, banCua);
}

/**
 * Trang KPI task và KPI log. BOD: KPI của mọi thành viên (trừ BOD), kèm kết quả đạt hay chưa.
 * Người khác: chỉ các con số của mình (và của những người mình phụ trách, nếu là HR phụ trách), không ghi đạt hay chưa đạt:
 * xét certificate chỉ có ở trang Chứng nhận của BOD.
 */
function layKpi(phien) {
  var tk = canDangNhap_(phien);
  var qt = quyTac_(), task = docTask_(), mocGd = mocGiaiDoanNay_(), suKienLog = docSuKienLog_();
  var tv = docThanhVien_().filter(khongPhaiBod_);
  var cua = function (t) { return kpiCuaNguoi_(t, task, mocGd, suKienLog); };
  var quyTac = { datTask: qt.datTask, datLog: qt.datLog, giaHanNgay: qt.giaHanNgay };
  if (String(tk.VaiTro) === 'BOD') return { laBod: true, quyTac: quyTac, thanhVien: tv.map(cua) };
  var toi = tv.filter(function (t) { return String(t.HoVaTen).toLowerCase() === String(tk.HoVaTen).toLowerCase(); })[0] || { HoVaTen: String(tk.HoVaTen), Ban: '' };
  var cuaToi = task.filter(function (t) { return t.nguoi === String(tk.HoVaTen); }).sort(function (a, b) { return a.hanChot < b.hanChot ? 1 : a.hanChot > b.hanChot ? -1 : 0; });
  var pv = phamViHrCua_(tk);
  return {
    laBod: false,
    quyTac: quyTac,
    phamVi: { ban: pv.ban },
    thanhVienBan: pv.co ? tv.filter(function (t) { return pv.thuoc(String(t.HoVaTen)); }).map(cua) : [],
    kpi: cua(toi),
    task: cuaToi
  };
}

/* ---------- Nhắc hẹn điền báo cáo seeding cho HR phụ trách seeding ---------- */

function cacNhacSeedingCua_(email) {
  return docBang_('NhacSeeding').filter(function (n) { return String(n.Email).toLowerCase() === String(email).toLowerCase() && !n.DaNhac; })
    .map(function (n) { return { thoiGian: new Date(n.ThoiGian).getTime(), link: String(n.LinkBai || ''), lucDang: new Date(n.LucDang).getTime(), lucNhac: new Date(n.LucNhac).getTime() }; })
    .sort(function (a, b) { return a.lucNhac - b.lucNhac; });
}

/** HR phụ trách seeding đặt nhắc hẹn khi thấy bài mới: hết số giờ seeding thì app nhắc điền báo cáo. Không ghi giờ đăng thì tính từ lúc đặt. */
function datNhacSeeding(phien, yc) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  yc = yc || {};
  var luc = Number(yc.lucDang) || Date.now();
  if (isNaN(new Date(luc).getTime())) throw new Error('Thời gian bài được đăng chưa đúng.');
  var link = String(yc.link || '').trim();
  if (link && !linkHopLe_(link)) throw new Error('Link bài đăng phải bắt đầu bằng https://');
  var gio = quyTac_().seedingGio;
  var lucNhac = luc + gio * 3600000;
  if (lucNhac < Date.now()) throw new Error('Bài đã đăng hơn ' + gio + ' giờ rồi, bạn điền báo cáo luôn nhé.');
  themDong_('NhacSeeding', [{ ThoiGian: new Date(), Email: String(tk.Email), HoVaTen: String(tk.HoVaTen), LinkBai: link, LucDang: new Date(luc), LucNhac: new Date(lucNhac), DaNhac: '' }]);
  return cacNhacSeedingCua_(tk.Email);
}

function xoaNhacSeeding(phien, thoiGianMs) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  voiKhoa_(function () {
    var sh = bangDuLieu_('NhacSeeding');
    var v = sh.getDataRange().getValues();
    var dong = timDongTheoThoiGian_(v, 'ThoiGian', thoiGianMs);
    if (!dong || String(v[dong - 1][v[0].indexOf('Email')]).toLowerCase() !== String(tk.Email).toLowerCase()) throw new Error('Không tìm thấy nhắc này.');
    sh.getRange(dong, v[0].indexOf('DaNhac') + 1).setValue('Đã xoá');
  });
  return cacNhacSeedingCua_(tk.Email);
}

/** Chạy mỗi giờ: nhắc các bài đã đủ số giờ seeding (theo cách nhận thông báo của từng người; chưa chọn cách thì gửi mail). */
function nhacSeedingTheoGio(e) {
  if (!laLichChay_(e)) return;
  chayViec_('nhacSeedingTheoGio', nhacSeedingTheoGio_);
}

function nhacSeedingTheoGio_() {
  var bayGio = Date.now(), tz = muiGio_(), gio = quyTac_().seedingGio;
  var den = [];
  voiKhoa_(function () {
    var sh = bangDuLieu_('NhacSeeding');
    var v = sh.getDataRange().getValues(), td = v[0];
    for (var r = 1; r < v.length; r++) {
      if (v[r][td.indexOf('DaNhac')] || new Date(v[r][td.indexOf('LucNhac')]).getTime() > bayGio) continue;
      sh.getRange(r + 1, td.indexOf('DaNhac') + 1).setValue(new Date());
      den.push({ email: String(v[r][td.indexOf('Email')]), link: String(v[r][td.indexOf('LinkBai')] || ''), lucDang: new Date(v[r][td.indexOf('LucDang')]) });
    }
  });
  if (!den.length) return '';
  var nguoi = {};
  nguoiNhanThongBao_().forEach(function (n) { nguoi[n.email.toLowerCase()] = n; });
  den.forEach(function (d) {
    var noiDung = 'Bài đăng lúc ' + Utilities.formatDate(d.lucDang, tz, 'HH:mm dd/MM') + ' đã đủ ' + gio + ' giờ. Bạn vào app CLB ECO, mục Seeding, Nộp báo cáo, điền những người đã react và comment nhé.' + (d.link ? '\n' + d.link : '');
    try {
      var n = nguoi[d.email.toLowerCase()];
      if (!n || !guiThongBao_(n, 'Đến giờ báo cáo seeding', noiDung)) guiMailThongBao_(d.email, 'Đến giờ báo cáo seeding', noiDung);
    } catch (x) { /* một người lỗi không chặn người khác */ }
  });
  return 'Đã nhắc ' + den.length + ' bài';
}
