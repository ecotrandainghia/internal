/**
 * KPI task và KPI của HR (quy chế 2026-2027, mục II.2 đến II.4).
 * - BOD đánh giá chất lượng task đã xong; app tự ra Đạt / Chưa đạt theo bảng 3 × 3.
 * - COO (hoặc BOD) ghi gia hạn khi thành viên xin trước hạn ít nhất 24 giờ.
 * - Mỗi task ghi lại HR phụ trách người làm (theo bảng phân công BOD chọn). Mỗi task có 2 lượt nhắc của HR đó.
 * - BOD ghi nhận khi HR quên nhắc deadline, quên chúc mừng sinh nhật hoặc quên báo cáo seeding.
 * - HR nhóm SUP-SEED đặt nhắc 48 giờ cho từng bài đăng; app nhắc khi đủ 48 giờ.
 */

/** Tên những người thuộc nhóm SUP-RES (được miễn task ban). */
function tenSupRes_() {
  return docBang_('TaiKhoan').filter(function (t) { return nhomHr_(t.NhomHr).indexOf('SUP-RES') >= 0; }).map(function (t) { return String(t.HoVaTen); });
}

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
    var loi = kiemTraGiaHan_(han, String(yc.hanMoi || ''), String(yc.ngayXin || ''));
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

/** Lúc bắt đầu giai đoạn 2 của nhiệm kỳ hiện tại (ms), 0 nếu chưa có. Thành viên bổ sung chỉ tính việc từ lúc này. */
function batDauGiaiDoan2_() {
  var ky = layKyHienTai_();
  if (!ky) return 0;
  var d = docBang_('KyHoatDong').filter(function (k) { return String(k.NhiemKy) === String(ky.NhiemKy) && Number(k.HocKy) === 2; })[0];
  return d && d.BatDau ? new Date(d.BatDau).getTime() : 0;
}

/** Task tính KPI của một người: chính thức cả nhiệm kỳ, bổ sung chỉ task giao từ giai đoạn 2. */
function taskTinhKpi_(task, tv, moc2) {
  var ten = String(tv.HoVaTen), boSung = tv.LoaiThanhVien === LOAI_TV.BO_SUNG;
  return task.filter(function (t) { return t.nguoi === ten && (!boSung || t.thoiGianTao >= moc2); });
}

/** Thông tin KPI log và KPI task của một người (để hiện). Task: HR tính theo lượt nhắc, SUP-RES được miễn. */
function kpiCuaNguoi_(tv, task, quen, moc2, supRes, suKienLog) {
  var ten = String(tv.HoVaTen);
  var kq = { ten: ten, ban: String(tv.Ban || ''), nhom: nhomBan_(tv.Ban), boSung: tv.LoaiThanhVien === LOAI_TV.BO_SUNG, log: kpiLogCuaNguoi_(tv, suKienLog || [], moc2) };
  if (supRes.indexOf(ten) >= 0) { kq.mien = true; return kq; }
  if (nhomBan_(tv.Ban) === 'HR') { kq.hr = kpiHr_(task.filter(function (t) { return !kq.boSung || t.thoiGianTao >= moc2; }), quen, ten); return kq; }
  kq.task = tongKpiTask_(taskTinhKpi_(task, tv, moc2));
  return kq;
}

function docHrQuen_() {
  return docBangNhiemKy_('HrQuen', 'ThoiGian').map(function (q) {
    return {
      thoiGian: new Date(q.ThoiGian).getTime(), nguoiHr: String(q.NguoiHr), loai: String(q.Loai), moTa: String(q.MoTa || ''),
      thamChieu: String(q.ThamChieu || ''), nguoiGhi: String(q.NguoiGhi || ''), daHuy: String(q.TrangThai) === 'Đã huỷ',
      NguoiHr: String(q.NguoiHr), TrangThai: String(q.TrangThai || '')
    };
  }).sort(function (a, b) { return b.thoiGian - a.thoiGian; });
}

/**
 * Trang KPI. BOD: bảng KPI log và KPI task của mọi thành viên, KPI của HR, các lần HR quên.
 * Người khác: KPI log, task và KPI của mình (HR có thêm KPI nhắc deadline).
 */
function layKpi(phien) {
  var tk = canDangNhap_(phien);
  var laBod = String(tk.VaiTro) === 'BOD';
  var task = docTask_(), quen = docHrQuen_(), moc2 = batDauGiaiDoan2_(), supRes = tenSupRes_(), suKienLog = docSuKienLog_();
  var tv = docThanhVien_().filter(khongPhaiBod_);
  var cot = function (q) { return { thoiGian: q.thoiGian, nguoiHr: q.nguoiHr, loai: q.loai, moTa: q.moTa, thamChieu: q.thamChieu, nguoiGhi: q.nguoiGhi, daHuy: q.daHuy }; };
  if (laBod) {
    var hr = docBang_('TaiKhoan').filter(function (t) { return ['HR', 'UCV'].indexOf(String(t.VaiTro)) >= 0 || nhomHr_(t.NhomHr).length; })
      .map(function (t) { return { ten: String(t.HoVaTen), vaiTro: String(t.VaiTro), nhomHr: nhomHr_(t.NhomHr), coo: banCuaHr_(t.BanQuanLy) }; });
    return {
      laBod: true,
      moc2: moc2,
      thanhVien: tv.map(function (t) { return kpiCuaNguoi_(t, task, quen, moc2, supRes, suKienLog); }),
      hr: hr,
      quen: quen.map(cot),
      loaiQuen: LOAI_HR_QUEN
    };
  }
  var toi = tv.filter(function (t) { return String(t.HoVaTen).toLowerCase() === String(tk.HoVaTen).toLowerCase(); })[0] || { HoVaTen: String(tk.HoVaTen), Ban: '' };
  var cuaToi = task.filter(function (t) { return t.nguoi === String(tk.HoVaTen); }).sort(function (a, b) { return a.hanChot < b.hanChot ? 1 : a.hanChot > b.hanChot ? -1 : 0; });
  // COO xem KPI log và KPI task của các thành viên thuộc ban mình phụ trách.
  var banCoo = String(tk.VaiTro) === 'HR' || String(tk.VaiTro) === 'UCV' ? banCuaHr_(tk.BanQuanLy) : [];
  return {
    laBod: false,
    banCoo: banCoo,
    thanhVienBan: banCoo.length ? tv.filter(function (t) { return banCoo.indexOf(nhomBan_(t.Ban)) >= 0; }).map(function (t) { return kpiCuaNguoi_(t, task, quen, moc2, supRes, suKienLog); }) : [],
    kpi: kpiCuaNguoi_(toi, task, quen, moc2, supRes, suKienLog),
    task: cuaToi,
    quen: quen.filter(function (q) { return q.nguoiHr.toLowerCase() === String(tk.HoVaTen).toLowerCase(); }).map(cot)
  };
}

/** BOD ghi nhận một lần HR quên (nhắc deadline, chúc mừng sinh nhật, báo cáo seeding). */
function ghiHrQuen(phien, yc) {
  var tk = canDangNhap_(phien, 'danhgia');
  yc = yc || {};
  var loai = String(yc.loai || '');
  if (LOAI_HR_QUEN.indexOf(loai) < 0) throw new Error('Chọn loại việc HR quên.');
  var hr = String(yc.nguoiHr || '').trim();
  if (!hr) throw new Error(loai === LOAI_HR_QUEN[0] ? 'Task này chưa có HR phụ trách. Phân công HR trong Cài đặt rồi thử lại.' : 'Chọn HR quên.');
  var moTa = String(yc.moTa || '').trim();
  if (moTa.length > 500) throw new Error('Mô tả dài quá 500 ký tự.');
  var ky = layKyHienTai_();
  themDong_('HrQuen', [{
    ThoiGian: new Date(), NguoiHr: hr, Loai: loai, MoTa: moTa, ThamChieu: String(yc.thamChieu || '').slice(0, 300), NguoiGhi: String(tk.HoVaTen),
    NhiemKy: ky ? String(ky.NhiemKy) : '', HocKy: ky ? Number(ky.HocKy) : '', TrangThai: ''
  }]);
  return true;
}

/** Huỷ một lần ghi nhận HR quên (ghi nhầm). Dòng vẫn còn trong sheet với trạng thái Đã huỷ. */
function huyHrQuen(phien, thoiGianMs) {
  canDangNhap_(phien, 'danhgia');
  return voiKhoa_(function () {
    var sh = bangDuLieu_('HrQuen');
    var v = sh.getDataRange().getValues();
    var dong = timDongTheoThoiGian_(v, 'ThoiGian', thoiGianMs);
    if (!dong) throw new Error('Không tìm thấy lần ghi nhận này.');
    sh.getRange(dong, v[0].indexOf('TrangThai') + 1).setValue('Đã huỷ');
    return true;
  });
}

/* ---------- Phân công HR phụ trách từng thành viên ---------- */

/** Thành viên các ban có COO, kèm HR đang phụ trách và các HR là COO của ban đó. */
function layPhanCongHr(phien) {
  canDangNhap_(phien, 'caidat');
  var pc = {};
  docBang_('PhuTrachHr').forEach(function (p) { pc[String(p.HoVaTen).toLowerCase()] = String(p.NguoiHr || ''); });
  var hr = docBang_('TaiKhoan').filter(function (t) { return String(t.VaiTro) === 'HR'; }).map(function (t) { return { ten: String(t.HoVaTen), coo: banCuaHr_(t.BanQuanLy) }; });
  var tv = docThanhVien_();
  return {
    ban: banCoo_(tv),
    hr: hr,
    thanhVien: tv.filter(function (t) { var n = nhomBan_(t.Ban); return n && n !== 'BOD' && n !== 'HR'; })
      .map(function (t) { return { ten: String(t.HoVaTen), ban: String(t.Ban), nhom: nhomBan_(t.Ban), hr: pc[String(t.HoVaTen).toLowerCase()] || '' }; })
  };
}

/** Lưu phân công: ds = [{ ten, hr }]. Task mới của mỗi người ghi HR phụ trách theo bảng này; task cũ giữ HR lúc giao. */
function luuPhanCongHr(phien, ds) {
  canDangNhap_(phien, 'caidat');
  var tenHr = {};
  docBang_('TaiKhoan').forEach(function (t) { if (String(t.VaiTro) === 'HR') tenHr[String(t.HoVaTen)] = true; });
  var dong = [];
  (ds || []).forEach(function (x) {
    var hr = String(x && x.hr || '').trim();
    if (!hr) return;
    if (!tenHr[hr]) throw new Error(hr + ' không còn là HR.');
    dong.push({ HoVaTen: String(x.ten), NguoiHr: hr });
  });
  ghiDeBang_('PhuTrachHr', dong);
  return dong.length;
}

/* ---------- Nhắc 48 giờ cho HR nhóm SUP-SEED ---------- */

function cacNhacSeedingCua_(email) {
  return docBang_('NhacSeeding').filter(function (n) { return String(n.Email).toLowerCase() === String(email).toLowerCase() && !n.DaNhac; })
    .map(function (n) { return { thoiGian: new Date(n.ThoiGian).getTime(), link: String(n.LinkBai || ''), lucDang: new Date(n.LucDang).getTime(), lucNhac: new Date(n.LucNhac).getTime() }; })
    .sort(function (a, b) { return a.lucNhac - b.lucNhac; });
}

/** SUP-SEED đặt nhắc khi thấy thông báo bài đăng: app nhắc khi bài đủ 48 giờ. */
function datNhacSeeding(phien, yc) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  yc = yc || {};
  var luc = Number(yc.lucDang);
  if (!luc || isNaN(new Date(luc).getTime())) throw new Error('Chọn thời gian bài được đăng.');
  var link = String(yc.link || '').trim();
  if (link && !linkHopLe_(link)) throw new Error('Link bài đăng phải bắt đầu bằng https://');
  var lucNhac = luc + 48 * 3600000;
  if (lucNhac < Date.now()) throw new Error('Bài đã đăng hơn 48 giờ rồi, bạn điền báo cáo luôn nhé.');
  themDong_('NhacSeeding', [{ ThoiGian: new Date(), Email: String(tk.Email), HoVaTen: String(tk.HoVaTen), LinkBai: link, LucDang: new Date(luc), LucNhac: new Date(lucNhac), DaNhac: '' }]);
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'nhacSeedingTheoGio'; })) {
    ScriptApp.newTrigger('nhacSeedingTheoGio').timeBased().everyHours(1).create();
  }
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

/** Chạy mỗi giờ: nhắc các bài đã đủ 48 giờ (theo cách nhận thông báo của từng người; chưa chọn cách thì gửi mail). */
function nhacSeedingTheoGio(e) {
  if (!laLichChay_(e)) return;
  var bayGio = Date.now(), tz = Session.getScriptTimeZone();
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
  if (!den.length) return;
  var nguoi = {};
  nguoiNhanThongBao_().forEach(function (n) { nguoi[n.email.toLowerCase()] = n; });
  den.forEach(function (d) {
    var noiDung = 'Bài đăng lúc ' + Utilities.formatDate(d.lucDang, tz, 'HH:mm dd/MM') + ' đã đủ 48 giờ. Bạn vào app eco, trang Báo cáo seeding, điền những người đã react và comment nhé.' + (d.link ? '\n' + d.link : '');
    try {
      var n = nguoi[d.email.toLowerCase()];
      if (!n || !guiThongBao_(n, 'Đến giờ báo cáo seeding', noiDung)) guiMailThongBao_(d.email, 'Đến giờ báo cáo seeding', noiDung);
    } catch (x) { /* một người lỗi không chặn người khác */ }
  });
}
