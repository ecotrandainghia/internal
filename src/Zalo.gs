/**
 * Bot Zalo và lịch nhắc việc hằng ngày (nhắc gửi theo cách mỗi người chọn, xem ThongBao.gs).
 * Head HR tạo bot mỗi năm và dán mã bot vào Cài đặt. Ai muốn nhận thông báo qua Zalo thì nhắn mã kết nối
 * của mình cho bot một lần (xem ở mục Thông báo). Mỗi ngày, vào giờ BOD chọn, gửi tin nhắc việc:
 *  - BOD nhận các task của chính mình;
 *  - ban nhân sự nhận task của các thành viên khác (không phải BOD) để nhắc lại qua Messenger.
 */

var ZALO_API = 'https://bot-api.zapps.me/bot';
var ZALO_TOI_DA_KY_TU = 2000;

/* ---------- Gọi API Zalo ---------- */

function goiZalo_(token, phuongThuc, thamSo) {
  var res = UrlFetchApp.fetch(ZALO_API + token + '/' + phuongThuc, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(thamSo || {}), muteHttpExceptions: true
  });
  var kq;
  try { kq = JSON.parse(res.getContentText()); } catch (e) { kq = null; }
  if (!kq || !kq.ok) {
    var lyDo = kq && (kq.description || kq.message) ? (kq.description || kq.message) : 'mã lỗi ' + res.getResponseCode();
    var loi = new Error('Zalo báo lỗi: ' + lyDo);
    loi.maLoi = kq && kq.error_code;
    throw loi;
  }
  return kq.result;
}

/** Tên bot người dùng tìm được trong Zalo (tên hiển thị, không phải mã dạng bot.xxxx). */
function tenHienThiBot_(bot) {
  return String((bot && (bot.display_name || bot.name || bot.account_name)) || '');
}

/** Tên bot đã lưu. Bản cũ lưu mã dạng bot.xxxx thì hỏi lại Zalo để lấy tên hiển thị. */
function tenBotZalo_() {
  var ten = String(layCaiDat_('ZaloTenBot') || '');
  var token = layTokenZalo_();
  if (token && (!ten || /^bot\./.test(ten))) {
    try { var moi = tenHienThiBot_(goiZalo_(token, 'getMe', {})); if (moi && moi !== ten) { ten = moi; datCaiDat_('ZaloTenBot', ten); } } catch (e) { /* giữ tên cũ */ }
  }
  return ten;
}

function layTokenZalo_() {
  return String(layBiMat_('ZaloToken') || '').trim();
}

/** Gửi một tin (tự chia nếu dài). */
function guiZalo_(token, chatId, tin) {
  chiaTin_(tin, ZALO_TOI_DA_KY_TU).forEach(function (phan) {
    goiZalo_(token, 'sendMessage', { chat_id: String(chatId), text: phan });
  });
}

/* ---------- Người nhận và mã kết nối ---------- */

/** Mã 6 ký tự dễ đọc, không có chữ dễ nhầm như O/0, I/1. */
function taoMaKetNoi_() {
  var chu = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ma = '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  for (var i = 0; i < 6; i++) ma += chu.charAt((bytes[i] + 256) % chu.length);
  return ma;
}

/**
 * Đảm bảo mỗi tài khoản có một dòng trong tab KetNoiZalo (kèm mã kết nối).
 * Trả về danh sách người nhận: [{ ten, vaiTro, ma, chatId, tenZalo }].
 */
function dongBoNguoiNhanZalo_() {
  var kq = nguoiNhanZalo_();
  if (!kq.moi.length) return kq.ds;
  // Có người mới: thêm dòng trong khoá (kiểm lại trong khoá để hai người mở cùng lúc không thêm trùng).
  return voiKhoa_(function () {
    var k = nguoiNhanZalo_();
    if (k.moi.length) themDong_('KetNoiZalo', k.moi);
    return k.ds;
  });
}
function nguoiNhanZalo_() {
  var tk = docBang_('TaiKhoan').filter(function (t) { return t.HoVaTen; });
  var ketNoi = docBang_('KetNoiZalo');
  var theoTen = {};
  ketNoi.forEach(function (k) { theoTen[String(k.HoVaTen)] = k; });
  var moi = [];
  tk.forEach(function (t) {
    if (!theoTen[String(t.HoVaTen)]) {
      var dong = { HoVaTen: String(t.HoVaTen), MaKetNoi: taoMaKetNoi_(), ChatId: '', TenZalo: '', ThoiGianKetNoi: '' };
      theoTen[dong.HoVaTen] = dong;
      moi.push(dong);
    }
  });
  return { moi: moi, ds: tk.map(function (t) {
    var k = theoTen[String(t.HoVaTen)];
    return { ten: String(t.HoVaTen), vaiTro: String(t.VaiTro), ma: String(k.MaKetNoi), chatId: String(k.ChatId || ''), tenZalo: String(k.TenZalo || '') };
  }) };
}

function trangThaiZaloCuaToi_(ten) {
  var coBot = !!layTokenZalo_();
  var toi = dongBoNguoiNhanZalo_().filter(function (n) { return n.ten === ten; })[0];
  return { coBot: coBot, tenBot: tenBotZalo_(), ma: toi ? toi.ma : '', daKetNoi: !!(toi && toi.chatId), tenZalo: toi ? toi.tenZalo : '' };
}

/**
 * Đọc các tin mới người dùng nhắn cho bot. Tin có mã kết nối thì ghi lại ID Zalo của người đó.
 * Zalo có thể không giữ lại tin nhắn gửi lúc không ai đang chờ, nên khi người dùng bấm kiểm tra thì chờ
 * thêm choGiay giây để họ nhắn mã ngay lúc đó. Lịch nhắc hằng ngày gọi với choGiay = 0 (chỉ đọc nhanh).
 * Trả về { soTin, soMoi, tinKhongMa: [{ tenZalo, noiDung }], loi } để trang Cài đặt báo rõ chuyện gì đã xảy ra.
 */
function nhanTinMoiZalo_(choGiay) {
  var token = layTokenZalo_();
  var bao = { soTin: 0, soMoi: 0, tinKhongMa: [], loi: '' };
  if (!token) return bao;
  var nguoiNhan = dongBoNguoiNhanZalo_();
  var dsMa = nguoiNhan.map(function (n) { return n.ma; });
  var hetLuc = Date.now() + (choGiay || 0) * 1000;
  for (var lan = 0; lan < 30; lan++) {
    var conLai = Math.floor((hetLuc - Date.now()) / 1000);
    var kq;
    try { kq = goiZalo_(token, 'getUpdates', { timeout: String(Math.max(1, Math.min(conLai, 20))) }); } catch (e) {
      // Không có tin mới thì Zalo trả lỗi hết giờ chờ: còn thời gian thì chờ tiếp. Lỗi khác thì báo lại.
      if (e.maLoi !== 408 && !/time ?out|hết giờ/i.test(e.message)) { bao.loi = e.message; break; }
      if (hetLuc - Date.now() < 2000) break;
      continue;
    }
    var ds = Array.isArray(kq) ? kq : (kq ? [kq] : []);
    if (!ds.length) { if (hetLuc - Date.now() < 2000) break; continue; }
    ds.forEach(function (u) {
      var m = u && u.message;
      if (!m || !m.chat || !m.chat.id) return;
      bao.soTin++;
      var ma = timMaTrongTin_(m.text, dsMa);
      var ai = nguoiNhan.filter(function (n) { return n.ma === ma; })[0];
      try {
        if (ai) {
          ghiKetNoiZalo_(ai.ten, String(m.chat.id), String((m.from && m.from.display_name) || ''));
          bao.soMoi++;
          guiZalo_(token, m.chat.id, 'Đã kết nối với app CLB ECO. Từ nay ' + ai.ten + ' sẽ nhận thông báo ở đây.');
        } else {
          if (bao.tinKhongMa.length < 5) bao.tinKhongMa.push({ tenZalo: String((m.from && m.from.display_name) || ''), noiDung: String(m.text || '(không phải chữ)').slice(0, 40) });
          guiZalo_(token, m.chat.id, 'Bot này gửi thông báo của app CLB ECO. Muốn nhận, hãy gửi mã kết nối 6 ký tự của bạn (xem trong app CLB ECO, mục Thông báo).');
        }
      } catch (e) { /* gửi trả lời lỗi thì bỏ qua, lần sau vẫn chạy tiếp */ }
    });
    if (bao.soMoi) hetLuc = Date.now(); // đã có người kết nối: đọc nốt tin còn lại rồi thôi chờ
  }
  return bao;
}

/** Bot có cài webhook thì Zalo không trả tin qua getUpdates (và không báo lỗi), nên gỡ webhook trước khi đọc. */
function boWebhookZalo_() {
  try { goiZalo_(layTokenZalo_(), 'deleteWebhook', {}); } catch (e) { /* chưa có webhook thì thôi */ }
}

/** Câu báo kết quả đọc tin để hiện trên trang. */
function moTaKiemTraZalo_(bao) {
  if (bao.loi) return 'Không đọc được tin nhắn của bot. ' + bao.loi;
  if (!bao.soTin) return 'Trong lúc chờ, bot không nhận được tin nhắn nào. Bấm kiểm tra lại, rồi trong vòng 25 giây nhắn mã cho bot (khung chat của chính bot, không phải Zalo Bot Manager).';
  var cau = 'Đã đọc ' + bao.soTin + ' tin mới, ' + bao.soMoi + ' người vừa kết nối.';
  if (bao.tinKhongMa.length) cau += ' Tin không có mã đúng: ' + bao.tinKhongMa.map(function (t) { return (t.tenZalo ? t.tenZalo + ': ' : '') + '"' + t.noiDung + '"'; }).join(', ') + '.';
  return cau;
}

function ghiKetNoiZalo_(ten, chatId, tenZalo) {
  voiKhoa_(function () {
    var sh = bangDuLieu_('KetNoiZalo');
    var v = sh.getDataRange().getValues();
    var td = v[0];
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][td.indexOf('HoVaTen')]) === ten) {
        sh.getRange(r + 1, td.indexOf('ChatId') + 1).setValue(chatId);
        sh.getRange(r + 1, td.indexOf('TenZalo') + 1).setValue(tenZalo);
        sh.getRange(r + 1, td.indexOf('ThoiGianKetNoi') + 1).setValue(chatId ? new Date() : '');
        return;
      }
    }
  });
}

/* ---------- Nhắc việc hằng ngày ---------- */

/** Lịch nhắc deadline. Chưa ai chỉnh thì dùng lịch trong tài liệu training HR (tối trước hạn 1 ngày, sáng ngày hạn, sáng sau hạn 1 ngày). */
function caiDatNhacZalo_() {
  var lich = chuanHoaLichNhac_(layCaiDat_('LichNhac'));
  if (!lich || !lich.length) lich = [{ ngay: -1, gio: 20, phut: 0 }, { ngay: 0, gio: 7, phut: 0 }, { ngay: 1, gio: 7, phut: 0 }];
  return { lich: lich, dsLuc: lucCuaLich_(lich) };
}

/** Chạy tự động mỗi ngày theo lịch. Gửi theo cách mỗi người chọn (Zalo, app, mail). Cũng chạy được bằng nút "Gửi nhắc ngay". */
/** Chỉ lịch chạy tự động mới gọi được (người ngoài không gọi thẳng từ trang web được). */
function nhacViecHangNgay(e) {
  if (!laLichChay_(e)) return null;
  return chayViec_('nhacViecHangNgay', function () { return nhacViec_(lucCuaLanChay_(e)); });
}

/** Lần chạy này ứng với giờ nhắc nào (phút trong ngày). Google có thể chạy sớm hay muộn vài phút nên tra theo mã lịch. */
function lucCuaLanChay_(e) {
  var dsLuc = caiDatNhacZalo_().dsLuc;
  try {
    var theoMa = JSON.parse(layCaiDat_('LichNhacTheoMa') || '{}');
    var l = theoMa[String(e.triggerUid)];
    if (typeof l === 'number' && dsLuc.indexOf(l) >= 0) return l;
  } catch (x) { /* tra theo giờ hiện tại */ }
  var bayGio = Number(Utilities.formatDate(new Date(), muiGio_(), 'H')) * 60 + Number(Utilities.formatDate(new Date(), muiGio_(), 'm'));
  var gan = dsLuc[0], lech = 1e9;
  dsLuc.forEach(function (l) { var d = Math.abs(bayGio - l); d = Math.min(d, 1440 - d); if (d < lech) { lech = d; gan = l; } });
  return gan;
}

/** luc: phút trong ngày của lần nhắc theo lịch; bỏ trống (nút "Gửi nhắc ngay") thì gửi mọi mốc của hôm nay. */
function nhacViec_(luc) {
  if (layTokenZalo_()) { try { nhanTinMoiZalo_(); } catch (e) { /* vẫn nhắc những người đã kết nối */ } }
  try { donThongBaoCu_(); } catch (e) { /* bỏ qua */ }
  var cd = caiDatNhacZalo_();
  var hom = homNay_();
  var canNhac = chonTaskTheoLich_(docTask_(), hom, cd.lich, luc == null ? null : luc);
  var nguoiNhan = nguoiNhanThongBao_();
  // HR phụ trách được nhắc task của ban và thành viên mình phụ trách (cách nhắc chính).
  // Ai bật "Tự nhắc task của tôi" trong Cài đặt thì được nhắc thêm task của chính mình.
  // Ban không có HR phụ trách (trong cơ cấu ban, ví dụ ban HR) thì BOD có chức vụ ghi tên nhóm ban đó
  // (ví dụ "Head HR") được nhắc task của thành viên ban đó.
  var banTuQuan = CO_CAU.ban.filter(function (b) { return b.dangDung && !b.laBod && !b.phuTrach; }).map(function (b) { return b.nhom; });
  var taiKhoan = docBang_('TaiKhoan'), banCua = {}, chucVuTheoEmail = {};
  docBang_('ThanhVien').forEach(function (t) {
    banCua[String(t.HoVaTen)] = String(t.Ban);
    if (t.Email) chucVuTheoEmail[String(t.Email).toLowerCase()] = String(t.ChucVu || '');
  });
  var tkTheoEmail = {};
  taiKhoan.forEach(function (t) { tkTheoEmail[String(t.Email).toLowerCase()] = t; });

  var daGui = 0, loi = [];
  nguoiNhan.forEach(function (n) {
    var cuaToi = n.tuNhac ? soanTinNhac_(n.ten, canNhac.filter(function (t) { return t.nguoi === n.ten; }), hom, false) : '';
    var khac = [];
    if (n.vaiTro === 'BOD') {
      var cv = chuanChu_(chucVuTheoEmail[n.email.toLowerCase()]).split(/[^A-Z0-9]+/);
      var quan = banTuQuan.filter(function (b) { return cv.indexOf(b) >= 0; });
      khac = canNhac.filter(function (t) { return quan.indexOf(nhomBan_(banCua[t.nguoi])) >= 0 && t.nguoi !== n.ten; });
    } else if (n.vaiTro === 'HR') {
      var pv = phamViHr_(tkTheoEmail[n.email.toLowerCase()], banCua);
      khac = canNhac.filter(function (t) { return t.nguoi !== n.ten && pv.thuoc(t.nguoi); });
    }
    var tin = [cuaToi, soanTinNhac_(n.ten, khac, hom, true)].filter(String).join('\n\n');
    if (!tin) return;
    try { if (guiThongBao_(n, 'Nhắc việc', tin)) daGui++; else loi.push(n.ten + ': chưa có cách nhận nào dùng được'); } catch (e) { loi.push(n.ten + ': ' + e.message); }
  });
  datCaiDat_('ZaloLanNhacCuoi', JSON.stringify({ luc: Date.now(), daGui: daGui, loi: loi.slice(0, 5) }));
  return { daGui: daGui, loi: loi };
}

/** Cài lịch chạy nhacViecHangNgay mỗi ngày vào các thời điểm đã chọn (thay lịch cũ nếu có). dsLuc: phút trong ngày. */
function caiLichNhac_(dsLuc) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nhacViecHangNgay') ScriptApp.deleteTrigger(t);
  });
  var theoMa = {};
  dsLuc.forEach(function (l) {
    var t = ScriptApp.newTrigger('nhacViecHangNgay').timeBased().atHour(Math.floor(l / 60)).nearMinute(l % 60).everyDays(1).inTimezone(muiGio_()).create();
    theoMa[t.getUniqueId()] = l;
  });
  datCaiDat_('LichNhacTheoMa', JSON.stringify(theoMa));
}

function coLichNhac_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'nhacViecHangNgay'; });
}

/* ---------- Gọi từ app CLB ECO ---------- */

function layCaiDatZalo(phien) {
  canDangNhap_(phien, 'caidat');
  var cd = caiDatNhacZalo_();
  var lanCuoi = null;
  try { lanCuoi = JSON.parse(layCaiDat_('ZaloLanNhacCuoi') || 'null'); } catch (e) { lanCuoi = null; }
  return {
    coBot: !!layTokenZalo_(), tenBot: tenBotZalo_(), coLich: coLichNhac_(),
    lich: cd.lich, lanCuoi: lanCuoi,
    nguoiNhan: dongBoNguoiNhanZalo_().map(function (n) { return { ten: n.ten, vaiTro: n.vaiTro, ma: n.ma, daKetNoi: !!n.chatId, tenZalo: n.tenZalo }; })
  };
}

/** Lưu mã bot Zalo. token để trống nghĩa là giữ mã bot cũ. */
function luuCaiDatZalo(phien, cd) {
  canDangNhap_(phien, 'caidat');
  cd = cd || {};
  if (cd.lich !== undefined) luuNhacViec(phien, cd);
  var token = String(cd.token || '').trim();
  if (token && token !== layTokenZalo_()) {
    var bot;
    try { bot = goiZalo_(token, 'getMe', {}); } catch (e) { throw new Error('Mã bot không dùng được. Bạn kiểm tra lại đã chép đủ mã chưa. (' + e.message + ')'); }
    datBiMat_('ZaloToken', token);
    datCaiDat_('ZaloTenBot', tenHienThiBot_(bot));
    boWebhookZalo_();
    // Bot mới thì mọi người phải nhắn mã kết nối lại.
    voiKhoa_(function () {
      var ds = docBang_('KetNoiZalo').map(function (k) { k.ChatId = ''; k.TenZalo = ''; k.ThoiGianKetNoi = ''; return k; });
      ghiDeBang_('KetNoiZalo', ds);
    });
  }
  damBaoLichNhac_();
  return true;
}

/**
 * Thời điểm nhắc deadline (BOD chỉnh): bao nhiêu ngày trước hạn thì task hiện "sắp đến hạn",
 * và lịch nhắc gồm nhiều mốc, mỗi mốc là một ngày (so với hạn chót) và một giờ riêng.
 */
function luuNhacViec(phien, cd) {
  canDangNhap_(phien, 'caidat');
  cd = cd || {};
  var lich = chuanHoaLichNhac_(cd.lich);
  if (!lich || !lich.length) throw new Error('Cần ít nhất một mốc nhắc.');
  var dsLuc = lucCuaLich_(lich);
  if (dsLuc.length > TOI_DA_GIO_NHAC) throw new Error('Các mốc chỉ được dùng tối đa ' + TOI_DA_GIO_NHAC + ' giờ khác nhau. Bạn gộp bớt giờ giống nhau nhé.');
  datCaiDat_('LichNhac', JSON.stringify(lich));
  caiLichNhac_(dsLuc);
  return true;
}

/** Đọc tin mới gửi bot để kết nối. Ai đăng nhập cũng bấm được (để tự kết nối). */
function kiemTraKetNoiZalo(phien) {
  var tk = canDangNhap_(phien);
  if (!layTokenZalo_()) throw new Error('Chưa có bot Zalo. Nhờ BOD nhập mã bot trong Cài đặt.');
  boWebhookZalo_();
  var bao = nhanTinMoiZalo_(25);
  var kq = trangThaiZaloCuaToi_(String(tk.HoVaTen));
  kq.baoCao = moTaKiemTraZalo_(bao);
  kq.loi = !!bao.loi;
  return kq;
}

function guiTinThuZalo(phien, ten) {
  canDangNhap_(phien, 'caidat');
  var token = layTokenZalo_();
  var n = dongBoNguoiNhanZalo_().filter(function (x) { return x.ten === ten; })[0];
  if (!token || !n || !n.chatId) throw new Error(ten + ' chưa kết nối Zalo.');
  guiZalo_(token, n.chatId, 'CLB ECO: đây là tin nhắn thử. Bạn sẽ nhận thông báo ở đây.');
  return true;
}

function goKetNoiZalo(phien, ten) {
  canDangNhap_(phien, 'caidat');
  ghiKetNoiZalo_(ten, '', '');
  return true;
}

function guiNhacNgay(phien) {
  canDangNhap_(phien, 'caidat');
  return nhacViec_();
}
