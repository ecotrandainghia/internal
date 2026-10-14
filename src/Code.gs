/**
 * Máy chủ của app CLB (Google Apps Script): trang web, tải danh sách thành viên, lịch sinh nhật, bảng điểm, góp ý.
 * Tầng dữ liệu ở DuLieu.gs, cài đặt lần đầu ở CaiDatLanDau.gs.
 */

var GIOI_HAN_GOP_Y_MOI_PHUT = 20;

/* ===================== Trang web ===================== */

function doGet(e) {
  if (e && e.parameter && e.parameter.tb) {
    // App trên điện thoại hỏi nội dung thông báo mới.
    return ContentService.createTextOutput(JSON.stringify(daCaiDat_() ? layThongBaoChoMay_(e.parameter.tb) : [])).setMimeType(ContentService.MimeType.JSON);
  }
  if (!daCaiDat_()) return trangCaiDatLanDau_();
  var trang = HtmlService.createTemplateFromFile('Eco');
  trang.googleClientId = String(layCaiDat_('GoogleClientId') || '');
  trang.thuocTinhChuDe = thuocTinhChuDe_(layCaiDat_('ChuDe'));
  return trang.evaluate()
    .setTitle('CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setFaviconUrl('https://ecotdn.github.io/icons/tab-eco.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(ten) {
  return HtmlService.createHtmlOutputFromFile(ten).getContent();
}

/* ===================== Tải danh sách thành viên (Cài đặt, Thành viên) ===================== */

/** Các lần tải trước (bảng LanTai). */
function cacLanTai_() {
  return docBang_('LanTai');
}

/** Thông tin cho trang Tải danh sách: kiểu tải, mỗi kiểu đã làm trong nhiệm kỳ gợi ý chưa, link nguồn lần trước. */
function layThongTinTaiDanhSach(phien) {
  canDangNhap_(phien, 'caidat');
  var lanTai = cacLanTai_(), bayGio = new Date(), ky = layKyHienTai_();
  return {
    link: String(layCaiDat_('LinkSheetThanhVien') || ''),
    ky: ky ? { nhiemKy: String(ky.NhiemKy), giaiDoan: Number(ky.GiaiDoan) } : null,
    soGiaiDoan: QUY_TAC.soGiaiDoan,
    coMatKhauChung: !!layBiMat_('MatKhauMacDinh'),
    kieu: cacKieuTai_(QUY_TAC.soGiaiDoan).map(function (k) {
      var nk = k === KIEU_TAI.CAP_NHAT ? (ky ? String(ky.NhiemKy) : goiYNhiemKy_(k, bayGio, lanTai)) : goiYNhiemKy_(k, bayGio, lanTai);
      var kt = kieuTaiThucTe_(k, nk, lanTai, QUY_TAC.soGiaiDoan);
      return { kieu: k, dot: soDotCua_(k), nhiemKy: nk, daLam: kt.doiThanhCapNhat, loi: kt.loi };
    }),
    lanTai: lanTai.slice(-10).reverse().map(function (l) {
      return { luc: new Date(l.ThoiGian).getTime(), nhiemKy: String(l.NhiemKy || ''), kieu: String(l.Kieu || ''), them: Number(l.SoThem) || 0, sua: Number(l.SoSua) || 0, roi: Number(l.SoAn) || 0, tong: Number(l.TongSo) || 0, nguoi: String(l.NguoiTai || '') };
    }),
    idLich: idLichCua_(ky ? String(ky.NhiemKy) : '') || idLichGanNhat_()
  };
}

/** Mở tab nguồn của danh sách thành viên. */
function moTabNguon_(link, tenTab) {
  var nguon;
  try { nguon = SpreadsheetApp.openByUrl(String(link || '').trim()); }
  catch (err) { throw new Error('Không mở được sheet nguồn. Kiểm tra lại link và chia sẻ sheet cho tài khoản CLB.'); }
  var tab = tenTab ? nguon.getSheetByName(tenTab) : nguon.getSheets()[0];
  if (!tab) throw new Error('Không thấy tab "' + tenTab + '" trong sheet nguồn.');
  return tab;
}

/** Đọc sheet nguồn và tính mọi thứ sẽ thay đổi, chưa ghi gì. */
function chuanBiTai_(yeuCau, bayGio, tk) {
  var lanTai = cacLanTai_();
  var nhiemKy = String(yeuCau.nhiemKy || '').trim() || goiYNhiemKy_(yeuCau.kieu, bayGio, lanTai);
  var kt = kieuTaiThucTe_(yeuCau.kieu, nhiemKy, lanTai, QUY_TAC.soGiaiDoan);
  if (kt.loi) throw new Error(kt.loi);
  var kyNay = layKyHienTai_();
  if (kt.kieu === KIEU_TAI.CAP_NHAT && kyNay && String(kyNay.NhiemKy) !== nhiemKy && kt.daLam.length === 0) {
    throw new Error('Nhiệm kỳ ' + nhiemKy + ' chưa bắt đầu. Cập nhật chỉ dùng cho nhiệm kỳ đang chạy (' + kyNay.NhiemKy + ').');
  }
  var tab = moTabNguon_(yeuCau.link, yeuCau.tenTab);
  var doc = docDanhSachThanhVien_(tab.getDataRange().getValues());
  if (doc.loi.length) throw new Error(doc.loi.join('\n'));
  var kyMoi = tinhKyMoi_(kt.kieu, nhiemKy);
  var giaiDoan = kyMoi ? kyMoi.GiaiDoan : (kyNay && String(kyNay.NhiemKy) === nhiemKy ? Number(kyNay.GiaiDoan) : 0);
  var tatCa = docBang_('ThanhVien');
  var kh = keHoachTaiDanhSach_(doc.thanhVien, tatCa, { kieu: kt.kieu, nhiemKy: nhiemKy, dauNhiemKy: kt.dauNhiemKy, giaiDoan: giaiDoan, bayGio: bayGio });
  if (kh.banLa.length && yeuCau.themBanMoi) {
    // BOD chọn thêm luôn các ban mới vào cơ cấu rồi tính lại.
    var moi = CO_CAU.ban.concat(kh.banLa.map(function (b) { return { ma: b, ten: b, nhom: b.split(' ')[0], vietTat: b.replace(/[^A-Z0-9]/g, '').slice(0, 6), laBod: false, phuTrach: true, dangDung: true }; }));
    var cc = chuanHoaCoCau_(moi);
    if (cc.loi) throw new Error(cc.loi);
    apCauHinh_(cc.ds, QUY_TAC);
    kh = keHoachTaiDanhSach_(doc.thanhVien, tatCa, { kieu: kt.kieu, nhiemKy: nhiemKy, dauNhiemKy: kt.dauNhiemKy, giaiDoan: giaiDoan, bayGio: bayGio });
    kh.coCauMoi = cc.ds;
  }
  var dangHd = kh.ds.filter(function (t) { return t.TrangThai !== TRANG_THAI_TV.ROI; });
  var dbtk = dongBoTaiKhoan_(docBang_('TaiKhoan'), dangHd);
  // Không để người đang tải tự mất quyền BOD (lỡ quên mình trong danh sách thì không ai vào được Cài đặt nữa).
  if (tk) {
    var toi = dbtk.ds.concat(dbtk.moi).filter(function (x) { return String(x.Email).toLowerCase() === String(tk.Email).toLowerCase(); })[0];
    if (!toi || toi.VaiTro !== 'BOD') kh.loi.push('Danh sách mới không có bạn (' + tk.Email + ') trong ban điều hành, nên sau khi tải bạn sẽ mất quyền vào Cài đặt. Kiểm tra lại email và ban của bạn trên sheet nguồn.');
  }
  return { kt: kt, nhiemKy: nhiemKy, kyMoi: kyMoi, kh: kh, doc: doc, tab: tab, dangHd: dangHd, soTkMoi: dbtk.moi.length };
}

/** Xem trước một lần tải: kiểu tải thực sự, số người thêm, sửa, rời. Không ghi gì. */
function xemTruocTaiDanhSach(phien, yeuCau) {
  var tk = canDangNhap_(phien, 'caidat');
  yeuCau = yeuCau || {};
  var c = chuanBiTai_(yeuCau, new Date(), tk);
  var ky = layKyHienTai_();
  var ten = function (ds) { return ds.map(function (t) { return String(t.HoVaTen); }); };
  return {
    kieu: c.kt.kieu, kieuChon: yeuCau.kieu, doiThanhCapNhat: c.kt.doiThanhCapNhat, nhiemKy: c.nhiemKy,
    giaiDoan: c.kyMoi ? 'Mở giai đoạn ' + c.kyMoi.GiaiDoan + ' của nhiệm kỳ ' + c.nhiemKy + (QUY_TAC.diemVe0 ? '. Bảng điểm giai đoạn mới bắt đầu từ 0.' : '.')
      : ky ? 'Giữ nguyên giai đoạn ' + ky.GiaiDoan + ' của nhiệm kỳ ' + ky.NhiemKy + '.' : 'Chưa mở giai đoạn nào (giai đoạn 1 mở khi tải "' + kieuDot_(1) + '").',
    tong: c.dangHd.length,
    them: c.kh.them.map(function (t) { return t.HoVaTen + ' (' + t.MaTV + ')'; }), sua: ten(c.kh.sua), roi: ten(c.kh.roi), quayLai: ten(c.kh.quayLai), doiBan: c.kh.doiBan,
    boSung: c.dangHd.filter(function (t) { return t.LoaiThanhVien === LOAI_TV.BO_SUNG; }).length,
    banLa: c.kh.coCauMoi ? [] : c.kh.banLa, banMoi: c.kh.coCauMoi ? c.kh.banLa : [],
    loi: c.kh.loi,
    soTkMoi: c.soTkMoi, canMatKhau: c.soTkMoi > 0 && !layBiMat_('MatKhauMacDinh'),
    coCotMa: c.doc.viTri.MaTV !== undefined
  };
}

/**
 * Tải danh sách thành viên từ sheet nguồn vào app. Không xoá dữ liệu cũ: người rời CLB được đánh dấu Đã rời
 * (hồ sơ, điểm, task cũ giữ nguyên), người quay lại dùng lại mã cũ.
 * @param {{link:string, tenTab:string, kieu:string, nhiemKy:string, idLich:string, themBanMoi:boolean, ghiMa:boolean}} yeuCau
 */
function taiDanhSachThanhVien(phien, yeuCau) {
  var tk = canDangNhap_(phien, 'caidat');
  yeuCau = yeuCau || {};
  var bayGio = new Date();
  var idLich = String(yeuCau.idLich || '').trim();
  if (idLich) kiemTraLich_(idLich);
  var c, ky;
  var khoa = layKhoa_();
  try {
    c = chuanBiTai_(yeuCau, bayGio, tk); // đọc lại trong khoá: có thể ai đó vừa sửa
    if (c.kh.banLa.length) throw new Error('Có ban chưa có trong cơ cấu CLB: ' + c.kh.banLa.join(', ') + '. Chọn "Thêm các ban này vào cơ cấu" hoặc sửa cột Ban trên sheet nguồn.');
    if (c.kh.loi.length) throw new Error(c.kh.loi.join('\n'));
    if (c.soTkMoi && !layBiMat_('MatKhauMacDinh')) throw new Error('Có ' + c.soTkMoi + ' người chưa có tài khoản. Đặt mật khẩu chung của CLB ở Cài đặt, Tài khoản trước nhé.');
    if (c.kh.coCauMoi) ghiCoCau_(c.kh.coCauMoi);

    ghiDeBang_('ThanhVien', c.kh.ds);
    if (c.kh.doiBan.length) themDong_('DoiBan', c.kh.doiBan.map(function (d) { return { ThoiGian: bayGio, MaTV: d.MaTV, HoVaTen: d.HoVaTen, BanCu: d.BanCu, BanMoi: d.BanMoi }; }));
    if (!docBang_('NhiemKy').some(function (n) { return String(n.NhiemKy) === c.nhiemKy; })) {
      // Nhiệm kỳ mới: giữ một bản quy tắc riêng, để sau này đổi quy tắc không làm sai kết quả nhiệm kỳ này.
      themDong_('NhiemKy', [{ NhiemKy: c.nhiemKy, BatDau: bayGio, QuyTac: JSON.stringify(chuanHoaQuyTac_(layCaiDat_('QuyTac'))) }]);
    }
    if (c.kyMoi) {
      themDong_('GiaiDoan', [{ NhiemKy: c.kyMoi.NhiemKy, GiaiDoan: c.kyMoi.GiaiDoan, BatDau: bayGio, KieuTai: c.kt.kieu }]);
      themDong_('ThanhVienGiaiDoan', c.dangHd.map(function (t) {
        return { NhiemKy: c.kyMoi.NhiemKy, GiaiDoan: c.kyMoi.GiaiDoan, MaTV: t.MaTV, HoVaTen: t.HoVaTen, Ban: t.Ban, ChucVu: t.ChucVu, LoaiThanhVien: t.LoaiThanhVien };
      }));
    }
    themDong_('LanTai', [{ ThoiGian: bayGio, NhiemKy: c.nhiemKy, KieuChon: yeuCau.kieu, Kieu: c.kt.kieu,
      SoThem: c.kh.them.length, SoSua: c.kh.sua.length + c.kh.quayLai.length, SoAn: c.kh.roi.length, TongSo: c.dangHd.length, NguoiTai: String(tk.HoVaTen) }]);
    dongBoTaiKhoanThanhVien_(c.dangHd, bayGio);
    datCaiDat_('LinkSheetThanhVien', String(yeuCau.link || '').trim());
    xoaBoNhoTam_();
    DA_NAP_CAU_HINH_ = false;
    ky = layKyHienTai_();
    if (idLich) datIdLich_(c.nhiemKy, idLich);
  } finally {
    traKhoa_(khoa);
  }

  var dong = [];
  if (c.kt.doiThanhCapNhat) dong.push('"' + yeuCau.kieu + '" đã làm trong nhiệm kỳ ' + c.nhiemKy + ' nên lần này được tính là Cập nhật.');
  dong.push('Đã tải ' + c.dangHd.length + ' thành viên (' + c.kt.kieu + ', nhiệm kỳ ' + c.nhiemKy + '): thêm ' + c.kh.them.length + ', sửa thông tin ' + c.kh.sua.length +
    (c.kh.quayLai.length ? ', quay lại ' + c.kh.quayLai.length : '') + ', ' + c.kh.roi.length + ' người đã rời.');
  dong.push(ky ? 'Hiện tại: nhiệm kỳ ' + ky.NhiemKy + ', giai đoạn ' + ky.GiaiDoan + '.' : 'Chưa mở giai đoạn nào; giai đoạn 1 mở khi tải "' + kieuDot_(1) + '".');
  if (c.soTkMoi) dong.push('Đã tạo ' + c.soTkMoi + ' tài khoản mới (đăng nhập bằng mật khẩu chung của CLB hoặc Google).');
  if (c.kh.doiBan.length) dong.push(c.kh.doiBan.length + ' người đổi ban, đã ghi lại ngày đổi.');
  if (c.kh.roi.length) dong.push('Hồ sơ và điểm của người đã rời vẫn được giữ, xem ở Cài đặt, Thành viên.');
  // Ghi mã thành viên vào sheet nguồn để các lần tải sau nhận ra đúng người dù đổi tên, đổi email.
  if (yeuCau.ghiMa) {
    try { dong.push(ghiMaVaoNguon_(c)); } catch (e) { dong.push('Chưa ghi được mã thành viên vào sheet nguồn: ' + e.message); }
  }
  // Lịch sinh nhật: mỗi lần tải đều đồng bộ, nếu nhiệm kỳ đã có ID lịch. Lỗi ở đây không làm hỏng việc tải danh sách.
  if (idLichCua_(c.nhiemKy)) {
    try {
      var sn = dongBoSinhNhat_(c.dangHd, c.nhiemKy);
      dong.push('Lịch "' + sn.ten + '": thêm ' + sn.soTao + ', bỏ ' + sn.soXoa + ', giữ ' + sn.soGiu + ' sinh nhật.' + (sn.conLai ? ' Còn ' + sn.conLai + ' người chưa kịp thêm: bấm Đồng bộ lịch sinh nhật để thêm nốt.' : '') + (sn.thieuNgay.length ? ' ' + sn.thieuNgay.length + ' người chưa có ngày sinh hợp lệ.' : ''));
    } catch (e) {
      dong.push('Chưa đồng bộ được lịch sinh nhật: ' + e.message);
    }
  } else dong.push('Nhiệm kỳ này chưa có lịch sinh nhật nên chưa thêm sinh nhật vào lịch.');
  return dong.join('\n');
}

/** Ghi mã thành viên vào cột "Mã thành viên" của sheet nguồn (thêm cột nếu chưa có). */
function ghiMaVaoNguon_(c) {
  var tab = c.tab, viTri = c.doc.viTri, dongTd = c.doc.dongTieuDe + 1;
  var cot = viTri.MaTV;
  if (cot === undefined) {
    cot = tab.getLastColumn();
    tab.getRange(dongTd, cot + 1).setValue('Mã thành viên').setFontWeight('bold');
  }
  var theoTen = {};
  c.dangHd.forEach(function (t) { theoTen[String(t.HoVaTen).toLowerCase()] = t.MaTV; });
  var so = 0;
  c.doc.thanhVien.forEach(function (t) {
    var ma = theoTen[String(t.HoVaTen).toLowerCase()];
    if (ma && ma !== t.MaTV) { tab.getRange(t.dong, cot + 1).setValue(ma); so++; }
  });
  return so ? 'Đã ghi mã thành viên của ' + so + ' người vào sheet nguồn.' : 'Mã thành viên trên sheet nguồn đã đủ.';
}

/* ===================== Lịch sinh nhật (Google Calendar của tài khoản CLB) ===================== */

/** ID lịch sinh nhật đã lưu theo nhiệm kỳ: { nhiệm kỳ: ID lịch }. */
function cacIdLich_() {
  try { return JSON.parse(layCaiDat_('LichSinhNhat') || '{}') || {}; } catch (e) { return {}; }
}
function idLichCua_(nhiemKy) { return nhiemKy ? String(cacIdLich_()[nhiemKy] || '') : ''; }

/** ID lịch của nhiệm kỳ gần nhất (để điền sẵn). */
function idLichGanNhat_() {
  var luu = cacIdLich_(), ds = Object.keys(luu).sort();
  return ds.length ? String(luu[ds[ds.length - 1]]) : '';
}

/** Lịch phải có thật và tài khoản CLB sửa được (lịch của CLB, hoặc được chia sẻ quyền Thay đổi sự kiện). */
function kiemTraLich_(id) {
  var cal = null;
  try { cal = CalendarApp.getCalendarById(id); } catch (e) { cal = null; }
  if (!cal) throw new Error('Không mở được lịch có ID "' + id + '". Kiểm tra lại ID (trong Google Calendar: Cài đặt của lịch, mục Tích hợp lịch) và chia sẻ lịch cho tài khoản CLB với quyền Thay đổi sự kiện.');
  return cal;
}

/** Lưu ID lịch cho nhiệm kỳ. Đổi sang lịch khác thì quên các sự kiện đã tạo ở lịch cũ để lần đồng bộ sau thêm lại đủ vào lịch mới. */
function datIdLich_(nhiemKy, id) {
  var luu = cacIdLich_();
  if (luu[nhiemKy] === id) return;
  luu[nhiemKy] = id;
  datCaiDat_('LichSinhNhat', JSON.stringify(luu));
  ghiDeBang_('SinhNhat', docBang_('SinhNhat').filter(function (r) { return String(r.NhiemKy) !== nhiemKy; }));
}

function layLichSinhNhat_(nhiemKy) {
  var id = idLichCua_(nhiemKy);
  if (!id) throw new Error('Chưa có ID lịch sinh nhật của nhiệm kỳ ' + nhiemKy + '.');
  return kiemTraLich_(id);
}

/** Làm cho lịch sinh nhật khớp danh sách: thêm người mới, sửa người đổi ngày sinh hoặc ban, bỏ người đã rời. */
function dongBoSinhNhat_(thanhVien, nhiemKy) {
  var cal = layLichSinhNhat_(nhiemKy);
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
      moi.push({ MaTV: x.MaTV, HoVaTen: x.HoVaTen, NgaySinh: x.NgaySinh, TieuDe: x.TieuDe, MaSuKien: se2.getId(), NhiemKy: nhiemKy });
      Utilities.sleep(80);
    }
  } finally {
    var thay = {};
    moi.forEach(function (m) { thay[String(m.MaTV || m.HoVaTen).toLowerCase()] = true; });
    ghiDeBang_('SinhNhat', tatCa.filter(function (r) {
      return !boMa[String(r.MaSuKien)] && !(String(r.NhiemKy) === nhiemKy && thay[String(r.MaTV || r.HoVaTen).toLowerCase()]);
    }).concat(moi));
  }
  return { ten: cal.getName(), id: cal.getId(), soTao: moi.length, soXoa: kh.xoa.length, soGiu: kh.soGiu, conLai: conLai, thieuNgay: kh.thieuNgay };
}

/** Cài đặt, Thành viên, Lịch sinh nhật: lưu ID lịch của nhiệm kỳ đang chạy và đồng bộ ngay. */
function luuLichSinhNhat(phien, id) {
  canDangNhap_(phien, 'caidat');
  var ky = layKyHienTai_();
  var nk = ky ? String(ky.NhiemKy) : (docBang_('LanTai').map(function (l) { return String(l.NhiemKy); }).sort().pop() || '');
  if (!nk) throw new Error('Chưa có nhiệm kỳ nào. Tải danh sách thành viên trước.');
  id = String(id || '').trim();
  if (!id) { var l = cacIdLich_(); delete l[nk]; datCaiDat_('LichSinhNhat', JSON.stringify(l)); return 'Đã bỏ lịch sinh nhật của nhiệm kỳ ' + nk + '.'; }
  kiemTraLich_(id);
  datIdLich_(nk, id);
  var sn = dongBoSinhNhat_(docThanhVien_(), nk);
  return 'Lịch "' + sn.ten + '": thêm ' + sn.soTao + ', bỏ ' + sn.soXoa + ', giữ ' + sn.soGiu + ' sinh nhật.' + (sn.conLai ? ' Còn ' + sn.conLai + ' người: bấm lại để thêm nốt.' : '') + (sn.thieuNgay.length ? ' ' + sn.thieuNgay.length + ' người chưa có ngày sinh hợp lệ.' : '');
}

/** Giữ tài khoản khớp với danh sách: thêm người mới, cập nhật BOD theo ban, bỏ người đã rời CLB. Trả về số tài khoản mới. */
function dongBoTaiKhoanThanhVien_(thanhVien, bayGio) {
  var kq = dongBoTaiKhoan_(docBang_('TaiKhoan'), thanhVien);
  ghiDeBang_('TaiKhoan', kq.ds.concat(kq.moi.map(function (m) {
    return { Email: m.Email, MaTV: m.MaTV, HoVaTen: m.HoVaTen, VaiTro: m.VaiTro, MatKhau: '', Muoi: '', NgayTao: bayGio };
  })));
  return kq.moi.length;
}

/** Mật khẩu chung của CLB: tài khoản chưa đổi mật khẩu thì đăng nhập bằng mật khẩu này. Chỉ lưu bản băm, ở chỗ bí mật. */
function datMatKhauMacDinh_(matKhau) {
  var muoi = Utilities.getUuid();
  datBiMat_('MuoiMacDinh', muoi);
  datBiMat_('MatKhauMacDinh', bamMatKhau_(matKhau, muoi));
}

function bamMatKhau_(matKhau, muoi) {
  var bam = muoi + ':' + matKhau;
  for (var i = 0; i < 300; i++) {
    var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bam, Utilities.Charset.UTF_8);
    bam = Utilities.base64Encode(b);
  }
  return bam;
}

/** Cài đặt, Tài khoản, Mật khẩu chung. */
function luuMatKhauChung(phien, matKhau) {
  canDangNhap_(phien, 'caidat');
  var loi = kiemTraMatKhauMoi_(matKhau);
  if (loi) throw new Error(loi);
  datMatKhauMacDinh_(String(matKhau));
  return true;
}

/* ===================== Xếp hạng điểm và góp ý ===================== */

/** Bảng xếp hạng: phải đăng nhập mới xem được. Chỉ có họ tên, lớp, ban và điểm. */
function layDuLieuBoard(phien) {
  canDangNhap_(phien);
  return duLieuBoard_();
}

function duLieuBoard_() {
  var cache = CacheService.getScriptCache();
  var daLuu = cache.get('xephang');
  if (daLuu) return JSON.parse(daLuu);

  var ky = layKyHienTai_();
  var duLieu = {
    ky: ky ? { nhiemKy: String(ky.NhiemKy), giaiDoan: Number(ky.GiaiDoan) } : null,
    quyTac: { tiLeTop: QUY_TAC.tiLeTop, diemVe0: QUY_TAC.diemVe0 },
    thanhVien: ky ? tongHopBangDiem_(docThanhVien_().filter(khongPhaiBod_), docBang_('LichSuDiem'), ky) : [] // BOD không tham gia cộng điểm
  };
  cache.put('xephang', JSON.stringify(duLieu), 60);
  return duLieu;
}

/** Lịch sử cộng điểm (giaiDoan 0 là cả nhiệm kỳ): thành viên xem của mình, BOD xem của mọi người. */
function layLichSuDiem(phien, ten, giaiDoan) {
  var tk = canDangNhap_(phien);
  if (!coQuyen_(String(tk.VaiTro), 'lichsudiem') && String(ten).toLowerCase() !== String(tk.HoVaTen).toLowerCase()) {
    throw new Error('Bạn chỉ xem được lịch sử điểm của mình.');
  }
  var ky = layKyHienTai_();
  if (!ky) return [];
  var laThanhVien = docThanhVien_().some(function (tv) { return String(tv.HoVaTen).toLowerCase() === String(ten).toLowerCase(); });
  if (!laThanhVien) return [];
  return lichSuCongKhai_(docBang_('LichSuDiem'), ten, ky.NhiemKy, giaiDoan === undefined ? ky.GiaiDoan : Number(giaiDoan));
}

/**
 * Góp ý: phải đăng nhập (chặn người ngoài gửi bừa). Mặc định ẩn danh; người gửi chọn ghi tên thì
 * BOD đánh dấu "Đã đưa vào sử dụng" được và người gửi được cộng điểm.
 */
function guiGopY(phien, noiDung, ghiTen) {
  var tk = canDangNhap_(phien, 'guigopy');
  var loi = kiemTraGopY_(noiDung);
  if (loi) throw new Error(loi);
  var cache = CacheService.getScriptCache();
  var dem = Number(cache.get('demGopY') || 0);
  if (dem >= GIOI_HAN_GOP_Y_MOI_PHUT) throw new Error('Đang có nhiều góp ý gửi cùng lúc, bạn thử lại sau một phút nhé.');
  cache.put('demGopY', String(dem + 1), 60);
  themDong_('GopY', [{ ThoiGian: new Date(), NoiDung: String(noiDung).trim(), DaDoc: false, HoVaTen: ghiTen ? String(tk.HoVaTen) : '' }]);
  try { thongBaoGopYMoi_(String(noiDung).trim()); } catch (e) { /* không gửi được mail báo thì góp ý vẫn được lưu */ }
  return true;
}
