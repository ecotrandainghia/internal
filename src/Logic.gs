/**
 * Các hàm xử lý thuần (không gọi dịch vụ Google), dùng chung cho cả hệ thống.
 * Tách riêng để kiểm tra được bằng máy tính (xem thư mục tests).
 *
 * Mọi con số và quy tắc CLB có thể đổi (cơ cấu ban, phần trăm đạt KPI, số giai đoạn, bảng kết quả task...)
 * nằm ở CO_CAU và QUY_TAC bên dưới. Đây chỉ là giá trị mặc định: khi app chạy, máy chủ nạp giá trị BOD đã
 * chỉnh trong Cài đặt (napCauHinh_ ở DuLieu.gs) đè lên. Không ai phải sửa code để đổi quy tắc.
 */

/* ===================== Cơ cấu ban và quy tắc (mặc định) ===================== */

/**
 * Các ban của CLB, theo thứ tự hiện trong app.
 * ma: tên ban ghi trong danh sách thành viên (cột Ban). nhom: gộp ban (PR CAP, PR DES, PR PHO là nhóm PR).
 * vietTat: chữ dùng trong mã thành viên. laBod: ban điều hành (không tính điểm, KPI; có mọi quyền).
 * phuTrach: HR được BOD giao phụ trách ban này. dangDung: false là ban cũ đã giải thể (giữ để xem lại dữ liệu cũ).
 */
var CO_CAU_MAC_DINH = [
  { ma: 'BOD', ten: 'Ban điều hành', nhom: 'BOD', vietTat: 'BOD', laBod: true, phuTrach: false, dangDung: true },
  { ma: 'PG', ten: 'Ban Chương trình', nhom: 'PG', vietTat: 'PG', laBod: false, phuTrach: true, dangDung: true },
  { ma: 'PR CAP', ten: 'PR Caption', nhom: 'PR', vietTat: 'CAP', laBod: false, phuTrach: true, dangDung: true },
  { ma: 'PR DES', ten: 'PR Design', nhom: 'PR', vietTat: 'DES', laBod: false, phuTrach: true, dangDung: true },
  { ma: 'PR PHO', ten: 'PR Photo', nhom: 'PR', vietTat: 'PHO', laBod: false, phuTrach: true, dangDung: true },
  { ma: 'AD', ten: 'Ban Đối ngoại', nhom: 'AD', vietTat: 'AD', laBod: false, phuTrach: true, dangDung: true },
  { ma: 'HR', ten: 'Ban Nhân sự', nhom: 'HR', vietTat: 'HR', laBod: false, phuTrach: false, dangDung: true }
];
var CO_CAU = { ban: CO_CAU_MAC_DINH };

/** Bảng kết quả một task theo đúng hạn và chất lượng (quy chế 2026-2027). BOD sửa được trong Cài đặt. */
var MA_TRAN_TASK_MAC_DINH = {
  'Đúng hạn': { 'Hoàn chỉnh': 'Đạt', 'Cần chỉnh sửa': 'Đạt', 'Làm quá sơ sài': 'Chưa đạt' },
  'Trễ hạn': { 'Hoàn chỉnh': 'Đạt', 'Cần chỉnh sửa': 'Chưa đạt', 'Làm quá sơ sài': 'Chưa đạt' }
};

/**
 * Quy tắc tính điểm, KPI, chứng nhận. Mỗi nhiệm kỳ giữ một bản riêng (bảng NhiemKy, cột QuyTac):
 * đổi quy tắc chỉ đổi nhiệm kỳ đang chạy, nhiệm kỳ cũ vẫn xem lại đúng như lúc đó.
 */
var QUY_TAC_MAC_DINH = {
  soGiaiDoan: 2,          // số giai đoạn (số đợt tuyển) mỗi nhiệm kỳ, 1 đến 4
  diemVe0: true,          // mỗi giai đoạn xếp hạng riêng (điểm tính lại từ 0); tắt thì xếp hạng theo điểm cộng dồn cả nhiệm kỳ
  tiLeTop: 15,            // khen thưởng top bao nhiêu % mỗi giai đoạn
  datTask: 80,            // KPI task đạt từ bao nhiêu %
  datLog: 80,             // KPI log đạt từ bao nhiêu %
  theoBan: {},            // phần trăm đạt riêng cho từng ban: { 'HR': { datTask: 70 } }
  mucBuTru: 60,           // mỗi phần từ bao nhiêu % thì được xét bù trừ
  tiLeBuTru: 40,          // lọt top bao nhiêu % bảng bù trừ thì được cấp chứng nhận
  maTran: MA_TRAN_TASK_MAC_DINH,
  giaHanNgay: 1,          // xin gia hạn trước hạn chót ít nhất bao nhiêu ngày (1 ngày = 24 giờ)
  sapDenHanNgay: 2,       // còn bao nhiêu ngày thì task hiện "sắp đến hạn"
  khtSauNgay: 1,          // trễ quá bao nhiêu ngày thì task tính là không hoàn thành
  seedingGio: 48,         // react, comment trong bao nhiêu giờ đầu thì được cộng
  seedingQuaNgay: 7,      // bài đăng quá bao nhiêu ngày thì cảnh báo
  thoiLuongBuoi: [90, 180] // các thời lượng buổi log (phút); mỗi thời lượng gắn với một loại điểm log vượt
};
var QUY_TAC = chepSau_(QUY_TAC_MAC_DINH);

function chepSau_(o) { return JSON.parse(JSON.stringify(o)); }

/** Dùng cơ cấu ban và quy tắc BOD đã lưu (máy chủ gọi khi nạp cấu hình). Không truyền gì thì về mặc định. */
function apCauHinh_(dsBan, quyTac) {
  CO_CAU.ban = dsBan && dsBan.length ? dsBan : CO_CAU_MAC_DINH;
  QUY_TAC = chuanHoaQuyTac_(quyTac);
}

/** Ghép quy tắc BOD đã lưu (có thể thiếu mục) với mặc định, bỏ giá trị sai. */
function chuanHoaQuyTac_(luu) {
  var q = chepSau_(QUY_TAC_MAC_DINH);
  var x = luu;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { x = null; } }
  if (!x || typeof x !== 'object') return q;
  var so = function (k, min, max, nguyen) {
    if (x[k] === undefined || x[k] === null || x[k] === '') return;
    var n = Number(x[k]);
    if (isFinite(n) && n >= min && n <= max && (!nguyen || Math.floor(n) === n)) q[k] = n;
  };
  so('soGiaiDoan', 1, 4, true); so('tiLeTop', 0, 100); so('datTask', 0, 100); so('datLog', 0, 100);
  so('mucBuTru', 0, 100); so('tiLeBuTru', 0, 100); so('giaHanNgay', 0, 14, true); so('sapDenHanNgay', 0, 30, true);
  so('khtSauNgay', 0, 60, true); so('seedingGio', 1, 720, true); so('seedingQuaNgay', 1, 60, true);
  if (typeof x.diemVe0 === 'boolean') q.diemVe0 = x.diemVe0;
  if (x.theoBan && typeof x.theoBan === 'object') {
    q.theoBan = {};
    Object.keys(x.theoBan).forEach(function (b) {
      var r = x.theoBan[b] || {}, kq = {};
      ['datTask', 'datLog'].forEach(function (k) { var n = Number(r[k]); if (r[k] !== '' && r[k] !== null && r[k] !== undefined && isFinite(n) && n >= 0 && n <= 100) kq[k] = n; });
      if (Object.keys(kq).length) q.theoBan[chuanChu_(b)] = kq;
    });
  }
  if (x.maTran && typeof x.maTran === 'object') {
    Object.keys(q.maTran).forEach(function (h) {
      Object.keys(q.maTran[h]).forEach(function (c) {
        var v = x.maTran[h] && x.maTran[h][c];
        if (v === 'Đạt' || v === 'Chưa đạt') q.maTran[h][c] = v;
      });
    });
  }
  if (Array.isArray(x.thoiLuongBuoi)) {
    var tl = [];
    x.thoiLuongBuoi.forEach(function (n) { n = Math.round(Number(n)); if (n >= 15 && n <= 600 && tl.indexOf(n) < 0) tl.push(n); });
    if (tl.length) q.thoiLuongBuoi = tl.sort(function (a, b) { return a - b; }).slice(0, 4);
  }
  return q;
}

/** Phần trăm đạt KPI task hoặc log (khoa 'datTask' / 'datLog') của một ban: riêng của ban (hoặc nhóm ban), không có thì chung. */
function mucDatCua_(ban, khoa, qt) {
  qt = qt || QUY_TAC;
  var tb = qt.theoBan || {}, b = chuanChu_(ban), n = nhomBan_(ban);
  if (tb[b] && tb[b][khoa] !== undefined) return tb[b][khoa];
  if (tb[n] && tb[n][khoa] !== undefined) return tb[n][khoa];
  return qt[khoa];
}

/** Kiểm tra danh sách ban do BOD sửa. Trả về { ds, loi }. */
function chuanHoaCoCau_(ds) {
  var kq = [], daCo = {}, daVt = {};
  for (var i = 0; i < (ds || []).length; i++) {
    var b = ds[i] || {};
    var ma = chuanChu_(b.ma);
    if (!ma) continue;
    if (ma.length > 20) return { ds: [], loi: 'Tên ban "' + ma + '" dài quá 20 ký tự.' };
    if (daCo[ma]) return { ds: [], loi: 'Ban "' + ma + '" bị trùng.' };
    var vt = chuanChu_(b.vietTat || ma).replace(/[^A-Z0-9]/g, '');
    if (!vt || vt.length > 6) return { ds: [], loi: 'Chữ viết tắt của ban "' + ma + '" phải có 1 đến 6 chữ cái hoặc số (dùng trong mã thành viên).' };
    if (daVt[vt]) return { ds: [], loi: 'Hai ban "' + daVt[vt] + '" và "' + ma + '" cùng chữ viết tắt ' + vt + '.' };
    daCo[ma] = true; daVt[vt] = ma;
    kq.push({
      ma: ma, ten: String(b.ten || '').trim().slice(0, 60) || ma, nhom: chuanChu_(b.nhom) || ma.split(' ')[0], vietTat: vt,
      laBod: !!b.laBod, phuTrach: !b.laBod && b.phuTrach !== false, dangDung: b.dangDung !== false
    });
  }
  if (!kq.some(function (b) { return b.laBod && b.dangDung; })) return { ds: [], loi: 'Cần có một ban điều hành (BOD) đang dùng.' };
  return { ds: kq, loi: '' };
}

/** Ban trong cơ cấu theo tên ghi ở danh sách thành viên (khớp mã ban hoặc tên đầy đủ, không phân biệt hoa thường). */
function timBan_(ban) {
  var s = chuanChu_(ban);
  if (!s) return null;
  var ds = CO_CAU.ban;
  for (var i = 0; i < ds.length; i++) if (ds[i].ma === s) return ds[i];
  for (var j = 0; j < ds.length; j++) if (chuanChu_(ds[j].ten) === s) return ds[j];
  return null;
}

/* ===================== Danh sách thành viên ===================== */

/**
 * Cột của sheet nguồn danh sách thành viên: [tên cột trong hệ thống, tên cột trên sheet nguồn, các tên khác được chấp nhận].
 * Không lấy số điện thoại phụ huynh và nơi sống: app không cần, không giữ để bớt dữ liệu riêng tư.
 */
var COT_THANH_VIEN = [
  ['MaTV', 'Mã thành viên', 'Mã TV', 'Mã'],
  ['HoVaTen', 'Họ và tên', 'Họ tên'],
  ['Lop', 'Lớp'],
  ['Ban', 'Ban'],
  ['ChucVu', 'Chức vụ'],
  ['NgaySinh', 'Ngày sinh'],
  ['SoDienThoai', 'Số điện thoại', 'Số điện thoại cá nhân', 'SĐT'],
  ['Email', 'Email', 'Gmail'],
  ['LinkFacebook', 'Link Facebook'],
  ['TenFacebook', 'Tên Facebook']
];
/** Cột hồ sơ lấy từ sheet nguồn (trừ mã thành viên, do app cấp). */
var COT_HO_SO = COT_THANH_VIEN.map(function (c) { return c[0]; }).filter(function (k) { return k !== 'MaTV'; });

/** Cột bắt buộc phải có trên sheet nguồn. */
var COT_BAT_BUOC = ['HoVaTen', 'Ban'];

var TRANG_THAI_TV = { DANG: 'Đang hoạt động', ROI: 'Đã rời' };
var LOAI_TV = { CHINH_THUC: 'Chính thức', BO_SUNG: 'Bổ sung' };

/**
 * Các tab trong file dữ liệu và tên cột của từng tab.
 * Dữ liệu chỉ thêm, không xoá: người rời CLB đổi TrangThai; mỗi dòng điểm, task đều ghi nhiệm kỳ và mã thành viên
 * để 10 năm sau vẫn tra được. Dòng của nhiệm kỳ đã xong lâu được chuyển sang file lưu trữ riêng của nhiệm kỳ đó.
 */
var BANG = {
  ThanhVien: ['MaTV'].concat(COT_HO_SO).concat(['LoaiThanhVien', 'GiaiDoanVao', 'TrangThai', 'NgayVao', 'NgayRoi']),
  ThanhVienGiaiDoan: ['NhiemKy', 'GiaiDoan', 'MaTV', 'HoVaTen', 'Ban', 'ChucVu', 'LoaiThanhVien'],
  NhiemKy: ['NhiemKy', 'BatDau', 'QuyTac', 'IdLuuTru', 'NgayLuuTru'],
  GiaiDoan: ['NhiemKy', 'GiaiDoan', 'BatDau', 'KieuTai'],
  KetQuaNhiemKy: ['NhiemKy', 'MaTV', 'HoVaTen', 'Ban', 'LoaiThanhVien', 'DiemTheoGiaiDoan', 'DiemCaKy', 'Top', 'KpiTask', 'KpiLog', 'ChungNhan', 'ThoiGian'],
  Ban: ['MaBan', 'TenBan', 'Nhom', 'VietTat', 'LaBod', 'PhuTrach', 'DangDung', 'ThuTu'],
  LanTai: ['ThoiGian', 'NhiemKy', 'KieuChon', 'Kieu', 'SoThem', 'SoSua', 'SoAn', 'TongSo', 'NguoiTai'],
  DoiBan: ['ThoiGian', 'MaTV', 'HoVaTen', 'BanCu', 'BanMoi'],
  SinhNhat: ['MaTV', 'HoVaTen', 'NgaySinh', 'TieuDe', 'MaSuKien', 'NhiemKy'],
  LichSuDiem: ['ThoiGian', 'MaTV', 'HoVaTen', 'LoaiHoatDong', 'TenHoatDong', 'Diem', 'NguoiCong', 'NhiemKy', 'GiaiDoan'],
  LoaiHoatDong: ['TenLoai', 'Diem', 'CongTay', 'GioiHan', 'DungCho'],
  BangGhim: ['TieuDe', 'DuongDan'],
  GopY: ['ThoiGian', 'NoiDung', 'DaDoc', 'HoVaTen', 'DaDung', 'NguoiDanhDau'],
  BaoCaoSeeding: ['ThoiGian', 'NguoiNop', 'LinkBai', 'LucDang', 'React', 'Comment', 'KhongKhop', 'TrangThai', 'NguoiHuy'],
  TaiKhoan: ['Email', 'MaTV', 'HoVaTen', 'VaiTro', 'MatKhau', 'Muoi', 'NgayTao', 'NhanThongBao', 'GiaoDien', 'BanQuanLy', 'NhomHr', 'TuNhac'],
  CaiDat: ['Khoa', 'GiaTri'],
  Task: ['ThoiGianTao', 'TenTask', 'MoTa', 'HanChot', 'MaTV', 'NguoiPhuTrach', 'NguoiTao', 'KieuTao', 'TrangThai', 'ThoiGianXong',
    'NgayNop', 'HanGoc', 'NgayXinGiaHan', 'ChatLuong', 'DauHieu', 'NguoiDanhGia', 'LucDanhGia', 'PhanHoi', 'HrPhuTrach'],
  NhacSeeding: ['ThoiGian', 'Email', 'HoVaTen', 'LinkBai', 'LucDang', 'LucNhac', 'DaNhac'],
  AnhDaiDien: ['Email', 'Anh', 'ThoiGian'],
  KetNoiZalo: ['HoVaTen', 'MaKetNoi', 'ChatId', 'TenZalo', 'ThoiGianKetNoi'],
  ViecMail: ['ThoiGian', 'NguoiTao', 'ThaoTac', 'MaThu', 'TieuDeThu', 'Den', 'Cc', 'Bcc', 'TieuDe', 'NoiDung', 'Nhan', 'DinhKem', 'TrangThai', 'GhiChu', 'NguoiDuyet', 'ThoiGianDuyet', 'TuyChon'],
  DanhBa: ['Nhom', 'Ten', 'Email', 'GhiChu'],
  LichGui: ['ThoiGianTao', 'ThoiGianGui', 'TieuDe', 'NoiDung', 'NguoiNhan', 'MoTaNguon', 'NguoiTao', 'TrangThai', 'KetQua', 'MaNhap'],
  FileLog: ['ThoiGian', 'TenFile', 'DuongDan', 'SoNguoi', 'SoBuoi', 'NguoiTao'],
  SuKienLog: ['ThoiGian', 'TenSuKien', 'SoBuoiDuKien', 'GiaoMacDinh', 'GiaoRieng', 'LinkDangKy', 'NguoiTao', 'TrangThai', 'ChotLuc', 'NguoiChot'],
  BuoiLog: ['ThoiGian', 'SuKien', 'TenBuoi', 'Ngay', 'ThoiLuong', 'TrangThai', 'DangKy', 'CoMat'],
  ThietBi: ['Email', 'DiaChi', 'Khoa', 'TenMay', 'ThoiGian', 'LayCuoi', 'P256dh', 'Auth'],
  ThongBao: ['ThoiGian', 'Email', 'TieuDe', 'NoiDung'],
  NhatKyHeThong: ['ThoiGian', 'Viec', 'KetQua', 'ChiTiet', 'ThoiGianChay']
};

/**
 * Bảng có dòng gắn với thời gian, được chuyển sang file lưu trữ khi nhiệm kỳ đã xong lâu: [tên bảng, cột thời gian].
 * Bảng không có ở đây (thành viên, tài khoản, cài đặt, kết quả nhiệm kỳ…) luôn ở file chính.
 */
var BANG_LUU_TRU = [['LichSuDiem', 'ThoiGian'], ['Task', 'ThoiGianTao'], ['GopY', 'ThoiGian'], ['BaoCaoSeeding', 'ThoiGian'],
  ['NhacSeeding', 'ThoiGian'], ['SuKienLog', 'ThoiGian'], ['BuoiLog', 'ThoiGian'], ['FileLog', 'ThoiGian'], ['ViecMail', 'ThoiGian'],
  ['LichGui', 'ThoiGianTao'], ['ThongBao', 'ThoiGian'], ['DoiBan', 'ThoiGian'], ['LanTai', 'ThoiGian'], ['ThanhVienGiaiDoan', '']];

/**
 * Kiểu tải danh sách thành viên: Oday, rồi mỗi đợt tuyển mở một giai đoạn (đợt 1 mở giai đoạn 1, đợt 2 mở giai đoạn 2…),
 * mỗi nhiệm kỳ mỗi kiểu một lần, theo thứ tự. Cập nhật: sửa thông tin, thêm người bị sót, đánh dấu người đã rời; không đổi giai đoạn.
 */
var KIEU_TAI = { ODAY: 'Sau Oday', CAP_NHAT: 'Cập nhật', DOT1: 'Sau tuyển đợt 1', DOT2: 'Sau tuyển đợt 2' };
function kieuDot_(n) { return 'Sau tuyển đợt ' + n; }
/** Số đợt của một kiểu tải: Oday 0, đợt n là n, Cập nhật hay kiểu lạ là -1. */
function soDotCua_(kieu) {
  if (kieu === KIEU_TAI.ODAY) return 0;
  var m = /^Sau tuyển đợt (\d)$/.exec(String(kieu || ''));
  return m ? Number(m[1]) : -1;
}
/** Các kiểu tải theo số giai đoạn mỗi nhiệm kỳ. */
function cacKieuTai_(soGiaiDoan) {
  var ds = [KIEU_TAI.ODAY];
  for (var i = 1; i <= soGiaiDoan; i++) ds.push(kieuDot_(i));
  return ds.concat([KIEU_TAI.CAP_NHAT]);
}
function tenDot_(kieu) { var n = soDotCua_(kieu); return n === 0 ? 'Oday' : n > 0 ? 'Đợt ' + n : String(kieu); }

/** Nhiệm kỳ "2026-2027" có đúng dạng không. */
function nhiemKyHopLe_(s) {
  var m = /^(\d{4})-(\d{4})$/.exec(String(s || '').trim());
  return !!m && Number(m[2]) === Number(m[1]) + 1;
}
function nhiemKySau_(nk) { var y = Number(String(nk).slice(0, 4)); return (y + 1) + '-' + (y + 2); }

/**
 * Nhiệm kỳ gợi ý cho một lần tải. Oday hay đợt 1 khi nhiệm kỳ gần nhất đã có đợt 1 (hoặc đã có kiểu đó) là nhiệm kỳ mới;
 * còn lại là nhiệm kỳ gần nhất. Chưa có nhiệm kỳ nào thì theo năm học của ngày tải (từ tháng 8 là năm học mới).
 * @param {Array<Object>} lanTai các dòng LanTai (NhiemKy, Kieu)
 */
function goiYNhiemKy_(kieu, ngay, lanTai) {
  var ds = (lanTai || []).filter(function (l) { return nhiemKyHopLe_(l.NhiemKy); });
  if (!ds.length) return tenNhiemKy_(ngay);
  var gan = ds.map(function (l) { return String(l.NhiemKy); }).sort().pop();
  var dot = soDotCua_(kieu);
  if (dot === 0 || dot === 1) {
    var daLam = ds.filter(function (l) { return String(l.NhiemKy) === gan; }).map(function (l) { return soDotCua_(l.Kieu); });
    if (daLam.some(function (d) { return d >= 1 || d === dot; })) return nhiemKySau_(gan);
  }
  return gan;
}

/**
 * Kiểu tải thực sự trong một nhiệm kỳ. Oday hay một đợt đã làm (hoặc đã làm đợt sau nó) thì tự chuyển thành Cập nhật.
 * @return {{kieu:string, nhiemKy:string, doiThanhCapNhat:boolean, daLam:Array<number>, dauNhiemKy:boolean, loi:string}}
 */
function kieuTaiThucTe_(kieu, nhiemKy, lanTai, soGiaiDoan) {
  var dot = soDotCua_(kieu);
  var kq = { kieu: kieu, nhiemKy: String(nhiemKy || ''), doiThanhCapNhat: false, daLam: [], dauNhiemKy: false, loi: '' };
  if (!nhiemKyHopLe_(kq.nhiemKy)) { kq.loi = 'Nhiệm kỳ phải có dạng 2026-2027.'; return kq; }
  (lanTai || []).forEach(function (l) {
    var d = soDotCua_(l.Kieu);
    if (String(l.NhiemKy) === kq.nhiemKy && d >= 0 && kq.daLam.indexOf(d) < 0) kq.daLam.push(d);
  });
  kq.daLam.sort();
  if (kieu === KIEU_TAI.CAP_NHAT) return kq;
  if (dot < 0 || dot > (soGiaiDoan || QUY_TAC.soGiaiDoan)) { kq.loi = 'Kiểu tải không hợp lệ.'; return kq; }
  if (kq.daLam.some(function (d) { return d >= dot; })) { kq.kieu = KIEU_TAI.CAP_NHAT; kq.doiThanhCapNhat = true; return kq; }
  if (dot >= 2 && kq.daLam.indexOf(dot - 1) < 0) { kq.loi = 'Nhiệm kỳ ' + kq.nhiemKy + ' chưa tải "' + kieuDot_(dot - 1) + '". Tải đợt trước trước nhé.'; return kq; }
  // Lần tải đầu của nhiệm kỳ (Oday, hoặc đợt 1 khi không có Oday): mọi người đang ở lại thành thành viên chính thức của nhiệm kỳ mới.
  kq.dauNhiemKy = dot <= 1 && !kq.daLam.length;
  return kq;
}

/** Đưa giá trị một ô về chữ để so sánh (ngày thì dạng yyyy-mm-dd). */
function chuOSoSanh_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.getFullYear() + '-' + (v.getMonth() + 1) + '-' + v.getDate();
  return String(v == null ? '' : v).trim();
}

/**
 * Mã thành viên: năm vào CLB (2 số cuối năm đầu nhiệm kỳ) - đợt vào (0 là Oday) - ban lúc vào - số thứ tự.
 * Ví dụ 26-1-PG-07: vào nhiệm kỳ 2026-2027, đợt 1, ban PG, người thứ 7. Mã không bao giờ đổi, không cấp lại cho người khác,
 * kể cả khi người đó đổi ban hay rời CLB.
 */
function maThanhVienMoi_(nhiemKy, dot, vietTat, daCo) {
  var dau = String(nhiemKy).slice(2, 4) + '-' + Math.max(0, Number(dot) || 0) + '-' + String(vietTat || 'TV').toUpperCase() + '-';
  var lon = 0;
  Object.keys(daCo || {}).forEach(function (m) {
    if (m.indexOf(dau) !== 0) return;
    var n = Number(m.slice(dau.length));
    if (n > lon) lon = n;
  });
  var so = lon + 1;
  return dau + (so < 10 ? '0' + so : String(so));
}

/** Đọc mã thành viên: năm vào, đợt vào, ban lúc vào. Mã sai dạng thì null. */
function docMaThanhVien_(ma) {
  var m = /^(\d{2})-(\d)-([A-Z0-9]{1,6})-(\d{2,})$/.exec(String(ma || '').trim().toUpperCase());
  if (!m) return null;
  return { nam: 2000 + Number(m[1]), nhiemKy: (2000 + Number(m[1])) + '-' + (2001 + Number(m[1])), dot: Number(m[2]), ban: m[3], so: Number(m[4]) };
}

/**
 * Kế hoạch một lần tải danh sách: người trong danh sách mới được nhận ra theo mã thành viên (nếu sheet nguồn có cột này),
 * rồi theo email, rồi theo họ tên. Người mới được cấp mã; người không còn trong danh sách được đánh dấu Đã rời (giữ nguyên hồ sơ).
 * @param {Array<Object>} moi danh sách đọc từ sheet nguồn (docDanhSachThanhVien_)
 * @param {Array<Object>} tatCa toàn bộ bảng ThanhVien (cả người đã rời)
 * @param {{kieu:string, nhiemKy:string, dauNhiemKy:boolean, giaiDoan:number, bayGio:Date}} o
 *   giaiDoan: giai đoạn đang chạy sau lần tải này (0 nếu chưa có).
 * @return {{ds:Array<Object>, them:Array, sua:Array, roi:Array, quayLai:Array, doiBan:Array, banLa:Array<string>, loi:Array<string>}}
 */
function keHoachTaiDanhSach_(moi, tatCa, o) {
  var kq = { ds: [], them: [], sua: [], roi: [], quayLai: [], doiBan: [], banLa: [], loi: [] };
  var theoMa = {}, theoEmail = {}, theoTen = {}, daCoMa = {};
  var dangHd = function (t) { return String(t.TrangThai || TRANG_THAI_TV.DANG) !== TRANG_THAI_TV.ROI; };
  tatCa.forEach(function (t, i) {
    var ma = String(t.MaTV || '').trim().toUpperCase();
    if (ma) { theoMa[ma] = i; daCoMa[ma] = true; }
    var e = String(t.Email || '').trim().toLowerCase();
    if (e && (theoEmail[e] === undefined || dangHd(t))) theoEmail[e] = i;
    var k = String(t.HoVaTen || '').trim().toLowerCase();
    if (k && (theoTen[k] === undefined || dangHd(t))) theoTen[k] = i;
  });
  var dot = soDotCua_(o.kieu);
  // Đợt vào của người mới: Oday 0, đợt n là n; Cập nhật thì theo giai đoạn đang chạy.
  var dotVao = dot >= 0 ? dot : Math.max(0, o.giaiDoan || 0);
  var gdVaoMoi = Math.max(1, dotVao);
  var dung = {};
  var ra = tatCa.map(function (t) { var x = {}; Object.keys(t).forEach(function (k) { x[k] = t[k]; }); return x; });
  moi.forEach(function (t) {
    var ban = timBan_(t.Ban);
    if (!ban) { if (kq.banLa.indexOf(chuanChu_(t.Ban)) < 0) kq.banLa.push(chuanChu_(t.Ban)); return; }
    var ma = String(t.MaTV || '').trim().toUpperCase();
    var i;
    if (ma) {
      i = theoMa[ma];
      if (i === undefined) { kq.loi.push('Mã thành viên ' + ma + ' (' + t.HoVaTen + ') không có trong hệ thống. Xoá mã đó trên sheet nguồn nếu đây là người mới.'); return; }
    } else {
      var e = String(t.Email || '').trim().toLowerCase();
      i = e ? theoEmail[e] : undefined;
      if (i === undefined) {
        var j = theoTen[String(t.HoVaTen).trim().toLowerCase()];
        var ej = j === undefined ? '' : String(ra[j].Email || '').trim().toLowerCase();
        // Trùng tên nhưng khác email thì là hai người khác nhau.
        if (j !== undefined && !(e && ej && e !== ej)) i = j;
      }
    }
    if (i !== undefined && dung[i]) { kq.loi.push(t.HoVaTen + ' trùng với một người khác trong danh sách (cùng mã, email hoặc họ tên).'); return; }
    if (i === undefined) {
      var maMoi = maThanhVienMoi_(o.nhiemKy, dotVao, ban.vietTat, daCoMa);
      daCoMa[maMoi] = true;
      var x = { MaTV: maMoi, TrangThai: TRANG_THAI_TV.DANG, NgayVao: o.bayGio, NgayRoi: '', GiaiDoanVao: gdVaoMoi,
        LoaiThanhVien: gdVaoMoi >= 2 && !o.dauNhiemKy ? LOAI_TV.BO_SUNG : LOAI_TV.CHINH_THUC };
      COT_HO_SO.forEach(function (c) { x[c] = t[c] === undefined ? '' : t[c]; });
      x.Ban = ban.ma;
      ra.push(x);
      dung[ra.length - 1] = true;
      kq.them.push(x);
      return;
    }
    dung[i] = true;
    var c = ra[i];
    var quayLai = !dangHd(c);
    var doi = COT_HO_SO.some(function (k) { return k === 'Ban' ? chuanChu_(c.Ban) !== ban.ma : chuOSoSanh_(c[k]) !== chuOSoSanh_(t[k]); });
    if (chuanChu_(c.Ban) !== ban.ma && !quayLai) kq.doiBan.push({ MaTV: c.MaTV, HoVaTen: t.HoVaTen, BanCu: chuanChu_(c.Ban), BanMoi: ban.ma });
    COT_HO_SO.forEach(function (k) { c[k] = t[k] === undefined ? '' : t[k]; });
    c.Ban = ban.ma;
    if (o.dauNhiemKy) { c.LoaiThanhVien = LOAI_TV.CHINH_THUC; c.GiaiDoanVao = Math.max(1, dot); }
    else if (quayLai) { c.GiaiDoanVao = gdVaoMoi; c.LoaiThanhVien = gdVaoMoi >= 2 ? LOAI_TV.BO_SUNG : LOAI_TV.CHINH_THUC; }
    if (quayLai) { c.TrangThai = TRANG_THAI_TV.DANG; c.NgayRoi = ''; kq.quayLai.push(c); }
    else if (doi) kq.sua.push(c);
  });
  ra.forEach(function (t, i) {
    if (!dung[i] && dangHd(t)) { t.TrangThai = TRANG_THAI_TV.ROI; t.NgayRoi = o.bayGio; kq.roi.push(t); }
  });
  kq.ds = ra;
  return kq;
}

/** Ngày sinh từ ô sheet: ngày, hoặc chữ dd/mm/yyyy, dd-mm-yyyy, d/m, yyyy-mm-dd. Trả về { ngay, thang } hoặc null. */
function docNgaySinh_(v) {
  var d = null, m = null;
  if (Object.prototype.toString.call(v) === '[object Date]') { if (isNaN(v.getTime())) return null; d = v.getDate(); m = v.getMonth() + 1; }
  else {
    var s = String(v == null ? '' : v).trim(), x;
    if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { d = +x[3]; m = +x[2]; }
    else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/))) { d = +x[1]; m = +x[2]; }
  }
  if (!m || m < 1 || m > 12 || !d || d < 1 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) return null;
  return { ngay: d, thang: m };
}

/** Tên lịch sinh nhật của nhiệm kỳ, ví dụ "Sinh nhật 2627" cho 2026-2027. */
function tenLichSinhNhat_(nhiemKy) {
  var p = String(nhiemKy).split('-');
  return 'Sinh nhật ' + (p.length === 2 ? p[0].slice(-2) + p[1].slice(-2) : nhiemKy);
}

/**
 * Việc cần làm để lịch sinh nhật khớp danh sách thành viên (nhận ra từng người theo mã thành viên, không có thì họ tên).
 * @param {Array<Object>} daCo các dòng tab SinhNhat của nhiệm kỳ này
 * @return {{tao:Array<Object>, xoa:Array<Object>, soGiu:number, thieuNgay:Array<string>}}
 */
function keHoachSinhNhat_(thanhVien, daCo) {
  var khoa = function (t) { return String(t.MaTV || '').trim().toUpperCase() || 'ten:' + String(t.HoVaTen).trim().toLowerCase(); };
  var cu = {};
  daCo.forEach(function (r) { cu[khoa(r)] = r; });
  var kq = { tao: [], xoa: [], soGiu: 0, thieuNgay: [] };
  var conLai = {};
  thanhVien.forEach(function (t) {
    var k = khoa(t);
    var ns = docNgaySinh_(t.NgaySinh);
    if (!ns) { kq.thieuNgay.push(t.HoVaTen); return; }
    conLai[k] = true;
    var ngay = ('0' + ns.ngay).slice(-2) + '/' + ('0' + ns.thang).slice(-2);
    var tieuDe = 'Sinh nhật ' + t.HoVaTen + (t.Ban ? ' (' + t.Ban + ')' : '');
    var r = cu[k];
    if (r && String(r.NgaySinh) === ngay && String(r.TieuDe) === tieuDe && r.MaSuKien) { kq.soGiu++; return; }
    if (r && r.MaSuKien) kq.xoa.push(r);
    kq.tao.push({ MaTV: t.MaTV || '', HoVaTen: t.HoVaTen, NgaySinh: ngay, TieuDe: tieuDe, ngay: ns.ngay, thang: ns.thang, moTa: [t.Lop ? 'Lớp ' + t.Lop : '', t.LinkFacebook ? String(t.LinkFacebook) : ''].filter(String).join('\n') });
  });
  daCo.forEach(function (r) { if (!conLai[khoa(r)] && r.MaSuKien) kq.xoa.push(r); });
  return kq;
}

/** Bỏ dấu tiếng Việt. */
function boDau_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Đưa tên cột về dạng so sánh được: bỏ dấu, chữ thường, bỏ khoảng trắng và ký tự lạ. */
function chuanHoaTenCot_(s) {
  return boDau_(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function chuanChu_(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toUpperCase(); }

/** Nhóm của một ban theo cơ cấu ("PR CAP" thuộc nhóm "PR"). Ban chưa có trong cơ cấu thì lấy chữ đầu. */
function nhomBan_(ban) {
  var b = timBan_(ban);
  if (b) return b.nhom;
  return chuanChu_(ban).split(' ')[0] || '';
}

/** Thứ tự các ban theo cơ cấu (dùng ở mọi chỗ liệt kê theo ban). */
function thuTuBan_() { return CO_CAU.ban.map(function (b) { return b.ma; }); }

/**
 * Vị trí của một ban (hoặc một nhóm như "PR") trong thứ tự của cơ cấu.
 * Nhóm đứng ở chỗ ban đầu tiên của nhóm; ban lạ cùng nhóm với ban đã có đứng ngay sau nhóm đó; ban lạ hẳn đứng cuối.
 */
function hangBan_(ban) {
  var s = chuanChu_(ban), ds = CO_CAU.ban;
  for (var i = 0; i < ds.length; i++) if (ds[i].ma === s) return i;
  for (var j = 0; j < ds.length; j++) if (ds[j].nhom === s) return j;
  var nhom = s.split(' ')[0], cuoi = -1;
  ds.forEach(function (b, k) { if (b.nhom === nhom) cuoi = k; });
  return cuoi >= 0 ? cuoi + 0.5 : ds.length;
}

/** So sánh hai tên ban theo thứ tự chuẩn; ban lạ thì xếp theo chữ cái. */
function soSanhBan_(a, b) {
  return (hangBan_(a) - hangBan_(b)) || chuanChu_(a).localeCompare(chuanChu_(b));
}

/** Xếp danh sách thành viên (có Ban hoặc ban) theo thứ tự ban chuẩn; cùng ban thì giữ thứ tự cũ. */
function xepThanhVienTheoBan_(ds) {
  var banCua = function (t) { return t.Ban !== undefined ? t.Ban : t.ban; };
  return ds.map(function (t, i) { return { t: t, i: i }; })
    .sort(function (a, b) { return soSanhBan_(banCua(a.t), banCua(b.t)) || a.i - b.i; })
    .map(function (x) { return x.t; });
}

/** Ban có phải ban điều hành (BOD) không, theo cơ cấu. */
function laBanBod_(ban) {
  var b = timBan_(ban);
  return b ? !!b.laBod : chuanChu_(ban) === 'BOD';
}

/**
 * Tìm dòng tiêu đề và vị trí các cột theo tên (không phụ thuộc thứ tự cột).
 * @param {Array<Array>} values toàn bộ dữ liệu của tab nguồn
 * @return {{dongTieuDe:number, viTri:Object, thieu:Array<string>}}
 */
function nhanDienCot_(values) {
  var nhan = {};
  COT_THANH_VIEN.forEach(function (c) { c.slice(1).forEach(function (t) { nhan[chuanHoaTenCot_(t)] = c[0]; }); });
  var gioiHan = Math.min(values.length, 10);
  for (var r = 0; r < gioiHan; r++) {
    var viTri = {};
    values[r].forEach(function (o, i) {
      var khoa = nhan[chuanHoaTenCot_(o)];
      if (khoa && viTri[khoa] === undefined) viTri[khoa] = i;
    });
    if (viTri.HoVaTen !== undefined) {
      var thieu = COT_BAT_BUOC.filter(function (k) { return viTri[k] === undefined; })
        .map(function (k) { return tenHienThiCot_(k); });
      return { dongTieuDe: r, viTri: viTri, thieu: thieu };
    }
  }
  return { dongTieuDe: -1, viTri: {}, thieu: COT_BAT_BUOC.map(tenHienThiCot_) };
}

function tenHienThiCot_(khoa) {
  for (var i = 0; i < COT_THANH_VIEN.length; i++) if (COT_THANH_VIEN[i][0] === khoa) return COT_THANH_VIEN[i][1];
  return khoa;
}

/**
 * Đọc danh sách thành viên từ dữ liệu sheet nguồn.
 * Bỏ dòng trống tên, báo lỗi nếu trùng tên hoặc trùng mã.
 * @return {{thanhVien:Array<Object>, loi:Array<string>, viTri:Object, dongTieuDe:number}}
 */
function docDanhSachThanhVien_(values) {
  var nd = nhanDienCot_(values);
  if (nd.thieu.length) {
    return { thanhVien: [], loi: ['Không tìm thấy cột: ' + nd.thieu.join(', ') + '. Kiểm tra lại tên cột trên sheet nguồn.'] };
  }
  var ds = [];
  var loi = [];
  var daCo = {}, daCoMa = {};
  for (var r = nd.dongTieuDe + 1; r < values.length; r++) {
    var dong = values[r];
    var tv = {};
    COT_THANH_VIEN.forEach(function (c) {
      var i = nd.viTri[c[0]];
      var v = i === undefined ? '' : dong[i];
      tv[c[0]] = typeof v === 'string' ? v.trim() : v;
    });
    tv.HoVaTen = String(tv.HoVaTen || '').replace(/\s+/g, ' ').trim();
    if (!tv.HoVaTen) continue;
    tv.Ban = chuanChu_(tv.Ban);
    tv.Email = String(tv.Email || '').trim().toLowerCase();
    tv.MaTV = String(tv.MaTV || '').trim().toUpperCase();
    tv.dong = r + 1;
    var khoa = tv.HoVaTen.toLowerCase();
    if (daCo[khoa]) { loi.push('Tên bị trùng: ' + tv.HoVaTen + ' (dòng ' + (r + 1) + '). Thêm chữ để phân biệt, ví dụ tên lớp.'); continue; }
    if (tv.MaTV && daCoMa[tv.MaTV]) { loi.push('Mã thành viên bị trùng: ' + tv.MaTV + ' (dòng ' + (r + 1) + ').'); continue; }
    if (!tv.Ban) { loi.push(tv.HoVaTen + ' (dòng ' + (r + 1) + ') chưa có ban.'); continue; }
    daCo[khoa] = true;
    if (tv.MaTV) daCoMa[tv.MaTV] = true;
    ds.push(tv);
  }
  if (!ds.length && !loi.length) loi.push('Sheet nguồn không có thành viên nào.');
  return { thanhVien: ds, loi: loi, viTri: nd.viTri, dongTieuDe: nd.dongTieuDe };
}

/** Tên nhiệm kỳ theo năm học: từ tháng 8 trở đi tính là năm học mới. */
function tenNhiemKy_(ngay) {
  var y = ngay.getFullYear();
  return ngay.getMonth() >= 7 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
}

/** Giai đoạn mới mở sau một lần tải: đợt n mở giai đoạn n. Oday và Cập nhật không mở giai đoạn nào (null). */
function tinhKyMoi_(kieu, nhiemKy) {
  var n = soDotCua_(kieu);
  return n >= 1 ? { NhiemKy: String(nhiemKy), GiaiDoan: n } : null;
}

/** Chuyển một bảng thành chữ để cất vào bộ nhớ tạm, và đổi ngược lại. Ô ngày giờ vẫn giữ là ngày giờ. */
function maHoaBang_(ds) {
  return JSON.stringify(ds.map(function (o) {
    var x = {};
    Object.keys(o).forEach(function (k) { var v = o[k]; x[k] = Object.prototype.toString.call(v) === '[object Date]' ? { $ngay: v.getTime() } : v; });
    return x;
  }));
}
function giaiMaBang_(chuoi) {
  return JSON.parse(chuoi, function (k, v) {
    return v && typeof v === 'object' && typeof v.$ngay === 'number' && Object.keys(v).length === 1 ? new Date(v.$ngay) : v;
  });
}

/** Biến các dòng của một tab (có dòng tiêu đề) thành danh sách đối tượng. */
function dongThanhDoiTuong_(values) {
  if (!values || values.length < 2) return [];
  var tieuDe = values[0];
  return values.slice(1).filter(function (d) {
    return d.some(function (o) { return o !== '' && o !== null; });
  }).map(function (d) {
    var o = {};
    tieuDe.forEach(function (t, i) { if (t) o[t] = d[i]; });
    return o;
  });
}

/**
 * Giữ các dòng thuộc nhiệm kỳ hiện tại: thời điểm từ mốc bắt đầu nhiệm kỳ trở đi.
 * Dữ liệu nhiệm kỳ cũ vẫn được giữ, app chỉ không hiện ở các trang hằng ngày. Dòng không rõ thời điểm vẫn giữ. moc 0 = chưa có nhiệm kỳ, giữ hết.
 */
function locNhiemKy_(ds, layThoiGian, moc) {
  if (!moc) return ds;
  return ds.filter(function (x) { var v = layThoiGian(x); var t = v === '' || v == null ? NaN : new Date(v).getTime(); return isNaN(t) || t >= moc; });
}

/** Từ các dòng GiaiDoan: lúc (ms) mở giai đoạn 1 đầu tiên của nhiệm kỳ đang chạy (nhiệm kỳ của dòng cuối). 0 = chưa có. */
function batDauNhiemKyTu_(ds) {
  if (!ds.length) return 0;
  var nk = String(ds[ds.length - 1].NhiemKy), kq = 0;
  ds.forEach(function (k) {
    var t = new Date(k.BatDau).getTime();
    if (String(k.NhiemKy) === nk && Number(k.GiaiDoan) === 1 && !isNaN(t) && (!kq || t < kq)) kq = t;
  });
  return kq;
}

/**
 * Khoảng thời gian của từng nhiệm kỳ, từ các dòng GiaiDoan: { nhiệm kỳ: { tu, den } } (ms; den = lúc nhiệm kỳ sau bắt đầu, 0 là đang chạy).
 * Dùng để chia dữ liệu theo nhiệm kỳ khi xem lại và khi chuyển sang file lưu trữ.
 */
function khoangNhiemKy_(dsGiaiDoan) {
  var tu = {};
  dsGiaiDoan.forEach(function (k) {
    var t = new Date(k.BatDau).getTime(), nk = String(k.NhiemKy);
    if (!isNaN(t) && (tu[nk] === undefined || t < tu[nk])) tu[nk] = t;
  });
  var ds = Object.keys(tu).sort(function (a, b) { return tu[a] - tu[b]; });
  var kq = {};
  ds.forEach(function (nk, i) { kq[nk] = { tu: tu[nk], den: i + 1 < ds.length ? tu[ds[i + 1]] : 0 }; });
  return kq;
}

function cungKy_(dong, nhiemKy, giaiDoan) {
  return String(dong.NhiemKy) === String(nhiemKy) && Number(dong.GiaiDoan) === Number(giaiDoan);
}

/** Số người trong top: tổng số người được xếp hạng × tỉ lệ, làm tròn thông thường (nhân trước để tránh sai số, ví dụ 70 × 15% = 10,5 → 11). */
function soNguoiTop_(n, tiLe) {
  return Math.round(n * (tiLe === undefined ? QUY_TAC.tiLeTop : tiLe) / 100 + 1e-9);
}

/**
 * Những người trong top theo một cột điểm. Người bằng điểm với người cuối cùng trong top cũng được tính.
 * Người 0 điểm không được tính vào top.
 * @return {Object} { tên viết thường: true }
 */
function topTheoDiem_(ds, khoa, tiLe) {
  var kq = {}, k = soNguoiTop_(ds.length, tiLe);
  if (!k) return kq;
  var sx = ds.slice().sort(function (a, b) { return b[khoa] - a[khoa]; });
  var nguong = sx[k - 1][khoa];
  sx.forEach(function (p) { if (p[khoa] > 0 && p[khoa] >= nguong) kq[String(p.ten).toLowerCase()] = true; });
  return kq;
}

/** Giai đoạn vào của một thành viên trong nhiệm kỳ đang chạy (1 nếu vào từ Oday hoặc chưa ghi). */
function gdVao_(tv) { return Math.max(1, Number(tv.GiaiDoanVao) || (tv.LoaiThanhVien === LOAI_TV.BO_SUNG ? 2 : 1)); }

/**
 * Bảng điểm của nhiệm kỳ đang chạy. Chỉ có họ tên, lớp, ban và điểm.
 * Mỗi giai đoạn một bảng xếp hạng gồm những người đã vào CLB từ giai đoạn đó trở về trước (giai đoạn 1 chỉ có thành viên chính thức).
 * "Cả nhiệm kỳ" là tổng mọi giai đoạn của thành viên đã có từ giai đoạn 1.
 * Khi quy tắc tắt "điểm về 0 mỗi giai đoạn", cột diem là điểm cộng dồn từ đầu nhiệm kỳ.
 * @param {Array<Object>} thanhVien thành viên đang hoạt động (đã bỏ BOD)
 * @param {Array<Object>} lichSu các dòng LichSuDiem
 * @param {?Object} ky giai đoạn hiện tại { NhiemKy, GiaiDoan }
 * @return {Array<Object>} mỗi người: { ten, maTV, lop, ban, nhom, boSung, gdVao, diem, gd: [điểm giai đoạn 1..n, null nếu chưa vào], caKy, top, topGd: [..], topCaKy }
 */
function tongHopBangDiem_(thanhVien, lichSu, ky, qt) {
  if (!ky) return [];
  qt = qt || QUY_TAC;
  var n = Number(ky.GiaiDoan);
  var diem = {}; // tên viết thường -> [0, gd1, gd2, ...]
  lichSu.forEach(function (d) {
    if (String(d.NhiemKy) !== String(ky.NhiemKy)) return;
    var g = Number(d.GiaiDoan);
    if (!(g >= 1 && g <= n)) return;
    var k = String(d.HoVaTen).toLowerCase();
    if (!diem[k]) diem[k] = [];
    diem[k][g] = (diem[k][g] || 0) + (Number(d.Diem) || 0);
  });
  var ds = thanhVien.map(function (tv) {
    var k = String(tv.HoVaTen).toLowerCase(), v = gdVao_(tv), d = diem[k] || [];
    var gd = [];
    for (var g = 1; g <= n; g++) gd.push(g >= v ? (d[g] || 0) : null);
    var tongTuVao = gd.reduce(function (a, x) { return a + (x || 0); }, 0);
    return {
      ten: String(tv.HoVaTen), maTV: String(tv.MaTV || ''), lop: String(tv.Lop || ''), ban: String(tv.Ban || ''), nhom: nhomBan_(tv.Ban),
      boSung: v >= 2, gdVao: v,
      diem: qt.diemVe0 ? gd[n - 1] : tongTuVao,
      gd: gd,
      caKy: v <= 1 ? tongTuVao : null
    };
  });
  var topGd = [];
  for (var g = 1; g <= n; g++) {
    var trong = ds.filter(function (p) { return p.gdVao <= g; }).map(function (p) { return { ten: p.ten, d: p.gd[g - 1] }; });
    topGd.push(topTheoDiem_(trong, 'd', qt.tiLeTop));
  }
  var trongNay = ds.filter(function (p) { return p.gdVao <= n; });
  var topNay = topTheoDiem_(trongNay, 'diem', qt.tiLeTop);
  var topCaKy = topTheoDiem_(ds.filter(function (p) { return p.caKy !== null; }), 'caKy', qt.tiLeTop);
  ds.forEach(function (p) {
    var k = p.ten.toLowerCase();
    p.top = !!topNay[k];
    p.topGd = topGd.map(function (t) { return !!t[k]; });
    p.topCaKy = !!topCaKy[k];
  });
  return ds;
}

/** Lịch sử cộng điểm công khai của một người trong một giai đoạn (0 là cả nhiệm kỳ), mới nhất trước. */
function lichSuCongKhai_(lichSu, ten, nhiemKy, giaiDoan) {
  var k = String(ten).toLowerCase();
  return lichSu.filter(function (d) {
    return String(d.HoVaTen).toLowerCase() === k && String(d.NhiemKy) === String(nhiemKy) && (!Number(giaiDoan) || Number(d.GiaiDoan) === Number(giaiDoan));
  }).map(function (d) {
    var t = d.ThoiGian instanceof Date ? d.ThoiGian : new Date(d.ThoiGian);
    return { thoiGian: t.getTime(), loai: String(d.LoaiHoatDong), ten: String(d.TenHoatDong || ''), diem: Number(d.Diem) || 0, giaiDoan: Number(d.GiaiDoan) || 0 };
  }).sort(function (a, b) { return b.thoiGian - a.thoiGian; });
}

/** Chỉ giữ link bắt đầu bằng http:// hoặc https://. */
function linkHopLe_(s) {
  return /^https?:\/\/\S+$/i.test(String(s || '').trim());
}

/** Kiểm tra nội dung góp ý. Trả về chuỗi lỗi, hoặc '' nếu hợp lệ. */
function kiemTraGopY_(noiDung) {
  var s = String(noiDung == null ? '' : noiDung).trim();
  if (!s) return 'Bạn chưa viết góp ý.';
  if (s.length > 2000) return 'Góp ý dài quá 2000 ký tự, bạn rút gọn giúp nhé.';
  return '';
}

/** Người thuộc ban điều hành không tham gia cộng điểm, KPI và không có trong báo cáo. */
function khongPhaiBod_(tv) {
  return !laBanBod_(tv.Ban !== undefined ? tv.Ban : tv.ban);
}

/**
 * Tài khoản cần có theo danh sách thành viên đang hoạt động: thành viên nào có email cũng đăng nhập được.
 * Ban điều hành là BOD; HR, UCV do BOD nâng quyền thì giữ nguyên; còn lại là thành viên (TV).
 * Người đã rời CLB thì bỏ tài khoản. Tài khoản mới chưa có mật khẩu riêng (dùng mật khẩu chung của CLB).
 * @return {{ds:Array<Object>, moi:Array<Object>}} ds: tài khoản giữ lại (đã cập nhật vai trò, họ tên, mã); moi: cần tạo
 */
function dongBoTaiKhoan_(taiKhoan, thanhVien) {
  var theoEmail = {};
  thanhVien.forEach(function (tv) {
    var e = String(tv.Email || '').trim().toLowerCase();
    if (e && !theoEmail[e]) theoEmail[e] = tv;
  });
  var daCo = {}, ds = [];
  taiKhoan.forEach(function (tk) {
    var e = String(tk.Email || '').trim().toLowerCase();
    var tv = theoEmail[e];
    if (!tv || daCo[e]) return;
    daCo[e] = true;
    var vaiTro = String(tk.VaiTro || '');
    if (laBanBod_(tv.Ban)) vaiTro = 'BOD';
    else if (vaiTro !== 'HR' && vaiTro !== 'UCV') vaiTro = 'TV';
    var moi = {};
    Object.keys(tk).forEach(function (k) { moi[k] = tk[k]; });
    moi.VaiTro = vaiTro; moi.HoVaTen = tv.HoVaTen; moi.MaTV = tv.MaTV || '';
    ds.push(moi);
  });
  var moi = Object.keys(theoEmail).filter(function (e) { return !daCo[e]; }).map(function (e) {
    return { Email: e, MaTV: theoEmail[e].MaTV || '', HoVaTen: theoEmail[e].HoVaTen, VaiTro: laBanBod_(theoEmail[e].Ban) ? 'BOD' : 'TV' };
  });
  return { ds: ds, moi: moi };
}


/* ===================== Phân quyền ===================== */

/**
 * Chức năng mỗi vai trò được dùng. TV là thành viên thường: xem task, KPI, điểm của mình, gửi góp ý.
 * HR thêm phần phụ trách (xem KPI của ban, thành viên được phân) hoặc seeding, tuỳ BOD cấp quyền; chỉ BOD giao và sửa task.
 */
var QUYEN = {
  BOD: ['congdiem', 'task', 'danhgia', 'mail', 'duyetmail', 'baocao', 'gopy', 'log', 'caidat', 'lichsudiem'],
  HR: ['task', 'guigopy'],
  UCV: ['mail', 'hopthu', 'guigopy'],
  TV: ['guigopy']
};

function coQuyen_(vaiTro, chucNang) {
  return (QUYEN[vaiTro] || []).indexOf(chucNang) >= 0;
}

/** Các ban một HR quản lý, lưu dạng "PG, AD" (theo nhóm: PR gồm PR CAP, PR DES, PR PHO). Trống là chưa phân ban. */
function banQuanLy_(giaTri) {
  var ds = [];
  String(giaTri == null ? '' : giaTri).split(/[,;]/).forEach(function (s) { var n = nhomBan_(s); if (n && ds.indexOf(n) < 0) ds.push(n); });
  return ds.sort(soSanhBan_);
}

/** Các nhóm ban HR có thể được giao phụ trách: nhóm của các ban đang dùng có đánh dấu "HR phụ trách" trong cơ cấu. */
function banCoo_() {
  var ds = [];
  CO_CAU.ban.forEach(function (b) { if (b.dangDung && b.phuTrach && !b.laBod && ds.indexOf(b.nhom) < 0) ds.push(b.nhom); });
  return ds.sort(soSanhBan_);
}

/** Các nhóm ban HR này phụ trách (cột BanQuanLy, chỉ giữ nhóm còn được phụ trách). Chưa phân ban thì rỗng. */
function banCuaHr_(giaTri) {
  var duoc = banCoo_();
  return banQuanLy_(giaTri).filter(function (b) { return duoc.indexOf(b) >= 0; });
}

/**
 * Quyền với task của một người (theo tên người phụ trách).
 * BOD: mọi BOD như nhau, xem và quản lý task của mọi thành viên trừ BOD (BOD không giao task cho nhau).
 * Còn lại: chỉ xem task của mình. HR phụ trách xem KPI của ban và thành viên được phân ở trang riêng (phamViHr_).
 * @return {{xem:function(string):boolean, sua:function(string):boolean, moTa:string}}
 */
function quyenTask_(tk, chucVu, banCua) {
  var toi = String(tk.HoVaTen);
  if (String(tk.VaiTro) === 'BOD') {
    var khongBod = function (n) { return !laBanBod_(banCua[String(n)]); };
    return { xem: khongBod, sua: khongBod, moTa: '' };
  }
  if (String(tk.VaiTro) === 'HR') {
    // HR nhập, sửa, đổi trạng thái task giúp BOD cho những người mình phụ trách (không phải task của chính mình).
    var pv = phamViHr_(tk, banCua);
    var quanLy = function (n) { return String(n) !== toi && pv.thuoc(n); };
    return { xem: quanLy, sua: quanLy, moTa: pv.co ? '' : 'BOD chưa giao ban hay thành viên nào cho bạn phụ trách.' };
  }
  return { xem: function (n) { return String(n) === toi; }, sua: function () { return false; }, moTa: '' };
}

/**
 * Những thành viên một HR phụ trách: mọi người thuộc các ban ở cột BanQuanLy (BOD chọn ở Cài đặt, Phân quyền).
 * Chỉ tài khoản HR mới có phạm vi. BOD không nằm trong phạm vi của ai.
 * @return {{ban:Array<string>, co:boolean, thuoc:function(string):boolean}}
 */
function phamViHr_(tk, banCua) {
  var kq = { ban: [], co: false, thuoc: function () { return false; } };
  if (!tk || String(tk.VaiTro) !== 'HR') return kq;
  kq.ban = banCuaHr_(tk.BanQuanLy);
  kq.co = kq.ban.length > 0;
  kq.thuoc = function (n) {
    return !laBanBod_(banCua[String(n)]) && kq.ban.indexOf(nhomBan_(banCua[String(n)])) >= 0;
  };
  return kq;
}

/**
 * Ngày nộp ghi vào sheet khi đánh xong task: xong đúng hạn thì là hôm nay (hoặc hạn chót nếu đã qua hạn),
 * trễ hạn thì là hôm nay (hoặc ngày sau hạn chót nếu chưa tới hạn), để cột Đúng hạn ra đúng lựa chọn.
 */
function congNgayChuoi_(s, n) {
  var p = String(s).split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
}

function ngayNopTheoKieu_(kieu, han, hom) {
  if (!han) return hom;
  if (kieu === 'tre') return hom > han ? hom : congNgayChuoi_(han, 1);
  return hom < han ? hom : han;
}

/** Trả về chuỗi lỗi, hoặc '' nếu mật khẩu mới hợp lệ. */
function kiemTraMatKhauMoi_(mk) {
  var s = String(mk == null ? '' : mk);
  if (s.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (s.length > 100) return 'Mật khẩu dài quá.';
  return '';
}

/**
 * Tạo các dòng LichSuDiem cho một lần cộng điểm.
 * Điểm lấy theo loại hoạt động tại lúc cộng; người được cộng phải có trong danh sách thành viên.
 * @return {{dong:Array<Object>, loi:string}}
 */
function taoDongCongDiem_(yeuCau, thanhVien, loaiHoatDong, nguoiCong, ky, bayGio, lichSu) {
  if (!ky) return { dong: [], loi: 'Chưa có giai đoạn nào. Hãy tải danh sách thành viên kiểu "Sau tuyển đợt 1" trước.' };
  var loai = null;
  loaiHoatDong.forEach(function (l) { if (String(l.TenLoai) === String(yeuCau.loai)) loai = l; });
  if (!loai) return { dong: [], loi: 'Không có loại hoạt động "' + yeuCau.loai + '".' };
  var ds = (yeuCau.nguoi || []).map(function (n) { return String(n); });
  if (!ds.length) return { dong: [], loi: 'Bạn chưa chọn ai.' };
  var tenDung = {}, maCua = {};
  thanhVien.forEach(function (tv) { var k = String(tv.HoVaTen).toLowerCase(); tenDung[k] = String(tv.HoVaTen); maCua[k] = String(tv.MaTV || ''); });
  var khongCo = ds.filter(function (n) { return !tenDung[n.toLowerCase()]; });
  if (khongCo.length) return { dong: [], loi: 'Không có trong danh sách thành viên: ' + khongCo.join(', ') + '.' };
  var daCo = {};
  var dong = [];
  ds.forEach(function (n) {
    var k = n.toLowerCase();
    if (daCo[k]) return;
    daCo[k] = true;
    dong.push({
      ThoiGian: bayGio, MaTV: maCua[k], HoVaTen: tenDung[k], LoaiHoatDong: String(loai.TenLoai),
      TenHoatDong: String(yeuCau.tenHoatDong || '').trim().slice(0, 200), Diem: Number(loai.Diem) || 0,
      NguoiCong: nguoiCong, NhiemKy: String(ky.NhiemKy), GiaiDoan: Number(ky.GiaiDoan)
    });
  });
  var vuot = vuotGioiHan_(dong, loaiHoatDong, lichSu || [], ky);
  if (vuot) return { dong: [], loi: vuot };
  return { dong: dong, loi: '' };
}

/** Số lần tối đa mỗi người được cộng một loại trong một giai đoạn (0 là không giới hạn). */
function gioiHanLoai_(l) {
  var n = Math.floor(Number(l && l.GioiHan));
  return n > 0 ? n : 0;
}

/**
 * Kiểm tra giới hạn số lần mỗi giai đoạn (ví dụ góp ý được dùng tối đa 2 lần).
 * dongMoi: các dòng sắp ghi. Trả về câu báo lỗi, hoặc '' nếu không ai vượt.
 */
function vuotGioiHan_(dongMoi, loaiHoatDong, lichSu, ky) {
  var gioiHan = {};
  loaiHoatDong.forEach(function (l) { var n = gioiHanLoai_(l); if (n) gioiHan[String(l.TenLoai)] = n; });
  var dem = {};
  var khoa = function (d) { return String(d.LoaiHoatDong) + '|' + String(d.HoVaTen).toLowerCase(); };
  lichSu.forEach(function (d) { if (gioiHan[String(d.LoaiHoatDong)] && cungKy_(d, ky.NhiemKy, ky.GiaiDoan)) dem[khoa(d)] = (dem[khoa(d)] || 0) + 1; });
  var vuot = {}, thuTu = [];
  dongMoi.forEach(function (d) {
    var n = gioiHan[String(d.LoaiHoatDong)];
    if (!n) return;
    dem[khoa(d)] = (dem[khoa(d)] || 0) + 1;
    if (dem[khoa(d)] > n) {
      var l = String(d.LoaiHoatDong);
      if (!vuot[l]) { vuot[l] = []; thuTu.push(l); }
      if (vuot[l].indexOf(d.HoVaTen) < 0) vuot[l].push(d.HoVaTen);
    }
  });
  if (!thuTu.length) return '';
  return thuTu.map(function (l) { return '"' + l + '" chỉ cộng tối đa ' + gioiHan[l] + ' lần mỗi giai đoạn. Đã đủ: ' + vuot[l].join(', ') + '.'; }).join(' ');
}

/** Loại hoạt động gắn với chức năng tự cộng của app. Mỗi chức năng gắn với tối đa một loại. */
var DUNG_CHO = { GOP_Y: 'gopy', REACT: 'react', COMMENT: 'comment' };
/** Mã gắn điểm log vượt của buổi một thời lượng, ví dụ 'log90'. */
function dungChoLog_(phut) { return 'log' + Math.round(Number(phut)); }
/** Các chức năng tự cộng hiện có (theo thời lượng buổi log trong quy tắc): { mã: tên }. */
function cacDungCho_(qt) {
  var kq = { gopy: 'Góp ý được dùng', react: 'Seeding: react', comment: 'Seeding: comment' };
  ((qt || QUY_TAC).thoiLuongBuoi || []).forEach(function (p) { kq[dungChoLog_(p)] = 'Buổi log dư chỉ tiêu (' + p + ' phút)'; });
  return kq;
}

/** Mức điểm theo quy chế KPI 2026-2027 (mục III.3). BOD nạp vào bảng loại hoạt động bằng một nút trong Cài đặt. */
var MUC_DIEM_QUY_CHE = [
  { ten: 'React bài đăng (trong số giờ seeding)', diem: 1, congTay: false, dungCho: 'react' },
  { ten: 'Comment bài đăng (trong số giờ seeding)', diem: 2, congTay: false, dungCho: 'comment' },
  { ten: 'Làm staff ca ngắn (giờ ra chơi)', diem: 3, congTay: true },
  { ten: 'Tham gia bonding', diem: 5, congTay: true },
  { ten: 'Góp ý được CLB đưa vào sử dụng', diem: 10, congTay: false, gioiHan: 2, dungCho: 'gopy' },
  { ten: 'Đi log dư chỉ tiêu (buổi 90 phút)', diem: 20, congTay: false, dungCho: 'log90' },
  { ten: 'Đi log dư chỉ tiêu (buổi 180 phút)', diem: 40, congTay: false, dungCho: 'log180' },
  { ten: 'Đại diện CLB tham gia cuộc thi', diem: 40, congTay: true },
  { ten: 'Tham dự sự kiện của CLB hoặc của đối tác', diem: 40, congTay: true },
  { ten: 'Làm staff 1 buổi (sự kiện lớn)', diem: 50, congTay: true }
];

/** Loại hoạt động đang gắn với một chức năng tự cộng (DUNG_CHO), hoặc null. */
function loaiDungCho_(loaiHoatDong, dungCho) {
  for (var i = 0; i < loaiHoatDong.length; i++) if (String(loaiHoatDong[i].DungCho || '') === dungCho) return loaiHoatDong[i];
  return null;
}

/** Kiểm tra danh sách loại hoạt động do BOD sửa. Điểm không âm (chỉ cộng, không trừ). */
function chuanHoaLoaiHoatDong_(ds) {
  var kq = [], tenDc = cacDungCho_();
  var daCo = {}, daGan = {};
  for (var i = 0; i < (ds || []).length; i++) {
    var ten = String(ds[i].ten == null ? '' : ds[i].ten).trim();
    var diem = Number(ds[i].diem);
    if (!ten) continue;
    if (daCo[ten.toLowerCase()]) return { ds: [], loi: 'Loại "' + ten + '" bị trùng.' };
    if (!isFinite(diem) || diem < 0) return { ds: [], loi: 'Điểm của "' + ten + '" phải là số không âm.' };
    var gh = ds[i].gioiHan == null || String(ds[i].gioiHan).trim() === '' ? 0 : Number(ds[i].gioiHan);
    if (!(gh >= 0) || Math.floor(gh) !== gh) return { ds: [], loi: 'Số lần tối đa của "' + ten + '" phải là số nguyên dương, hoặc để trống nếu không giới hạn.' };
    var dc = String(ds[i].dungCho || '');
    if (dc && !tenDc[dc]) dc = '';
    if (dc && daGan[dc]) return { ds: [], loi: '"' + tenDc[dc] + '" đang gắn với hai loại: ' + daGan[dc] + ' và ' + ten + '. Chỉ chọn một.' };
    if (dc) daGan[dc] = ten;
    daCo[ten.toLowerCase()] = true;
    // CongTay = false: chỉ hiện trên app CLB ECO (ví dụ điểm app tự cộng qua báo cáo seeding), BOD không chọn được khi cộng điểm.
    var dong = { TenLoai: ten, Diem: diem, CongTay: ds[i].congTay === false ? 'khong' : 'co' };
    if (gh || dc) { dong.GioiHan = gh || ''; dong.DungCho = dc; }
    kq.push(dong);
  }
  if (!kq.length) return { ds: [], loi: 'Cần ít nhất một loại hoạt động.' };
  return { ds: kq, loi: '' };
}

/** Kiểm tra danh sách link ghim do BOD sửa. */
function chuanHoaGhim_(ds) {
  var kq = [];
  for (var i = 0; i < (ds || []).length; i++) {
    var tieuDe = String(ds[i].tieuDe == null ? '' : ds[i].tieuDe).trim();
    var link = String(ds[i].link == null ? '' : ds[i].link).trim();
    if (!tieuDe && !link) continue;
    if (!linkHopLe_(link)) return { ds: [], loi: 'Link "' + (tieuDe || link) + '" phải bắt đầu bằng http:// hoặc https://' };
    kq.push({ TieuDe: tieuDe || link, DuongDan: link });
  }
  return { ds: kq, loi: '' };
}

/* ===================== Task ===================== */

/** Trạng thái lưu trong sheet chỉ có Đã giao, Đã xong, Đã huỷ. Sắp đến hạn và Trễ hạn được tính từ hạn chót. */
var TRANG_THAI_TASK = { GIAO: 'Đã giao', SAP: 'Sắp đến hạn', TRE: 'Trễ hạn', KHT: 'Không hoàn thành', XONG: 'Đã xong', HUY: 'Đã huỷ' };

/** Task chưa xong, chưa huỷ mà trễ quá khtSau ngày thì tính là không hoàn thành (khtSau không phải số: không áp dụng). */
function laKhongHoanThanh_(trangThaiLuu, hanChot, homNay, khtSau) {
  if (typeof khtSau !== 'number' || trangThaiLuu === TRANG_THAI_TASK.XONG || trangThaiLuu === TRANG_THAI_TASK.HUY || !ngayHopLe_(hanChot)) return false;
  return soNgayGiua_(hanChot, homNay) > khtSau;
}

/** Ngày dạng yyyy-mm-dd có thật hay không. */
function ngayHopLe_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Số ngày từ ngày "tu" đến ngày "den" (cả hai dạng yyyy-mm-dd). */
function soNgayGiua_(tu, den) {
  var a = String(tu).split('-'), b = String(den).split('-');
  return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 864e5);
}

/** yyyy-mm-dd → dd/mm/yyyy */
function hienNgay_(s) {
  var p = String(s).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s);
}

function trangThaiTask_(trangThaiLuu, hanChot, homNay, soNgaySapDenHan, khtSau) {
  if (trangThaiLuu === TRANG_THAI_TASK.XONG || trangThaiLuu === TRANG_THAI_TASK.HUY) return trangThaiLuu;
  if (!ngayHopLe_(hanChot)) return TRANG_THAI_TASK.GIAO;
  if (laKhongHoanThanh_(trangThaiLuu, hanChot, homNay, khtSau)) return TRANG_THAI_TASK.KHT;
  var conLai = soNgayGiua_(homNay, hanChot);
  if (conLai < 0) return TRANG_THAI_TASK.TRE;
  if (conLai <= soNgaySapDenHan) return TRANG_THAI_TASK.SAP;
  return TRANG_THAI_TASK.GIAO;
}

/** Kiểm tra nội dung task. Trả về { loi, ten, moTa, hanChot, nguoi[] } với tên người đã chuẩn theo danh sách. */
function kiemTraTask_(yeuCau, thanhVien) {
  yeuCau = yeuCau || {};
  var ten = String(yeuCau.ten || '').replace(/\s+/g, ' ').trim();
  var moTa = String(yeuCau.moTa || '').trim();
  var hanChot = String(yeuCau.hanChot || '').trim();
  if (!ten) return { loi: 'Bạn chưa nhập tên task.' };
  if (ten.length > 200) return { loi: 'Tên task dài quá 200 ký tự.' };
  if (moTa.length > 2000) return { loi: 'Mô tả dài quá 2000 ký tự.' };
  if (!ngayHopLe_(hanChot)) return { loi: 'Hạn chót chưa đúng.' };
  var theoTen = {};
  thanhVien.forEach(function (tv) { theoTen[String(tv.HoVaTen).toLowerCase()] = String(tv.HoVaTen); });
  var nguoi = [], daCo = {};
  var vao = yeuCau.nguoi || [];
  for (var i = 0; i < vao.length; i++) {
    var chuan = theoTen[String(vao[i]).trim().toLowerCase()];
    if (!chuan) return { loi: 'Không có "' + vao[i] + '" trong danh sách thành viên.' };
    if (!daCo[chuan]) { daCo[chuan] = true; nguoi.push(chuan); }
  }
  if (!nguoi.length) return { loi: 'Bạn chưa chọn người phụ trách.' };
  return { loi: '', ten: ten, moTa: moTa, hanChot: hanChot, nguoi: nguoi };
}

/** Tạo các dòng task, mỗi người phụ trách một dòng. BOD tạo là "Giao task", ban nhân sự tạo là "Nhập task". */
function taoDongTask_(yeuCau, thanhVien, nguoiTao, vaiTro, bayGio) {
  var k = kiemTraTask_(yeuCau, thanhVien);
  if (k.loi) return { dong: [], loi: k.loi };
  var ma = {};
  thanhVien.forEach(function (tv) { ma[String(tv.HoVaTen)] = String(tv.MaTV || ''); });
  return {
    loi: '',
    dong: k.nguoi.map(function (n) {
      return {
        ThoiGianTao: bayGio, TenTask: k.ten, MoTa: k.moTa, HanChot: k.hanChot, MaTV: ma[n] || '', NguoiPhuTrach: n,
        NguoiTao: nguoiTao, KieuTao: vaiTro === 'BOD' ? 'Giao task' : 'Nhập task', TrangThai: TRANG_THAI_TASK.GIAO, ThoiGianXong: '',
        HrPhuTrach: vaiTro === 'HR' ? nguoiTao : ''
      };
    })
  };
}

/* ===================== KPI task (quy chế mục II.2, II.3) ===================== */

var CHAT_LUONG = { HOAN_CHINH: 'Hoàn chỉnh', CAN_SUA: 'Cần chỉnh sửa', SO_SAI: 'Làm quá sơ sài' };
var DUNG_HAN = { DUNG: 'Đúng hạn', TRE: 'Trễ hạn', KHONG_LAM: 'Không làm' };
var KET_QUA = { DAT: 'Đạt', CHUA_DAT: 'Chưa đạt', CHO: 'Chờ đánh giá' };

/**
 * Đúng hạn hay không của một task: Đã xong thì so ngày nộp với hạn chót (hạn đã gia hạn hợp lệ),
 * Không hoàn thành là Không làm, còn lại chưa có ('').
 */
function dungHanTask_(trangThai, hanChot, ngayNop) {
  if (trangThai === TRANG_THAI_TASK.KHT) return DUNG_HAN.KHONG_LAM;
  if (trangThai !== TRANG_THAI_TASK.XONG) return '';
  return ngayHopLe_(ngayNop) && ngayHopLe_(hanChot) && ngayNop > hanChot ? DUNG_HAN.TRE : DUNG_HAN.DUNG;
}

/** Kết quả một task theo bảng đúng hạn × chất lượng (QUY_TAC.maTran). Không làm là Chưa đạt; đã xong mà BOD chưa đánh giá thì Chờ đánh giá. */
function ketQuaTask_(dungHan, chatLuong, qt) {
  if (dungHan === DUNG_HAN.KHONG_LAM) return KET_QUA.CHUA_DAT;
  if (!dungHan) return '';
  if (!chatLuong) return KET_QUA.CHO;
  var hang = (qt || QUY_TAC).maTran[dungHan] || {};
  return hang[chatLuong] === KET_QUA.DAT ? KET_QUA.DAT : KET_QUA.CHUA_DAT;
}

/** Kiểm tra đánh giá chất lượng. "Làm quá sơ sài" bắt buộc ghi rõ dấu hiệu. Trả về '' nếu hợp lệ. */
function kiemTraDanhGia_(chatLuong, dauHieu) {
  var hop = Object.keys(CHAT_LUONG).some(function (k) { return CHAT_LUONG[k] === chatLuong; });
  if (!hop) return 'Chọn mức chất lượng.';
  if (chatLuong === CHAT_LUONG.SO_SAI && String(dauHieu || '').trim().length < 10) return 'Đánh giá "Làm quá sơ sài" cần ghi rõ dấu hiệu cụ thể (ví dụ: thiếu quá nửa phần việc trong mô tả).';
  if (String(dauHieu || '').length > 1000) return 'Phần ghi chú dài quá 1000 ký tự.';
  return '';
}

/**
 * Gia hạn được tính là đúng hạn khi thành viên xin trước hạn chót ít nhất QUY_TAC.giaHanNgay ngày (mặc định 1 ngày, tức 24 giờ;
 * hạn tính đến hết ngày hạn chót). Trả về '' nếu hợp lệ.
 */
function kiemTraGiaHan_(hanChot, hanMoi, ngayXin, qt) {
  var n = (qt || QUY_TAC).giaHanNgay;
  if (!ngayHopLe_(hanMoi)) return 'Chọn hạn chót mới.';
  if (!ngayHopLe_(ngayXin)) return 'Chọn ngày thành viên xin gia hạn.';
  if (ngayHopLe_(hanChot) && hanMoi <= hanChot) return 'Hạn mới phải sau hạn hiện tại (' + hienNgay_(hanChot) + ').';
  if (ngayHopLe_(hanChot) && soNgayGiua_(ngayXin, hanChot) < n) return 'Thành viên xin gia hạn chưa đủ ' + (n === 1 ? '24 giờ' : n + ' ngày') + ' trước hạn (' + hienNgay_(hanChot) + ') nên không được tính là gia hạn. Nếu nộp sau hạn thì task tính trễ hạn.';
  return '';
}

function phanTram_(tu, mau) { return mau ? Math.round(tu * 100 / mau) : null; }

/**
 * Tổng hợp KPI task của một người. ds: các task của người đó, mỗi task có trangThai và ketQua.
 * Task đã huỷ không tính. Tỉ lệ = số task đạt ÷ số task đã có kết quả (Đạt hoặc Chưa đạt), làm tròn.
 */
function tongKpiTask_(ds) {
  var kq = { giao: 0, dat: 0, chuaDat: 0, cho: 0, dangLam: 0, tiLe: null };
  ds.forEach(function (t) {
    if (t.trangThai === TRANG_THAI_TASK.HUY) return;
    kq.giao++;
    if (t.ketQua === KET_QUA.DAT) kq.dat++;
    else if (t.ketQua === KET_QUA.CHUA_DAT) kq.chuaDat++;
    else if (t.ketQua === KET_QUA.CHO) kq.cho++;
    else kq.dangLam++;
  });
  kq.tiLe = phanTram_(kq.dat, kq.dat + kq.chuaDat);
  return kq;
}


/* ===================== Nhắc việc qua Zalo ===================== */

var NHAC_TRE = { MOI_NGAY: 'Mỗi ngày', MOT_LAN: 'Chỉ một lần', KHONG: 'Không nhắc' };

/**
 * Lịch nhắc deadline (BOD chỉnh): danh sách mốc { ngay, gio, phut }.
 * ngay: số ngày so với hạn chót (-2 = trước hạn 2 ngày, 0 = ngày hạn chót, 1 = trễ hạn 1 ngày),
 * hoặc MOC_TRE_MOI_NGAY = mỗi ngày khi task đang trễ hạn. gio 0..23, phut 0/15/30/45.
 */
var MOC_TRE_MOI_NGAY = 'T';
var TOI_DA_MOC_NHAC = 10, TOI_DA_GIO_NHAC = 6;

function lucNhac_(m) { return m.gio * 60 + (m.phut || 0); }

/** Chuẩn hoá lịch nhắc (mảng hoặc chuỗi JSON). Trả về null nếu không đọc được. Bỏ mốc sai, mốc trùng. */
function chuanHoaLichNhac_(v) {
  var ds = v;
  if (typeof v === 'string') { try { ds = JSON.parse(v); } catch (e) { ds = null; } }
  if (!Array.isArray(ds)) return null;
  var kq = [], co = {};
  ds.forEach(function (m) {
    if (!m || typeof m !== 'object') return;
    var ngay = m.ngay === MOC_TRE_MOI_NGAY ? MOC_TRE_MOI_NGAY : (m.ngay === '' || m.ngay == null ? NaN : Math.round(Number(m.ngay)));
    var gio = Math.round(Number(m.gio)), phut = Math.round(Number(m.phut || 0));
    if (ngay !== MOC_TRE_MOI_NGAY && !(ngay >= -30 && ngay <= 30)) return;
    if (!(gio >= 0 && gio <= 23) || [0, 15, 30, 45].indexOf(phut) < 0) return;
    var k = ngay + '@' + gio + ':' + phut;
    if (co[k]) return;
    co[k] = true;
    kq.push({ ngay: ngay, gio: gio, phut: phut });
  });
  kq = kq.slice(0, TOI_DA_MOC_NHAC);
  var thuTu = function (m) { return m.ngay === MOC_TRE_MOI_NGAY ? 1000 : m.ngay; };
  kq.sort(function (a, b) { return thuTu(a) - thuTu(b) || lucNhac_(a) - lucNhac_(b); });
  return kq;
}

/** Lịch nhắc từ cài đặt kiểu cũ (một danh sách giờ chung), để app đã chạy giữ nguyên cách nhắc. */
function lichNhacTuCaiDatCu_(soNgaySap, dsGio, nhacSap, nhacTre) {
  var ds = [];
  var them = function (ngay) { dsGio.forEach(function (g) { ds.push({ ngay: ngay, gio: g, phut: 0 }); }); };
  if (nhacSap) for (var d = 0; d <= soNgaySap; d++) them(-d);
  if (nhacTre === NHAC_TRE.MOI_NGAY) them(MOC_TRE_MOI_NGAY);
  else if (nhacTre === NHAC_TRE.MOT_LAN) them(1);
  var kq = chuanHoaLichNhac_(ds);
  return kq.length ? kq : [{ ngay: 0, gio: dsGio[0], phut: 0 }];
}

/** Các thời điểm (phút trong ngày) cần chạy nhắc, không trùng, tăng dần. */
function lucCuaLich_(lich) {
  var kq = [];
  lich.forEach(function (m) { var l = lucNhac_(m); if (kq.indexOf(l) < 0) kq.push(l); });
  return kq.sort(function (a, b) { return a - b; });
}

/** Tên một mốc nhắc, ví dụ "Trước hạn 2 ngày lúc 19:00". */
function moTaMocNhac_(m) {
  var hai = function (n) { return (n < 10 ? '0' : '') + n; };
  var ngay = m.ngay === MOC_TRE_MOI_NGAY ? 'Trễ hạn, mỗi ngày' : m.ngay < 0 ? 'Trước hạn ' + (-m.ngay) + ' ngày' : m.ngay === 0 ? 'Ngày hạn chót' : 'Trễ hạn ' + m.ngay + ' ngày';
  return ngay + ' lúc ' + hai(m.gio) + ':' + hai(m.phut || 0);
}

/**
 * Chọn task cần nhắc hôm nay. ds: [{ ten, nguoi, hanChot, trangThai }] (trangThai đã tính).
 * luc: phút trong ngày của lần chạy này (chỉ dùng các mốc đúng giờ đó); null = mọi mốc của hôm nay (nút "Gửi nhắc ngay").
 */
function chonTaskTheoLich_(ds, homNay, lich, luc) {
  var moc = lich.filter(function (m) { return luc == null || lucNhac_(m) === luc; });
  if (!moc.length) return [];
  return ds.filter(function (t) {
    if (t.trangThai === TRANG_THAI_TASK.XONG || t.trangThai === TRANG_THAI_TASK.HUY || t.trangThai === TRANG_THAI_TASK.KHT || !ngayHopLe_(t.hanChot)) return false;
    var tre = soNgayGiua_(t.hanChot, homNay);
    return moc.some(function (m) { return m.ngay === MOC_TRE_MOI_NGAY ? tre >= 1 : tre === m.ngay; });
  });
}

/** Mô tả hạn của một task, ví dụ "trễ 2 ngày", "hạn hôm nay", "còn 1 ngày". */
function moTaHan_(hanChot, homNay) {
  var d = soNgayGiua_(homNay, hanChot);
  if (d < 0) return 'trễ ' + (-d) + ' ngày';
  if (d === 0) return 'hạn hôm nay';
  return 'còn ' + d + ' ngày';
}

/**
 * Soạn tin nhắc. laNhanSu = true: tin cho ban nhân sự, có tên người phụ trách để nhắc lại qua Messenger.
 * Trả về '' nếu không có gì cần nhắc.
 */
function soanTinNhac_(tenNguoiNhan, ds, homNay, laNhanSu) {
  if (!ds.length) return '';
  var sx = ds.slice().sort(function (a, b) { return a.hanChot < b.hanChot ? -1 : a.hanChot > b.hanChot ? 1 : 0; });
  var dau = laNhanSu
    ? 'CLB ECO nhắc việc. Chào ' + tenNguoiNhan + ', nhờ bạn nhắc các bạn sau qua Messenger:'
    : 'CLB ECO nhắc việc. Chào ' + tenNguoiNhan + ', bạn có ' + ds.length + ' task cần chú ý:';
  return dau + '\n' + sx.map(function (t) {
    return '• ' + (laNhanSu ? t.nguoi + ': ' : '') + t.ten + ' (hạn ' + hienNgay_(t.hanChot) + ', ' + moTaHan_(t.hanChot, homNay) + ')';
  }).join('\n');
}

/** Chia tin dài thành nhiều tin, mỗi tin không quá "toiDa" ký tự, ưu tiên cắt ở chỗ xuống dòng. */
function chiaTin_(tin, toiDa) {
  var kq = [], cur = '';
  String(tin).split('\n').forEach(function (dong) {
    while (dong.length > toiDa) {
      if (cur) { kq.push(cur); cur = ''; }
      kq.push(dong.slice(0, toiDa));
      dong = dong.slice(toiDa);
    }
    if (cur && (cur.length + 1 + dong.length) > toiDa) { kq.push(cur); cur = dong; }
    else cur = cur ? cur + '\n' + dong : dong;
  });
  if (cur) kq.push(cur);
  return kq;
}

/** Tìm mã kết nối trong tin nhắn người dùng gửi bot. Trả về mã khớp hoặc ''. */
function timMaTrongTin_(tin, dsMa) {
  var chu = String(tin || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  var tu = chu.split(/\s+/);
  for (var i = 0; i < dsMa.length; i++) {
    if (dsMa[i] && tu.indexOf(String(dsMa[i]).toUpperCase()) >= 0) return dsMa[i];
  }
  return '';
}

/* ===================== Mail ===================== */

/** Các thao tác UCV được đề nghị. Mọi thao tác làm thay đổi hộp thư đều chờ BOD duyệt. */
var THAO_TAC_MAIL = {
  SOAN: 'Soạn thư mới', TRA_LOI: 'Trả lời', TRA_LOI_TAT_CA: 'Trả lời tất cả', CHUYEN_TIEP: 'Chuyển tiếp',
  LUU_TRU: 'Lưu trữ', VE_HOP_THU: 'Chuyển về hộp thư đến', XOA: 'Chuyển vào thùng rác',
  GAN_NHAN: 'Gắn nhãn', BO_NHAN: 'Bỏ nhãn', THU_RAC: 'Báo cáo thư rác'
};
var TRANG_THAI_VIEC = { NHAP: 'Nháp', CHO: 'Chờ duyệt', DUYET: 'Đã duyệt', SUA: 'Cần sửa lại', TU_CHOI: 'Từ chối', LOI: 'Lỗi khi thực hiện' };

function emailHopLe_(e) {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(String(e || '').trim());
}

/** Tách chuỗi nhiều email (phẩy, chấm phẩy, xuống dòng, khoảng trắng). Trả về { ds, sai }. Bỏ trùng. */
function tachEmail_(chuoi) {
  var ds = [], sai = [], daCo = {};
  String(chuoi || '').split(/[\s,;]+/).forEach(function (x) {
    var m = /<([^>]+)>/.exec(x);
    var e = (m ? m[1] : x).trim().replace(/^mailto:/i, '');
    if (!e) return;
    if (!emailHopLe_(e)) { sai.push(e); return; }
    var k = e.toLowerCase();
    if (!daCo[k]) { daCo[k] = true; ds.push(e); }
  });
  return { ds: ds, sai: sai };
}

/** Kiểm tra một việc mail của UCV. Trả về '' nếu hợp lệ. */
function kiemTraViecMail_(v) {
  v = v || {};
  var tt = v.thaoTac;
  var hopLe = Object.keys(THAO_TAC_MAIL).some(function (k) { return THAO_TAC_MAIL[k] === tt; });
  if (!hopLe) return 'Thao tác không hợp lệ.';
  if (tt !== THAO_TAC_MAIL.SOAN && !v.maThu) return 'Thiếu thư cần thao tác.';
  if (tt === THAO_TAC_MAIL.SOAN || tt === THAO_TAC_MAIL.CHUYEN_TIEP) {
    var den = tachEmail_(v.den);
    if (den.sai.length) return 'Email chưa đúng: ' + den.sai.join(', ');
    if (!den.ds.length) return 'Bạn chưa nhập người nhận.';
  }
  var cc = tachEmail_(v.cc), bcc = tachEmail_(v.bcc);
  if (cc.sai.length || bcc.sai.length) return 'Email chưa đúng: ' + cc.sai.concat(bcc.sai).join(', ');
  if (tt === THAO_TAC_MAIL.SOAN && !String(v.tieuDe || '').trim()) return 'Bạn chưa nhập tiêu đề.';
  if ((tt === THAO_TAC_MAIL.SOAN || tt === THAO_TAC_MAIL.TRA_LOI || tt === THAO_TAC_MAIL.TRA_LOI_TAT_CA) && !String(v.noiDung || '').trim()) return 'Bạn chưa nhập nội dung.';
  if ((tt === THAO_TAC_MAIL.GAN_NHAN || tt === THAO_TAC_MAIL.BO_NHAN) && !String(v.nhan || '').trim()) return 'Bạn chưa chọn nhãn.';
  if (String(v.tieuDe || '').length > 250) return 'Tiêu đề dài quá 250 ký tự.';
  if (String(v.noiDung || '').length > 45000) return 'Nội dung dài quá. Nếu bạn dán từ nơi khác, thử dán lại không kèm định dạng (Ctrl+Shift+V).';
  return '';
}

/** Các chỗ {TenCot} có trong thư mẫu, theo thứ tự xuất hiện, không trùng. */
/** Chỗ chèn viết {Tên cột} hoặc {{Tên cột}} đều được. */
var CHO_CHEN_ = /\{\{([^{}\n]{1,60})\}\}|\{([^{}\n]{1,60})\}/g;
function timChoTrong_(chu) {
  var ds = [], re = new RegExp(CHO_CHEN_.source, 'g'), m;
  while ((m = re.exec(String(chu || '')))) { var ten = (m[1] || m[2]).trim(); if (ten && ds.indexOf(ten) < 0) ds.push(ten); }
  return ds;
}

/**
 * Thay {TenCot} bằng giá trị của người nhận. So khớp tên cột không phân biệt hoa thường, dấu và khoảng trắng.
 * Trả về { chu, thieu[] } với thieu là các chỗ không có cột tương ứng (giữ nguyên trong thư).
 */
function thayTheMau_(chu, duLieu) {
  var theoKhoa = {};
  Object.keys(duLieu || {}).forEach(function (k) { theoKhoa[chuanHoaTenCot_(k)] = duLieu[k]; });
  var thieu = [];
  var kq = String(chu || '').replace(new RegExp(CHO_CHEN_.source, 'g'), function (toan, ten2, ten1) {
    var ten = (ten2 || ten1).trim();
    var k = chuanHoaTenCot_(ten);
    if (Object.prototype.hasOwnProperty.call(theoKhoa, k)) return String(theoKhoa[k] == null ? '' : theoKhoa[k]);
    if (thieu.indexOf(ten) < 0) thieu.push(ten);
    return toan;
  });
  return { chu: kq, thieu: thieu };
}

/** Đổi thư chữ thường sang HTML đơn giản (giữ xuống dòng, link bấm được). */
function chuSangHtml_(chu) {
  var e = String(chu || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  e = e.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + e.replace(/\r?\n/g, '<br>') + '</div>';
}

/** Bỏ thẻ HTML, lấy chữ thường (dùng làm bản chữ của thư HTML và kiểm tra thư trống). */
function htmlSangChu_(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Lọc HTML do người dùng soạn trước khi lưu và gửi: bỏ thẻ chạy được, thuộc tính on…, link javascript:.
 * Giao diện đã lọc một lần; đây là lớp chặn thứ hai ở máy chủ.
 */
function lamSachHtml_(html) {
  return String(html || '')
    .replace(/<(script|style|iframe|object|embed|form|textarea|select|button|meta|link|base|frame|frameset|applet|noscript)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|meta|link|base|frame|frameset|applet|noscript)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data(?!:image\/)):[^"']*\2/gi, '$1=$2#$2');
}

/** Đổi giá trị thành chữ an toàn để chèn vào HTML. */
function escHtmlChu_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Chuẩn bị gửi hàng loạt từ một thư nháp Gmail. mau: { tieuDe, html }; nguoiNhan: [{ email, duLieu{} }].
 * Thay {TenCot} ở tiêu đề và nội dung (giá trị chèn vào HTML được escape).
 * Trả về { ds[{email, tieuDe, html, chu}], loi }.
 */
function chuanBiGuiTuNhap_(mau, nguoiNhan, gioiHan) {
  mau = mau || {};
  if (!String(mau.tieuDe || '').trim()) return { ds: [], loi: 'Thư nháp chưa có tiêu đề. Mở Gmail, thêm tiêu đề cho thư nháp rồi thử lại.' };
  if (!htmlSangChu_(mau.html) && !/<img/i.test(String(mau.html || ''))) return { ds: [], loi: 'Thư nháp chưa có nội dung.' };
  var ds = [], daCo = {}, thieu = [], sai = [];
  (nguoiNhan || []).forEach(function (n) {
    var e = String(n.email || '').trim();
    if (!emailHopLe_(e)) { sai.push(e || '(trống)'); return; }
    if (daCo[e.toLowerCase()]) return;
    daCo[e.toLowerCase()] = true;
    var d = n.duLieu || {}, dHtml = {};
    Object.keys(d).forEach(function (k) { dHtml[k] = escHtmlChu_(d[k]); });
    var a = thayTheMau_(mau.tieuDe, d), b = thayTheMau_(mau.html, dHtml);
    a.thieu.concat(b.thieu).forEach(function (t) { if (thieu.indexOf(t) < 0) thieu.push(t); });
    ds.push({ email: e, tieuDe: a.chu, html: b.chu, chu: htmlSangChu_(b.chu) });
  });
  if (sai.length) return { ds: [], loi: 'Có ' + sai.length + ' email chưa đúng: ' + sai.slice(0, 5).join(', ') + (sai.length > 5 ? '…' : '') };
  if (thieu.length) return { ds: [], loi: 'Không tìm thấy thông tin cho: ' + thieu.map(function (t) { return '{' + t + '}'; }).join(', ') + '. Sửa thư nháp hoặc chọn nguồn có cột tương ứng.' };
  if (!ds.length) return { ds: [], loi: 'Chưa có người nhận nào.' };
  if (gioiHan != null && ds.length > gioiHan) return { ds: [], loi: 'Gửi ' + ds.length + ' thư nhưng hôm nay tài khoản CLB chỉ còn gửi được ' + gioiHan + ' thư. Bớt người nhận hoặc hẹn giờ sang ngày mai.' };
  return { ds: ds, loi: '' };
}

/**
 * Đọc bảng từ một sheet bất kỳ (dòng tiêu đề đầu tiên có chữ). Trả về { cot[], dong[{...}], cotEmail }.
 * cotEmail là cột đoán là email (tên có chữ "email"/"mail", hoặc cột có nhiều email nhất).
 */
function docBangNgoai_(giaTri) {
  var v = giaTri || [];
  var h = 0;
  while (h < v.length && h < 10 && !v[h].some(function (c) { return String(c).trim(); })) h++;
  if (h >= v.length) return { cot: [], dong: [], cotEmail: '' };
  var cot = v[h].map(function (c, i) { return String(c).trim() || ('Cột ' + (i + 1)); });
  var dong = [];
  for (var r = h + 1; r < v.length; r++) {
    if (!v[r].some(function (c) { return String(c).trim(); })) continue;
    var o = {};
    cot.forEach(function (c, i) { o[c] = v[r][i] instanceof Date ? v[r][i] : String(v[r][i] == null ? '' : v[r][i]).trim(); });
    dong.push(o);
  }
  var cotEmail = cot.filter(function (c) { return /e-?mail|mail/.test(boDau_(c).toLowerCase()); })[0] || '';
  if (!cotEmail) {
    var tot = 0;
    cot.forEach(function (c) {
      var n = dong.filter(function (d) { return emailHopLe_(d[c]); }).length;
      if (n > tot) { tot = n; cotEmail = c; }
    });
  }
  return { cot: cot, dong: dong, cotEmail: cotEmail };
}

/**
 * Chuẩn bị danh sách gửi hàng loạt. nguoiNhan: [{ email, duLieu{} }].
 * Trả về { ds[{email, tieuDe, noiDung}], loi } — báo lỗi nếu email sai, thiếu cột, hay vượt giới hạn.
 */
function chuanBiGuiHangLoat_(tieuDe, noiDung, nguoiNhan, gioiHan) {
  if (!String(tieuDe || '').trim()) return { ds: [], loi: 'Thư chưa có tiêu đề.' };
  if (!String(noiDung || '').trim()) return { ds: [], loi: 'Thư chưa có nội dung.' };
  var ds = [], daCo = {}, thieu = [], sai = [];
  (nguoiNhan || []).forEach(function (n) {
    var e = String(n.email || '').trim();
    if (!emailHopLe_(e)) { sai.push(e || '(trống)'); return; }
    if (daCo[e.toLowerCase()]) return;
    daCo[e.toLowerCase()] = true;
    var d = n.duLieu || {};
    var a = thayTheMau_(tieuDe, d), b = thayTheMau_(noiDung, d);
    a.thieu.concat(b.thieu).forEach(function (t) { if (thieu.indexOf(t) < 0) thieu.push(t); });
    ds.push({ email: e, tieuDe: a.chu, noiDung: b.chu });
  });
  if (sai.length) return { ds: [], loi: 'Có ' + sai.length + ' email chưa đúng: ' + sai.slice(0, 5).join(', ') + (sai.length > 5 ? '…' : '') };
  if (thieu.length) return { ds: [], loi: 'Không tìm thấy thông tin cho: ' + thieu.map(function (t) { return '{' + t + '}'; }).join(', ') + '. Sửa thư hoặc chọn nguồn có cột tương ứng.' };
  if (!ds.length) return { ds: [], loi: 'Chưa có người nhận nào.' };
  if (gioiHan != null && ds.length > gioiHan) return { ds: [], loi: 'Gửi ' + ds.length + ' thư nhưng hôm nay tài khoản CLB chỉ còn gửi được ' + gioiHan + ' thư. Bớt người nhận hoặc hẹn giờ sang ngày mai.' };
  return { ds: ds, loi: '' };
}

/* ===================== Báo cáo ===================== */

function laSeeding_(loai) { return boDau_(loai).toLowerCase().indexOf('seeding') >= 0; }

function tenHoatDongChuan_(t) {
  var x = String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return x || '(không ghi)';
}

/**
 * Danh sách chỉ số của báo cáo: điểm, số lần mỗi loại hoạt động (Seeding tách theo tên hoạt động), task xong, task trễ hạn.
 * Trả về [{ khoa, ten }].
 */
function chiSoBaoCao_(loaiHoatDong, lichSu) {
  var ds = [{ khoa: 'diem', ten: 'Điểm' }];
  loaiHoatDong.forEach(function (l) {
    if (!laSeeding_(l)) { ds.push({ khoa: 'loai:' + l, ten: l }); return; }
    var ten = [];
    lichSu.forEach(function (d) { if (d.loai === l) { var t = tenHoatDongChuan_(d.tenHoatDong); if (ten.indexOf(t) < 0) ten.push(t); } });
    ten.sort();
    if (!ten.length) ds.push({ khoa: 'loai:' + l, ten: l });
    ten.forEach(function (t) { ds.push({ khoa: 'loai:' + l + ':' + t, ten: l + ' (' + t + ')' }); });
  });
  ds.push({ khoa: 'taskXong', ten: 'Task đã xong' });
  ds.push({ khoa: 'taskTre', ten: 'Task trễ hạn' });
  ds.push({ khoa: 'taskKht', ten: 'Task không hoàn thành' });
  return ds;
}

function khoaChiSo_(d) {
  return laSeeding_(d.loai) ? 'loai:' + d.loai + ':' + tenHoatDongChuan_(d.tenHoatDong) : 'loai:' + d.loai;
}

/** Task có bị trễ hạn không (đã xong sau hạn, hoặc chưa xong mà quá hạn). */
function taskBiTre_(t, homNay) {
  if (t.trangThaiLuu === TRANG_THAI_TASK.HUY || !ngayHopLe_(t.hanChot)) return false;
  if (t.trangThaiLuu === TRANG_THAI_TASK.XONG) return !!t.ngayXong && t.ngayXong > t.hanChot;
  return homNay > t.hanChot;
}

/**
 * Tổng hợp báo cáo trong khoảng ngày [tu, den] (yyyy-mm-dd, tính cả hai đầu).
 * lichSu: [{ ngay, ten, loai, tenHoatDong, diem }]; task: [{ nguoi, hanChot, trangThaiLuu, ngayXong }];
 * thanhVien: [{ ten, ban, nhom }] (chỉ người còn trong CLB mới có trong báo cáo);
 * cheDo: 'thanhvien' | 'ban' | 'clb'.
 * Trả về { dong: [{ ten, ban, so: {khoa: số} }] }.
 */
function tongHopBaoCao_(lichSu, task, thanhVien, tu, den, cheDo, homNay, khtSau) {
  var cuaAi = {};
  thanhVien.forEach(function (t) { cuaAi[t.ten] = t; });
  var nhom = function (ten) {
    var tv = cuaAi[ten];
    if (!tv) return null;
    if (cheDo === 'ban') return tv.nhom;
    if (cheDo === 'clb') return 'Cả CLB';
    return ten;
  };
  var bang = {}, thuTu = [];
  var dongCua = function (k) {
    if (!bang[k]) { bang[k] = { ten: k, ban: cheDo === 'thanhvien' ? cuaAi[k].ban : '', so: {} }; thuTu.push(k); }
    return bang[k];
  };
  // Mọi người / ban đều có dòng, kể cả khi bằng 0.
  thanhVien.forEach(function (t) { dongCua(nhom(t.ten)); });
  var cong = function (d, khoa, n) { d.so[khoa] = (d.so[khoa] || 0) + n; };
  lichSu.forEach(function (x) {
    if (x.ngay < tu || x.ngay > den) return;
    var k = nhom(x.ten);
    if (k === null) return;
    var d = dongCua(k);
    cong(d, 'diem', Number(x.diem) || 0);
    cong(d, khoaChiSo_(x), 1);
  });
  task.forEach(function (t) {
    var k = nhom(t.nguoi);
    if (k === null) return;
    var d = dongCua(k);
    if (t.trangThaiLuu === TRANG_THAI_TASK.XONG && t.ngayXong && t.ngayXong >= tu && t.ngayXong <= den) cong(d, 'taskXong', 1);
    if (t.hanChot >= tu && t.hanChot <= den && taskBiTre_(t, homNay)) cong(d, 'taskTre', 1);
    if (t.hanChot >= tu && t.hanChot <= den && laKhongHoanThanh_(t.trangThaiLuu, t.hanChot, homNay, khtSau)) cong(d, 'taskKht', 1);
  });
  return { dong: thuTu.map(function (k) { return bang[k]; }) };
}

/** Chia khoảng ngày thành các mốc: theo ngày (≤ 31 ngày), theo tuần (≤ 120 ngày), còn lại theo tháng. */
function chiaMoc_(tu, den) {
  var soNgay = soNgayGiua_(tu, den) + 1;
  var kieu = soNgay <= 31 ? 'ngay' : soNgay <= 120 ? 'tuan' : 'thang';
  var moc = [];
  var p = tu.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var chu = function (x) { return x.toISOString().slice(0, 10); };
  while (chu(d) <= den) {
    var batDau = chu(d), ketThuc, nhan;
    if (kieu === 'ngay') { ketThuc = batDau; nhan = batDau.slice(8, 10) + '/' + batDau.slice(5, 7); d.setUTCDate(d.getUTCDate() + 1); }
    else if (kieu === 'tuan') {
      var e = new Date(d); e.setUTCDate(e.getUTCDate() + (7 - ((e.getUTCDay() + 6) % 7)) - 1); // đến Chủ nhật
      ketThuc = chu(e) < den ? chu(e) : den; nhan = batDau.slice(8, 10) + '/' + batDau.slice(5, 7);
      d = new Date(e); d.setUTCDate(d.getUTCDate() + 1);
    } else {
      var c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      ketThuc = chu(c) < den ? chu(c) : den; nhan = batDau.slice(5, 7) + '/' + batDau.slice(0, 4);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    moc.push({ tu: batDau, den: ketThuc, nhan: nhan });
  }
  return { kieu: kieu, moc: moc };
}

/** Số liệu theo từng mốc cho biểu đồ: { moc[], chuoi: { tenDong: [ {khoa: số} theo mốc ] } }. */
function bieuDoBaoCao_(lichSu, task, thanhVien, tu, den, cheDo, homNay, khtSau) {
  var c = chiaMoc_(tu, den);
  var chuoi = {};
  c.moc.forEach(function (m, i) {
    tongHopBaoCao_(lichSu, task, thanhVien, m.tu, m.den, cheDo, homNay, khtSau).dong.forEach(function (d) {
      if (!chuoi[d.ten]) chuoi[d.ten] = c.moc.map(function () { return {}; });
      chuoi[d.ten][i] = d.so;
    });
  });
  return { kieu: c.kieu, moc: c.moc, chuoi: chuoi };
}

/* ===================== File đăng ký log ===================== */

/**
 * Tìm dòng tiêu đề trong sheet mẫu: dòng đầu (trong 15 dòng) có ô Họ và tên.
 * Trả về { dong, cot: { stt, ten, ban, sdt }, cotBuoi } (vị trí tính từ 0; cotBuoi là cột trống đầu tiên sau tiêu đề), hoặc null.
 */
function timTieuDeMauLog_(values) {
  var TEN = ['hovaten', 'hoten', 'ten', 'tenthanhvien'], BAN = ['ban'], SDT = ['sodienthoai', 'sdt', 'sodienthoaicanhan', 'dienthoai'], STT = ['stt', 'sothutu'];
  for (var r = 0; r < Math.min(values.length, 15); r++) {
    var cot = {}, cuoi = -1;
    values[r].forEach(function (o, i) {
      var k = chuanHoaTenCot_(o);
      if (k) cuoi = i;
      if (TEN.indexOf(k) >= 0 && cot.ten === undefined) cot.ten = i;
      else if (BAN.indexOf(k) >= 0 && cot.ban === undefined) cot.ban = i;
      else if (SDT.indexOf(k) >= 0 && cot.sdt === undefined) cot.sdt = i;
      else if (STT.indexOf(k) >= 0 && cot.stt === undefined) cot.stt = i;
    });
    if (cot.ten !== undefined) return { dong: r, cot: cot, cotBuoi: cuoi + 1 };
  }
  return null;
}

/** Kiểm tra yêu cầu tạo file log. Trả về { loi, tenFile, nguoi[], buoi[] }. */
function kiemTraFileLog_(yc, thanhVien) {
  yc = yc || {};
  if (!yc.coMau) return { loi: 'Chưa có file mẫu. Dán link file mẫu rồi mới tạo được file đăng ký log.' };
  var tenFile = String(yc.tenFile || '').trim();
  if (!tenFile) return { loi: 'Bạn chưa đặt tên file.' };
  var theoTen = {};
  thanhVien.forEach(function (t) { theoTen[String(t.HoVaTen).toLowerCase()] = t; });
  var nguoi = [], daCo = {};
  (yc.nguoi || []).forEach(function (n) {
    var t = theoTen[String(n).trim().toLowerCase()];
    if (t && !daCo[t.HoVaTen]) { daCo[t.HoVaTen] = true; nguoi.push(t); }
  });
  if (!nguoi.length) return { loi: 'Bạn chưa chọn thành viên nào.' };
  var buoi = (yc.buoi || []).map(function (b) { return String(b || '').trim(); });
  if (!buoi.length) return { loi: 'Cần ít nhất một buổi.' };
  if (buoi.some(function (b) { return !b; })) return { loi: 'Có buổi chưa đặt tên.' };
  return { loi: '', tenFile: tenFile.slice(0, 150), nguoi: nguoi, buoi: buoi };
}

/* Mẫu file log của tool cũ (tab "Đăng ký log" và "Kế hoạch"): các hàm phụ không đụng tới Google. */

/** Số thứ tự cột thành chữ: 1 → A, 5 → E, 27 → AA. */
function chuCot_(so) {
  var chu = '';
  while (so > 0) { var du = (so - 1) % 26; chu = String.fromCharCode(65 + du) + chu; so = (so - du - 1) / 26; }
  return chu;
}

/**
 * Xếp người theo thứ tự ban chuẩn (THU_TU_BAN); cùng ban thì giữ thứ tự trong danh sách thành viên.
 * Trả về { nguoi[], nhomBan[{dau, so}] } — dau là vị trí (từ 0) của người đầu tiên mỗi nhóm ban liền nhau.
 */
function xepTheoBan_(nguoi, thuTu) {
  var viTri = {};
  (thuTu || []).forEach(function (t, i) { viTri[String(t.HoVaTen)] = i; });
  var ds = nguoi.map(function (t, i) { return { t: t, i: viTri[String(t.HoVaTen)] !== undefined ? viTri[String(t.HoVaTen)] : 1e6 + i }; });
  ds.sort(function (a, b) { return soSanhBan_(a.t.Ban, b.t.Ban) || a.i - b.i; });
  var kq = ds.map(function (x) { return x.t; }), nhom = [];
  kq.forEach(function (t, i) {
    if (i && String(t.Ban).trim() === String(kq[i - 1].Ban).trim()) nhom[nhom.length - 1].so++;
    else nhom.push({ dau: i, so: 1 });
  });
  return { nguoi: kq, nhomBan: nhom };
}

/* ===================== Đăng nhập Google ===================== */

/** Kiểm tra thông tin Google trả về cho một ID token. Trả về '' nếu hợp lệ. */
function kiemTraTokenGoogle_(info, clientId, bayGioGiay) {
  if (!info || !info.email) return 'Không xác nhận được tài khoản Google. Bạn thử lại nhé.';
  if (String(info.aud) !== String(clientId)) return 'Mã đăng nhập không phải của app CLB ECO.';
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(String(info.iss)) < 0) return 'Mã đăng nhập không phải do Google cấp.';
  if (!(info.email_verified === true || info.email_verified === 'true')) return 'Email Google này chưa được xác minh.';
  if (Number(info.exp) < bayGioGiay) return 'Mã đăng nhập đã hết hạn. Bạn thử lại nhé.';
  return '';
}

/* ===================== Thông báo đẩy lên điện thoại (Web Push, khoá VAPID) ===================== */
/*
 * Gửi thông báo lên app cài trên điện thoại theo chuẩn Web Push. Máy chủ ký một mã (JWT) bằng chữ ký số
 * ECDSA P-256; Apps Script không có sẵn thuật toán này nên tự tính ở đây bằng BigInt. Không cần dịch vụ ngoài.
 */
var P256_ = null;
function p256_() {
  if (P256_) return P256_;
  var B = function (h) { return BigInt('0x' + h); };
  P256_ = {
    p: B('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: B('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    G: [B('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), B('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')],
    O: BigInt(0), I: BigInt(1), H2: BigInt(2), H3: BigInt(3)
  };
  return P256_;
}
function modP256_(a, m) { var r = a % m; return r < P256_.O ? r + m : r; }
function nghichDaoP256_(a, m) {
  var c = p256_(), t = c.O, t2 = c.I, r = m, r2 = modP256_(a, m);
  while (r2 !== c.O) { var q = r / r2, x = t - q * t2; t = t2; t2 = x; x = r - q * r2; r = r2; r2 = x; }
  return modP256_(t, m);
}
function congDiemP256_(A, Bp) {
  var c = p256_();
  if (!A) return Bp; if (!Bp) return A;
  var l;
  if (A[0] === Bp[0]) {
    if (modP256_(A[1] + Bp[1], c.p) === c.O) return null;
    l = modP256_(c.H3 * A[0] * A[0] - c.H3, c.p) * nghichDaoP256_(c.H2 * A[1], c.p);
  } else {
    l = modP256_(Bp[1] - A[1], c.p) * nghichDaoP256_(Bp[0] - A[0], c.p);
  }
  l = modP256_(l, c.p);
  var x = modP256_(l * l - A[0] - Bp[0], c.p);
  return [x, modP256_(l * (A[0] - x) - A[1], c.p)];
}
function nhanDiemP256_(k, P) {
  var c = p256_(), R = null, Q = P;
  while (k > c.O) { if (k & c.I) R = congDiemP256_(R, Q); Q = congDiemP256_(Q, Q); k = k >> c.I; }
  return R;
}
function soSangByte_(x, dai) {
  var h = x.toString(16); while (h.length < dai * 2) h = '0' + h;
  var b = []; for (var i = 0; i < dai * 2; i += 2) b.push(parseInt(h.substr(i, 2), 16)); return b;
}
function byteSangSo_(b) {
  var h = ''; for (var i = 0; i < b.length; i++) h += ((b[i] & 255) + 256).toString(16).slice(1);
  return BigInt('0x' + (h || '0'));
}
/** Chuỗi base64url (không có dấu =) từ mảng byte. */
function base64Url_(b) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', s = '';
  for (var i = 0; i < b.length; i += 3) {
    var n = ((b[i] & 255) << 16) | (((b[i + 1] || 0) & 255) << 8) | ((b[i + 2] || 0) & 255);
    s += A.charAt((n >> 18) & 63) + A.charAt((n >> 12) & 63) + (i + 1 < b.length ? A.charAt((n >> 6) & 63) : '') + (i + 2 < b.length ? A.charAt(n & 63) : '');
  }
  return s;
}
/** Từ khoá riêng (32 byte) ra khoá công khai dạng 65 byte (04 || X || Y). */
function khoaCongP256_(khoaRieng) {
  var c = p256_(), d = byteSangSo_(khoaRieng);
  if (d <= c.O || d >= c.n) throw new Error('Khoá riêng không hợp lệ.');
  var Q = nhanDiemP256_(d, c.G);
  return [4].concat(soSangByte_(Q[0], 32), soSangByte_(Q[1], 32));
}
/**
 * Ký ECDSA P-256 theo RFC 6979 (số k sinh từ khoá và nội dung, không cần số ngẫu nhiên).
 * bam: 32 byte SHA-256 của nội dung; hmac(khoa, duLieu) trả về 32 byte HMAC-SHA256. Trả về 64 byte r || s.
 */
function kyP256_(bam, khoaRieng, hmac) {
  var c = p256_(), d = byteSangSo_(khoaRieng), z = byteSangSo_(bam);
  var x = soSangByte_(d, 32), h1 = soSangByte_(modP256_(z, c.n), 32);
  var V = [], K = [], i;
  for (i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac(K, V.concat([0], x, h1)); V = hmac(K, V);
  K = hmac(K, V.concat([1], x, h1)); V = hmac(K, V);
  for (var lan = 0; lan < 100; lan++) {
    V = hmac(K, V);
    var k = byteSangSo_(V);
    if (k > c.O && k < c.n) {
      var R = nhanDiemP256_(k, c.G), r = modP256_(R[0], c.n);
      if (r !== c.O) {
        var s2 = modP256_(nghichDaoP256_(k, c.n) * modP256_(z + r * d, c.n), c.n);
        if (s2 !== c.O) return soSangByte_(r, 32).concat(soSangByte_(s2, 32));
      }
    }
    K = hmac(K, V.concat([0])); V = hmac(K, V);
  }
  throw new Error('Không ký được.');
}
/*
 * Mã hoá nội dung thông báo đẩy (RFC 8291, aes128gcm) để điện thoại hiện thông báo ngay, không phải hỏi lại máy chủ.
 * iPhone chỉ cho service worker rất ít thời gian; hỏi lại Apps Script thường quá chậm nên thông báo không hiện.
 */
var AES_ = null;
function aes_() {
  if (AES_) return AES_;
  var sbox = [], x = 1, y = 1, i;
  // Sinh bảng S-box của AES bằng phép nhân trong GF(2^8).
  do {
    x = (x ^ ((x << 1) & 255) ^ (x & 128 ? 0x1b : 0)) & 255;
    y ^= (y << 1) & 255; y ^= (y << 2) & 255; y ^= (y << 4) & 255; y &= 255; if (y & 128) y ^= 0x09;
    var b = y ^ ((y << 1) | (y >> 7)) ^ ((y << 2) | (y >> 6)) ^ ((y << 3) | (y >> 5)) ^ ((y << 4) | (y >> 4));
    sbox[x] = (b ^ 0x63) & 255;
  } while (x !== 1);
  sbox[0] = 0x63;
  AES_ = { sbox: sbox };
  return AES_;
}
function xtime_(a) { return ((a << 1) ^ (a & 128 ? 0x1b : 0)) & 255; }
function moRongKhoaAes_(khoa) {
  var S = aes_().sbox, w = khoa.slice(0, 16), rcon = 1;
  for (var i = 16; i < 176; i += 4) {
    var t = w.slice(i - 4, i);
    if (i % 16 === 0) { t = [S[t[1]] ^ rcon, S[t[2]], S[t[3]], S[t[0]]]; rcon = xtime_(rcon); }
    for (var j = 0; j < 4; j++) w.push(w[i - 16 + j] ^ t[j]);
  }
  return w;
}
function maHoaKhoiAes_(w, vao) {
  var S = aes_().sbox, s = [], r, c, i;
  for (i = 0; i < 16; i++) s[i] = vao[i] ^ w[i];
  for (r = 1; r <= 10; r++) {
    var t = [];
    for (i = 0; i < 16; i++) t[i] = S[s[(i + 4 * (i % 4)) % 16]]; // SubBytes + ShiftRows (cột chính)
    if (r < 10) {
      for (c = 0; c < 16; c += 4) {
        var a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3], e = a0 ^ a1 ^ a2 ^ a3;
        t[c] ^= e ^ xtime_(a0 ^ a1); t[c + 1] ^= e ^ xtime_(a1 ^ a2); t[c + 2] ^= e ^ xtime_(a2 ^ a3); t[c + 3] ^= e ^ xtime_(a3 ^ a0);
      }
    }
    for (i = 0; i < 16; i++) s[i] = t[i] ^ w[16 * r + i];
  }
  return s;
}
function nhanGf128_(X, Y) {
  var Z = [], V = Y.slice(), i, j;
  for (i = 0; i < 16; i++) Z[i] = 0;
  for (i = 0; i < 128; i++) {
    if ((X[i >> 3] >> (7 - (i & 7))) & 1) for (j = 0; j < 16; j++) Z[j] ^= V[j];
    var cuoi = V[15] & 1;
    for (j = 15; j > 0; j--) V[j] = ((V[j] >> 1) | ((V[j - 1] & 1) << 7)) & 255;
    V[0] >>= 1;
    if (cuoi) V[0] ^= 0xe1;
  }
  return Z;
}
/** AES-128-GCM: trả về bản mã nối thẻ xác thực 16 byte. Nonce 12 byte, không có dữ liệu kèm (AAD). */
function maHoaAesGcm_(khoa, nonce, duLieu) {
  var w = moRongKhoaAes_(khoa), H = maHoaKhoiAes_(w, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  var dem = function (n) { return nonce.slice(0, 12).concat([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); };
  var ra = [], g = [], i, j;
  for (i = 0; i < 16; i++) g[i] = 0;
  for (i = 0; i < duLieu.length; i += 16) {
    var k = maHoaKhoiAes_(w, dem(2 + i / 16)), khoi = [];
    for (j = 0; j < 16 && i + j < duLieu.length; j++) { var m = (duLieu[i + j] ^ k[j]) & 255; ra.push(m); khoi.push(m); }
    while (khoi.length < 16) khoi.push(0);
    for (j = 0; j < 16; j++) g[j] ^= khoi[j];
    g = nhanGf128_(g, H);
  }
  var bit = duLieu.length * 8, dai = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (bit >>> 24) & 255, (bit >>> 16) & 255, (bit >>> 8) & 255, bit & 255];
  for (j = 0; j < 16; j++) g[j] ^= dai[j];
  g = nhanGf128_(g, H);
  var e0 = maHoaKhoiAes_(w, dem(1));
  for (j = 0; j < 16; j++) ra.push((g[j] ^ e0[j]) & 255);
  return ra;
}
function chuSangByte_(s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return b; }
/**
 * Thân tin Web Push đã mã hoá (RFC 8291). duLieu: byte nội dung; khoaMay: 65 byte p256dh của máy; auth: 16 byte;
 * rieng: 32 byte khoá tạm của máy chủ; salt: 16 byte ngẫu nhiên; hmac(khoa, duLieu) như kyP256.
 */
function maHoaThongBaoDay_(duLieu, khoaMay, auth, rieng, salt, hmac) {
  var c = p256_();
  if (khoaMay.length !== 65 || khoaMay[0] !== 4 || auth.length !== 16) throw new Error('Khoá của máy không hợp lệ.');
  var cong = khoaCongP256_(rieng);
  var diem = nhanDiemP256_(byteSangSo_(rieng), [byteSangSo_(khoaMay.slice(1, 33)), byteSangSo_(khoaMay.slice(33, 65))]);
  if (!diem) throw new Error('Khoá của máy không hợp lệ.');
  var chung = soSangByte_(diem[0], 32);
  var ikm = hmac(hmac(auth, chung), chuSangByte_('WebPush: info').concat([0], khoaMay, cong, [1]));
  var prk = hmac(salt, ikm);
  var cek = hmac(prk, chuSangByte_('Content-Encoding: aes128gcm').concat([0, 1])).slice(0, 16);
  var nonce = hmac(prk, chuSangByte_('Content-Encoding: nonce').concat([0, 1])).slice(0, 12);
  var ma = maHoaAesGcm_(cek, nonce, duLieu.concat([2]));
  return salt.slice(0, 16).concat([0, 0, 16, 0, 65], cong, ma);
}
/** Phần gốc (https://máy-chủ) của địa chỉ nhận thông báo đẩy; '' nếu không phải https. */
function gocDiaChi_(url) {
  var m = /^https:\/\/[^\/?#]+/i.exec(String(url || ''));
  return m ? m[0] : '';
}

/** Chỉ gửi tới máy chủ nhận thông báo đẩy của Google, Apple, Mozilla, Microsoft. */
function diaChiDayHopLe_(url) {
  var g = gocDiaChi_(url).toLowerCase();
  return !!g && String(url).length < 1000 && /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(g);
}

/** Loại hoạt động BOD cộng tay được không (ô trống là có). */
function loaiCongTay_(l) {
  return String(l.CongTay == null ? '' : l.CongTay).trim().toLowerCase() !== 'khong';
}

/** Các giờ nhắc mỗi ngày: "8, 20" hoặc 20 hoặc [8, 20]. Trống thì 20 giờ. Tối đa 6 giờ. */
function chuanHoaDsGio_(v) {
  var ds = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\s]+/)).map(function (x) { return String(x).trim() === '' ? NaN : Number(x); });
  var kq = [];
  ds.forEach(function (g) { g = Math.round(g); if (g >= 0 && g <= 23 && kq.indexOf(g) < 0) kq.push(g); });
  kq.sort(function (a, b) { return a - b; });
  return kq.length ? kq.slice(0, 6) : [20];
}

/* ===================== Seeding ===================== */

/** Tên Facebook để so: bỏ dấu, chữ thường, bỏ ký tự lạ (biểu tượng, dấu chấm…), gộp khoảng trắng. */
function chuanTenFb_(s) {
  return boDau_(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* ===================== Báo cáo seeding trong app (HR phụ trách seeding) ===================== */

/**
 * Quyền thêm BOD cấp cho HR, ngoài phụ trách ban (cột BanQuanLy): chỉ còn phụ trách seeding.
 * Mã cũ khác trong sheet (CRE, SUP-RES) được bỏ qua.
 */
var NHOM_HR = ['SUP-SEED'];
/** Tên tiếng Việt hiện trong app (trong sheet vẫn lưu mã cũ để dữ liệu cũ dùng tiếp được). */
var TEN_NHOM_HR = { 'SUP-SEED': 'Phụ trách seeding' };

/** Đọc ô NhomHr ("SUP-SEED, CRE") thành danh sách nhóm hợp lệ. */
function nhomHr_(giaTri) {
  var ds = [];
  String(giaTri == null ? '' : giaTri).split(/[,;]/).forEach(function (x) {
    var n = chuanChu_(x).replace(/\s+/g, '');
    if (NHOM_HR.indexOf(n) >= 0 && ds.indexOf(n) < 0) ds.push(n);
  });
  return ds;
}

/** Được điền báo cáo seeding: BOD, hoặc người được BOD cấp quyền phụ trách seeding (mã SUP-SEED). */
function duocBaoCaoSeeding_(tk) {
  return !!tk && (String(tk.VaiTro) === 'BOD' || nhomHr_(tk.NhomHr).indexOf('SUP-SEED') >= 0);
}

/** Link bài đăng để so trùng: bỏ giao thức, www/m/web, dấu / cuối, phần # và tham số (trừ link dạng .php cần tham số). */
function chuanLinkBai_(link) {
  var s = String(link || '').trim().toLowerCase().replace(/#.*$/, '').replace(/^https?:\/\//, '').replace(/^(www|m|web|mbasic)\./, '');
  var q = s.indexOf('?');
  if (q >= 0 && s.slice(0, q).indexOf('.php') < 0) s = s.slice(0, q);
  return s.replace(/\/+$/, '');
}

/**
 * Dò các dòng tên (mỗi dòng một tên Facebook) với thành viên: khớp Tên Facebook trước, không có thì khớp Họ và tên.
 * Không phân biệt dấu, hoa thường, ký tự lạ. Trả về { ten: [họ tên, không trùng], khongKhop: [dòng không khớp ai] }.
 */
function khopTenSeeding_(chuoi, thanhVien) {
  var theoFb = {}, theoTen = {};
  thanhVien.forEach(function (tv) {
    var k = chuanTenFb_(tv.TenFacebook);
    if (k) (theoFb[k] = theoFb[k] || []).push(String(tv.HoVaTen));
    var t = chuanTenFb_(tv.HoVaTen);
    if (t) (theoTen[t] = theoTen[t] || []).push(String(tv.HoVaTen));
  });
  var kq = { ten: [], khongKhop: [] };
  String(chuoi == null ? '' : chuoi).split(/\r?\n/).forEach(function (dong) {
    var k = chuanTenFb_(dong);
    if (!k) return;
    var ai = theoFb[k] || theoTen[k];
    if (!ai) { var goc = String(dong).trim(); if (kq.khongKhop.indexOf(goc) < 0) kq.khongKhop.push(goc); return; }
    ai.forEach(function (ten) { if (kq.ten.indexOf(ten) < 0) kq.ten.push(ten); });
  });
  return kq;
}

/**
 * Một báo cáo seeding thành các dòng cộng điểm.
 * yc = { link, lucDang (mili giây), react (mỗi dòng một tên), comment }.
 * thanhVien: người được cộng (không có BOD). baoCaoCu: các dòng BaoCaoSeeding đã có (để chặn trùng bài).
 * Trả về { dong, bao (dòng BaoCaoSeeding), react, comment, khongKhop, canhBao, loi }.
 */
function taoBaoCaoSeeding_(yc, thanhVien, loaiHoatDong, ky, nguoiNop, bayGio, baoCaoCu, lichSu) {
  var kq = { dong: [], bao: null, react: [], comment: [], khongKhop: [], canhBao: [], loi: '' };
  var loi = function (s) { kq.loi = s; return kq; };
  if (!ky) return loi('Chưa có giai đoạn nào nên chưa cộng được. BOD cần tải danh sách thành viên kiểu "Sau tuyển đợt 1" trước.');
  yc = yc || {};
  var link = String(yc.link || '').trim();
  if (!linkHopLe_(link)) return loi('Dán link bài đăng (bắt đầu bằng https://).');
  // Giờ đăng bài không bắt buộc: không ghi thì lấy giờ gửi báo cáo (người điền gửi sau khi bài đủ số giờ seeding).
  var lucDang = Number(yc.lucDang) || 0;
  if (lucDang && isNaN(new Date(lucDang).getTime())) return loi('Thời gian đăng bài chưa đúng.');
  if (lucDang > bayGio.getTime() + 5 * 60000) return loi('Thời gian đăng bài đang ở tương lai. Kiểm tra lại ngày giờ.');
  var khoaLink = chuanLinkBai_(link);
  var trung = (baoCaoCu || []).filter(function (b) { return String(b.TrangThai || '') !== 'Đã huỷ' && chuanLinkBai_(b.LinkBai) === khoaLink; })[0];
  if (trung) return loi('Bài này đã có báo cáo của ' + String(trung.NguoiNop) + '. Muốn sửa thì nhờ BOD huỷ báo cáo cũ rồi điền lại.');
  var loaiReact = loaiDungCho_(loaiHoatDong, DUNG_CHO.REACT), loaiComment = loaiDungCho_(loaiHoatDong, DUNG_CHO.COMMENT);
  var r = khopTenSeeding_(yc.react, thanhVien), c = khopTenSeeding_(yc.comment, thanhVien);
  if (r.ten.length && !loaiReact) return loi('Chưa có loại điểm dùng cho react. BOD chọn trong Cài đặt, mục Thang điểm.');
  if (c.ten.length && !loaiComment) return loi('Chưa có loại điểm dùng cho comment. BOD chọn trong Cài đặt, mục Thang điểm.');
  if (!r.ten.length && !c.ten.length && !r.khongKhop.length && !c.khongKhop.length) return loi('Bạn chưa dán tên ai.');
  kq.react = r.ten; kq.comment = c.ten;
  r.khongKhop.concat(c.khongKhop).forEach(function (x) { if (kq.khongKhop.indexOf(x) < 0) kq.khongKhop.push(x); });
  var han = QUY_TAC.seedingGio, qua = QUY_TAC.seedingQuaNgay;
  var gio = lucDang ? (bayGio.getTime() - lucDang) / 3600000 : han;
  if (gio < han) kq.canhBao.push('Bài mới đăng được ' + Math.floor(gio) + ' giờ, chưa đủ ' + han + ' giờ. Ai react hoặc comment sau lúc gửi sẽ không được cộng.');
  if (gio > 24 * qua) kq.canhBao.push('Bài đã đăng hơn ' + qua + ' ngày. Chỉ ghi những người react hoặc comment trong ' + han + ' giờ đầu.');
  var maCua = {};
  thanhVien.forEach(function (tv) { maCua[String(tv.HoVaTen).toLowerCase()] = String(tv.MaTV || ''); });
  var them = function (ds, loai) {
    ds.forEach(function (ten) {
      kq.dong.push({
        ThoiGian: bayGio, MaTV: maCua[ten.toLowerCase()] || '', HoVaTen: ten, LoaiHoatDong: String(loai.TenLoai), TenHoatDong: link.slice(0, 200), Diem: Number(loai.Diem) || 0,
        NguoiCong: 'Seeding: ' + nguoiNop, NhiemKy: String(ky.NhiemKy), GiaiDoan: Number(ky.GiaiDoan)
      });
    });
  };
  if (loaiReact) them(r.ten, loaiReact);
  if (loaiComment) them(c.ten, loaiComment);
  var vuot = vuotGioiHan_(kq.dong, loaiHoatDong, lichSu || [], ky);
  if (vuot) return loi(vuot);
  kq.bao = {
    ThoiGian: bayGio, NguoiNop: nguoiNop, LinkBai: link, LucDang: lucDang ? new Date(lucDang) : '',
    React: r.ten.join(', '), Comment: c.ten.join(', '), KhongKhop: kq.khongKhop.join(', ').slice(0, 2000), TrangThai: 'Đã cộng', NguoiHuy: ''
  };
  return kq;
}

/** Giao diện theo mùa và ngày lễ do BOD chọn (trống là giao diện xanh mặc định). Tên, màu, hình nằm ở ChuDe.html. */
var CHU_DE = ['xuan', 'ha', 'thu', 'dong', 'tet', 'phunu', 'traidat', 'quockhanh', 'trungthu', 'halloween', 'nhagiao', 'giangsinh'];
/** Giao diện luôn tối (bất kể người dùng chọn sáng hay tối). */
var CHU_DE_TOI = ['halloween'];
function chuDeHopLe_(ma) { ma = String(ma == null ? '' : ma).trim(); return CHU_DE.indexOf(ma) >= 0 ? ma : ''; }
/** Thuộc tính gắn vào thẻ html khi trang được tạo, để giao diện hiện đúng ngay từ đầu, không bị nháy màu xanh. */
function thuocTinhChuDe_(ma) {
  ma = chuDeHopLe_(ma);
  if (!ma) return '';
  return ' data-chude="' + ma + '"' + (CHU_DE_TOI.indexOf(ma) >= 0 ? ' data-theme="dark"' : '');
}

/** Các cách nhận thông báo. */
var CACH_THONG_BAO = ['zalo', 'app', 'mail'];
/** Chuẩn hoá lựa chọn cách nhận thông báo (chuỗi "zalo,mail" hoặc mảng). Trống thì mặc định Zalo. */
function chuanHoaCachNhan_(giaTri) {
  var ds = Array.isArray(giaTri) ? giaTri : String(giaTri || '').split(/[,\s]+/);
  var kq = CACH_THONG_BAO.filter(function (c) { return ds.indexOf(c) >= 0; });
  return kq.length ? kq : ['zalo'];
}

/* ===================== KPI log (quy chế 2026-2027, mục II.1) ===================== */

/**
 * Mỗi đợt log có số buổi dự kiến và số buổi giao cho từng thành viên (mặc định, hoặc riêng theo ban, theo khối lớp).
 * Buổi huỷ vì hết việc làm số buổi được giao cuối giảm theo tỉ lệ; buổi huỷ vì lý do khác tính là đã tham gia
 * với người đã đăng ký buổi đó. Đạt khi số buổi đã tham gia đủ phần trăm đạt KPI log (Cài đặt, Quy tắc) của chỉ tiêu cuối.
 */
var TRANG_THAI_BUOI = { CHUA: 'Chưa diễn ra', DIEN_RA: 'Đã diễn ra', HUY_HET_VIEC: 'Huỷ vì hết việc', HUY_KHAC: 'Huỷ vì lý do khác', XOA: 'Đã xoá' };
var SU_KIEN_CHOT = 'Đã chốt', SU_KIEN_HUY = 'Đã huỷ';
var TOI_DA_BUOI_LOG = 200;

/** Khối lớp từ cột Lớp: "9A1" -> 9, "10 Anh" -> 10. Không đọc được thì 0. */
function khoiLop_(lop) {
  var m = /^\s*(\d{1,2})(?!\d)/.exec(String(lop == null ? '' : lop));
  return m ? Number(m[1]) : 0;
}

/** Đọc cột GiaoRieng (chuỗi JSON) thành danh sách { loai: 'ban' | 'khoi', gia, so }. */
function docGiaoRieng_(v) {
  var ds = v;
  if (typeof v === 'string') { try { ds = v.trim() ? JSON.parse(v) : []; } catch (e) { ds = []; } }
  return Array.isArray(ds) ? ds.filter(function (r) { return r && (r.loai === 'ban' || r.loai === 'khoi'); }) : [];
}

/**
 * Số buổi giao ban đầu cho một thành viên. Ưu tiên: theo khối lớp, rồi theo ban, rồi mặc định.
 * Quy định theo ban khớp cả tên ban đầy đủ ("PR CAP") lẫn nhóm ban ("PR").
 */
function giaoBanDau_(suKien, tv) {
  var rieng = docGiaoRieng_(suKien.GiaoRieng);
  var khoi = khoiLop_(tv.Lop), ban = String(tv.Ban || '').trim().toUpperCase(), nhom = nhomBan_(tv.Ban);
  for (var i = 0; i < rieng.length; i++) if (rieng[i].loai === 'khoi' && khoi && Number(rieng[i].gia) === khoi) return Number(rieng[i].so) || 0;
  for (var j = 0; j < rieng.length; j++) {
    var g = String(rieng[j].gia || '').trim().toUpperCase();
    if (rieng[j].loai === 'ban' && g && (g === ban || g === nhom)) return Number(rieng[j].so) || 0;
  }
  return Number(suKien.GiaoMacDinh) || 0;
}

/** Kiểm tra đợt log do BOD nhập. Trả về { dong, loi }. */
function chuanHoaSuKienLog_(yc) {
  yc = yc || {};
  var ten = String(yc.ten || '').trim();
  if (!ten) return { loi: 'Bạn chưa đặt tên đợt log.' };
  if (ten.length > 150) return { loi: 'Tên đợt log dài quá 150 ký tự.' };
  var duKien = Number(yc.soBuoiDuKien);
  if (!(duKien >= 1 && duKien <= TOI_DA_BUOI_LOG) || Math.floor(duKien) !== duKien) return { loi: 'Số buổi dự kiến phải là số nguyên từ 1 đến ' + TOI_DA_BUOI_LOG + '.' };
  var soGiao = function (v, ten2) {
    var n = String(v == null ? '' : v).trim() === '' ? NaN : Number(v);
    if (!(n >= 0) || Math.floor(n) !== n) return { loi: 'Số buổi giao ' + ten2 + ' phải là số nguyên không âm.' };
    if (n > duKien) return { loi: 'Số buổi giao ' + ten2 + ' (' + n + ') nhiều hơn số buổi dự kiến (' + duKien + ').' };
    return { so: n };
  };
  var mac = soGiao(yc.giaoMacDinh, 'mặc định');
  if (mac.loi) return { loi: mac.loi };
  var rieng = [], daCo = {};
  var ds = yc.giaoRieng || [];
  for (var i = 0; i < ds.length; i++) {
    var r = ds[i] || {};
    var loai = r.loai === 'khoi' ? 'khoi' : 'ban';
    var gia = loai === 'khoi' ? Number(r.gia) : String(r.gia || '').trim().toUpperCase();
    if (loai === 'khoi' && !(gia >= 1 && gia <= 12 && Math.floor(gia) === gia)) return { loi: 'Khối lớp phải là số từ 1 đến 12.' };
    if (loai === 'ban' && !gia) return { loi: 'Bạn chưa chọn ban cho một dòng giao riêng.' };
    var nhan = loai === 'khoi' ? 'cho khối ' + gia : 'cho ban ' + gia;
    var so = soGiao(r.so, nhan);
    if (so.loi) return { loi: so.loi };
    if (daCo[loai + gia]) return { loi: 'Số buổi giao ' + nhan + ' bị nhập hai lần.' };
    daCo[loai + gia] = true;
    rieng.push({ loai: loai, gia: gia, so: so.so });
  }
  return {
    loi: '',
    dong: { TenSuKien: ten, SoBuoiDuKien: duKien, GiaoMacDinh: mac.so, GiaoRieng: rieng.length ? JSON.stringify(rieng) : '' }
  };
}

/** Kiểm tra một buổi log. Trả về { dong, loi }. */
function chuanHoaBuoiLog_(yc) {
  yc = yc || {};
  var ten = String(yc.ten || '').trim();
  if (!ten) return { loi: 'Bạn chưa đặt tên buổi.' };
  if (ten.length > 100) return { loi: 'Tên buổi dài quá 100 ký tự.' };
  var ngay = String(yc.ngay || '').trim();
  if (ngay && !ngayHopLe_(ngay)) return { loi: 'Ngày của buổi không hợp lệ.' };
  var tl = Number(yc.thoiLuong);
  if (QUY_TAC.thoiLuongBuoi.indexOf(tl) < 0) return { loi: 'Thời lượng buổi là ' + QUY_TAC.thoiLuongBuoi.join(' hoặc ') + ' phút.' };
  var tt = String(yc.trangThai || TRANG_THAI_BUOI.CHUA);
  if ([TRANG_THAI_BUOI.CHUA, TRANG_THAI_BUOI.DIEN_RA, TRANG_THAI_BUOI.HUY_HET_VIEC, TRANG_THAI_BUOI.HUY_KHAC].indexOf(tt) < 0) return { loi: 'Trạng thái buổi không hợp lệ.' };
  var ds = function (v) {
    var kq = [], co = {};
    (Array.isArray(v) ? v : tachTen_(v)).forEach(function (n) { n = String(n).trim(); if (n && !co[n.toLowerCase()]) { co[n.toLowerCase()] = true; kq.push(n); } });
    return kq;
  };
  return { loi: '', dong: { TenBuoi: ten, Ngay: ngay, ThoiLuong: tl, TrangThai: tt, DangKy: ds(yc.dangKy).join(', '), CoMat: ds(yc.coMat).join(', ') } };
}

/** Tách ô danh sách tên (ngăn cách bằng dấu phẩy). */
function tachTen_(s) {
  return String(s == null ? '' : s).split(',').map(function (x) { return x.trim(); }).filter(String);
}

function coTen_(ds, ten) {
  var k = String(ten).trim().toLowerCase();
  for (var i = 0; i < ds.length; i++) if (String(ds[i]).trim().toLowerCase() === k) return true;
  return false;
}

/** Buổi tính vào đợt log (bỏ buổi đã xoá), xếp theo ngày rồi theo lúc tạo. */
function buoiHieuLuc_(buoi) {
  return buoi.filter(function (b) { return String(b.TrangThai) !== TRANG_THAI_BUOI.XOA; }).sort(function (a, b) {
    var na = String(a.Ngay || ''), nb = String(b.Ngay || '');
    if (na !== nb) return na < nb ? -1 : 1;
    return Number(a.ThoiGian) - Number(b.ThoiGian);
  });
}

/**
 * Số buổi thực diễn ra. Sau khi chốt: số buổi đã diễn ra hoặc huỷ vì lý do khác.
 * Trước khi chốt: số buổi dự kiến trừ số buổi đã huỷ vì hết việc.
 */
function soBuoiThucDien_(suKien, buoi) {
  var ds = buoiHieuLuc_(buoi);
  if (String(suKien.TrangThai) === SU_KIEN_CHOT) {
    return ds.filter(function (b) { return b.TrangThai === TRANG_THAI_BUOI.DIEN_RA || b.TrangThai === TRANG_THAI_BUOI.HUY_KHAC; }).length;
  }
  return Math.max(0, Number(suKien.SoBuoiDuKien) - ds.filter(function (b) { return b.TrangThai === TRANG_THAI_BUOI.HUY_HET_VIEC; }).length);
}

/** Số buổi được giao cuối = thực diễn × (giao ban đầu ÷ dự kiến), không bao giờ lớn hơn giao ban đầu. Giữ số lẻ. */
function giaoCuoi_(giao, duKien, thucDien) {
  if (!giao || !duKien) return 0;
  return Math.min(giao, thucDien * giao / duKien);
}

/**
 * KPI log của một người trong một đợt log.
 * thamGia: buổi đã diễn ra có mặt, và buổi huỷ vì lý do khác mà người đó đã đăng ký.
 * vuot: các buổi được cộng điểm làm vượt, là những buổi có mặt muộn nhất vượt quá số buổi được giao cuối
 * (chỉ tính buổi thực sự diễn ra).
 */
function kpiLogSuKien_(suKien, buoi, tv) {
  var ten = String(tv.HoVaTen);
  var giao = giaoBanDau_(suKien, tv);
  var ds = buoiHieuLuc_(buoi);
  var thamGia = [], coMat = [];
  ds.forEach(function (b) {
    if (b.TrangThai === TRANG_THAI_BUOI.DIEN_RA && coTen_(tachTen_(b.CoMat), ten)) { thamGia.push(b); coMat.push(b); }
    else if (b.TrangThai === TRANG_THAI_BUOI.HUY_KHAC && coTen_(tachTen_(b.DangKy), ten)) thamGia.push(b);
  });
  var cuoi = giaoCuoi_(giao, Number(suKien.SoBuoiDuKien), soBuoiThucDien_(suKien, buoi));
  var soVuot = Math.min(coMat.length, Math.max(0, Math.floor(thamGia.length - cuoi + 1e-9)));
  return { giao: giao, giaoCuoi: cuoi, thamGia: thamGia.length, vuot: soVuot ? coMat.slice(coMat.length - soVuot) : [] };
}

/** Làm tròn số buổi được giao cuối để hiện (tối đa 2 chữ số thập phân). */
function hienSoBuoi_(x) { return Math.round(x * 100) / 100; }

/**
 * KPI log của một người qua các đợt log của nhiệm kỳ (đợt log đã huỷ không tính).
 * dsSuKien: mỗi đợt log kèm mảng buoi. Người vào ở giai đoạn 2 trở đi chỉ tính đợt log tạo từ lúc giai đoạn mình vào bắt đầu.
 * mocGd: { số giai đoạn: lúc bắt đầu (ms) }.
 * Trả về { giaoCuoi, thamGia, tiLe, chiTiet[] }; tiLe null khi chưa được giao buổi nào.
 */
function kpiLogCuaNguoi_(tv, dsSuKien, mocGd) {
  var moc = gdVao_(tv) >= 2 ? Number((mocGd || {})[gdVao_(tv)]) || 0 : 0;
  var kq = { giaoCuoi: 0, thamGia: 0, tiLe: null, chiTiet: [] };
  dsSuKien.forEach(function (s) {
    if (String(s.TrangThai) === SU_KIEN_HUY) return;
    if (moc && new Date(s.ThoiGian).getTime() < moc) return;
    var k = kpiLogSuKien_(s, s.buoi || [], tv);
    if (!k.giao) return;
    kq.giaoCuoi += k.giaoCuoi;
    kq.thamGia += k.thamGia;
    kq.chiTiet.push({ suKien: new Date(s.ThoiGian).getTime(), ten: String(s.TenSuKien), daChot: String(s.TrangThai) === SU_KIEN_CHOT, giao: k.giao, giaoCuoi: hienSoBuoi_(k.giaoCuoi), thamGia: k.thamGia, vuot: k.vuot.length });
  });
  kq.tiLe = kq.giaoCuoi > 0 ? Math.round(kq.thamGia * 100 / kq.giaoCuoi + 1e-9) : null;
  kq.giaoCuoi = hienSoBuoi_(kq.giaoCuoi);
  return kq;
}

/**
 * Các dòng LichSuDiem cộng điểm log vượt khi chốt đợt log: mỗi buổi vượt một dòng, theo loại hoạt động gắn với
 * thời lượng của buổi đó (log90, log180…). Trả về { dong, loi }.
 */
function dongDiemLogVuot_(suKien, buoi, thanhVien, loaiHoatDong, ky, nguoiCong, bayGio) {
  var dong = [];
  var thieu = {};
  thanhVien.forEach(function (tv) {
    kpiLogSuKien_(suKien, buoi, tv).vuot.forEach(function (b) {
      var tl = Math.round(Number(b.ThoiLuong)) || QUY_TAC.thoiLuongBuoi[0];
      var loai = loaiDungCho_(loaiHoatDong, dungChoLog_(tl));
      if (!loai) { thieu[tl] = true; return; }
      dong.push({
        ThoiGian: bayGio, MaTV: String(tv.MaTV || ''), HoVaTen: String(tv.HoVaTen), LoaiHoatDong: String(loai.TenLoai),
        TenHoatDong: (String(suKien.TenSuKien) + ' · ' + String(b.TenBuoi)).slice(0, 200), Diem: Number(loai.Diem) || 0,
        NguoiCong: nguoiCong, NhiemKy: ky ? String(ky.NhiemKy) : '', GiaiDoan: ky ? Number(ky.GiaiDoan) : ''
      });
    });
  });
  var tl = Object.keys(thieu);
  if (tl.length) return { dong: [], loi: 'Chưa có loại điểm dùng cho buổi log dư ' + tl.join(' và ') + ' phút. BOD chọn trong Cài đặt, mục Thang điểm.' };
  if (dong.length && !ky) return { dong: [], loi: 'Chưa có giai đoạn nào nên chưa cộng được điểm buổi log dư.' };
  return { dong: dong, loi: '' };
}

/**
 * Đọc đăng ký từ file đăng ký log (giá trị của một tab).
 * toolCu: tab "Đăng ký log" của tool cũ: dòng 4 là tên buổi từ cột E đến trước cột Ghi chú, từ dòng 5 là họ tên ở cột A.
 * Mẫu khác: dòng tiêu đề có cột Họ và tên; các cột có tiêu đề sau cột Họ tên, Ban, SĐT là các buổi.
 * Trả về [{ ten, dangKy: [họ tên] }].
 */
function docDangKyLog_(values, toolCu) {
  var dongTieuDe, cotTen, cotDau;
  if (toolCu) { dongTieuDe = 3; cotTen = 0; cotDau = 4; }
  else {
    var td = timTieuDeMauLog_(values);
    if (!td) return [];
    dongTieuDe = td.dong; cotTen = td.cot.ten;
    cotDau = Math.max.apply(null, Object.keys(td.cot).map(function (k) { return td.cot[k]; })) + 1;
  }
  var tieuDe = values[dongTieuDe] || [];
  var buoi = [];
  for (var c = cotDau; c < tieuDe.length; c++) {
    var ten = String(tieuDe[c] == null ? '' : tieuDe[c]).trim();
    if (chuanHoaTenCot_(ten) === 'ghichu') break;
    if (ten) buoi.push({ cot: c, ten: ten, dangKy: [] });
  }
  for (var r = dongTieuDe + 1; r < values.length; r++) {
    var nguoi = String(values[r][cotTen] == null ? '' : values[r][cotTen]).trim();
    if (!nguoi) continue;
    buoi.forEach(function (b) { var v = values[r][b.cot]; if (v === true || String(v).toUpperCase() === 'TRUE') b.dangKy.push(nguoi); });
  }
  return buoi.map(function (b) { return { ten: b.ten, dangKy: b.dangKy }; });
}

/* ===================== Tổng kết và certificate (quy chế 2026-2027, mục II.5, III.4) ===================== */

var KQ_CERT = { CAP: 'Cấp', CAP_BU_TRU: 'Cấp nhờ bù trừ', CHUA: 'Chưa cấp' };

/**
 * Những người trong top tiLe% theo một cột điểm. Người bằng điểm với người cuối trong top cũng được tính,
 * người 0 điểm không được tính. Trả về { top: {tên viết thường: true}, hang: {tên viết thường: hạng} }.
 */
function xepHangTop_(ds, khoa, tiLe) {
  var top = {}, hang = {};
  var sx = ds.filter(function (p) { return p[khoa] !== null && p[khoa] !== undefined; }).sort(function (a, b) { return b[khoa] - a[khoa]; });
  sx.forEach(function (p, i) { hang[String(p.ten).toLowerCase()] = i && sx[i - 1][khoa] === p[khoa] ? hang[String(sx[i - 1].ten).toLowerCase()] : i + 1; });
  var k = Math.round(sx.length * tiLe / 100 + 1e-9);
  if (k) {
    var nguong = sx[k - 1][khoa];
    sx.forEach(function (p) { if (p[khoa] > 0 && p[khoa] >= nguong) top[String(p.ten).toLowerCase()] = true; });
  }
  return { top: top, hang: hang, so: sx.length };
}

/** Phần trăm KPI task để xét chứng nhận. Chưa có task nào có kết quả: null. */
function phanTramTaskCert_(k) {
  return k && k.task ? k.task.tiLe : null;
}

/** Tổng điểm từ giai đoạn g trở đi (gd: mảng điểm giai đoạn 1..n, null là chưa vào). */
function diemTuGiaiDoan_(gd, g) {
  var t = 0;
  for (var i = Math.max(1, g) - 1; i < (gd || []).length; i++) t += Number(gd[i]) || 0;
  return t;
}

/**
 * Xét chứng nhận (certificate) cho từng người theo quy tắc của nhiệm kỳ.
 * ds: [{ ten, ban, gdVao, kpi: { log: {tiLe}, task: {tiLe} }, gd: [điểm từng giai đoạn] }].
 * - Log và task đều đạt mức đạt của ban mình (mặc định 80%): cấp.
 * - Mỗi phần từ mức bù trừ (mặc định 60%): xét bù trừ. Người vào ở giai đoạn g được xếp hạng theo điểm từ giai đoạn g trở đi,
 *   cùng mọi người đã có mặt từ giai đoạn g trở về trước (chính thức xếp với chính thức theo điểm cả nhiệm kỳ; bổ sung vào ở
 *   giai đoạn 2 xếp với tất cả theo điểm từ giai đoạn 2). Lọt top tiLeBuTru% (mặc định 40%) thì cấp.
 * - Có phần dưới mức bù trừ: chưa cấp. Phần chưa được giao việc gì (null) coi như đạt.
 */
function xetCertificate_(ds, qt) {
  qt = qt || QUY_TAC;
  var gdCua = function (p) { return Math.max(1, Number(p.gdVao) || (p.boSung ? 2 : 1)); };
  var bangCua = {};
  var xepHang = function (g) {
    if (!bangCua[g]) {
      var trong = ds.filter(function (p) { return gdCua(p) <= g; }).map(function (p) { return { ten: p.ten, d: diemTuGiaiDoan_(p.gd, g) }; });
      bangCua[g] = { xh: xepHangTop_(trong, 'd', qt.tiLeBuTru), ds: trong };
    }
    return bangCua[g];
  };
  return ds.map(function (p) {
    var log = p.kpi && p.kpi.log ? p.kpi.log.tiLe : null, task = phanTramTaskCert_(p.kpi);
    var dat = function (x, muc) { return x === null || x === undefined || x >= muc; };
    var kq = { ten: p.ten, ban: p.ban, boSung: gdCua(p) >= 2, gdVao: gdCua(p), log: log, task: task, buTru: false, topBuTru: false, hangBuTru: null, soBuTru: null, diemBuTru: null,
      datLog: mucDatCua_(p.ban, 'datLog', qt), datTask: mucDatCua_(p.ban, 'datTask', qt) };
    if (dat(log, kq.datLog) && dat(task, kq.datTask)) kq.ketQua = KQ_CERT.CAP;
    else if (dat(log, qt.mucBuTru) && dat(task, qt.mucBuTru)) {
      var b = xepHang(kq.gdVao), k = String(p.ten).toLowerCase();
      kq.buTru = true;
      kq.topBuTru = !!b.xh.top[k];
      kq.hangBuTru = b.xh.hang[k] || null;
      kq.soBuTru = b.xh.so;
      kq.diemBuTru = diemTuGiaiDoan_(p.gd, kq.gdVao);
      kq.ketQua = kq.topBuTru ? KQ_CERT.CAP_BU_TRU : KQ_CERT.CHUA;
    } else kq.ketQua = KQ_CERT.CHUA;
    return kq;
  });
}

/**
 * Danh sách khen thưởng theo điểm từ bảng điểm (tongHopBangDiem_): top từng giai đoạn, top cả nhiệm kỳ,
 * và người lọt top ở mọi giai đoạn (khi đã có từ hai giai đoạn).
 * @param {number} n giai đoạn đang chạy
 */
function danhSachKhenThuong_(bang, n) {
  var sx = function (ds) { return ds.sort(function (a, b) { return b.diem - a.diem; }); };
  var gd = [];
  for (var g = 1; g <= n; g++) {
    gd.push({ giaiDoan: g, ds: sx(bang.filter(function (p) { return p.topGd && p.topGd[g - 1]; }).map(function (p) { return { ten: p.ten, ban: p.ban, diem: p.gd[g - 1] }; })) });
  }
  return {
    gd: gd,
    caKy: n >= 2 ? sx(bang.filter(function (p) { return p.topCaKy; }).map(function (p) { return { ten: p.ten, ban: p.ban, diem: p.caKy }; })) : [],
    moiGiaiDoan: n >= 2 ? sx(bang.filter(function (p) { return p.topGd && p.topGd.length && p.topGd.every(Boolean); }).map(function (p) { return { ten: p.ten, ban: p.ban, diem: p.caKy }; })) : []
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    COT_THANH_VIEN: COT_THANH_VIEN, BANG: BANG, KIEU_TAI: KIEU_TAI, LOAI_TV: LOAI_TV,
    kieuTaiThucTe: kieuTaiThucTe_, goiYNhiemKy: goiYNhiemKy_, keHoachTaiDanhSach: keHoachTaiDanhSach_, soDotCua: soDotCua_, cacKieuTai: cacKieuTai_, kieuDot: kieuDot_, nhiemKyHopLe: nhiemKyHopLe_,
    maThanhVienMoi: maThanhVienMoi_, docMaThanhVien: docMaThanhVien_, TRANG_THAI_TV: TRANG_THAI_TV, apCauHinh: apCauHinh_, chuanHoaQuyTac: chuanHoaQuyTac_, chuanHoaCoCau: chuanHoaCoCau_,
    mucDatCua: mucDatCua_, timBan: timBan_, laBanBod: laBanBod_, QUY_TAC_MAC_DINH: QUY_TAC_MAC_DINH, CO_CAU_MAC_DINH: CO_CAU_MAC_DINH, khoangNhiemKy: khoangNhiemKy_, diemTuGiaiDoan: diemTuGiaiDoan_,
    cacDungCho: cacDungCho_, dungChoLog: dungChoLog_, gdVao: gdVao_,
    docNgaySinh: docNgaySinh_, tenLichSinhNhat: tenLichSinhNhat_, keHoachSinhNhat: keHoachSinhNhat_,
    boDau: boDau_, chuanHoaTenCot: chuanHoaTenCot_, nhomBan: nhomBan_, thuTuBan: thuTuBan_, hangBan: hangBan_, soSanhBan: soSanhBan_, xepThanhVienTheoBan: xepThanhVienTheoBan_, nhanDienCot: nhanDienCot_,
    docDanhSachThanhVien: docDanhSachThanhVien_, tenNhiemKy: tenNhiemKy_, tinhKyMoi: tinhKyMoi_,
    dongThanhDoiTuong: dongThanhDoiTuong_, locNhiemKy: locNhiemKy_, batDauNhiemKyTu: batDauNhiemKyTu_, maHoaBang: maHoaBang_, giaiMaBang: giaiMaBang_, tongHopBangDiem: tongHopBangDiem_, lichSuCongKhai: lichSuCongKhai_,
    linkHopLe: linkHopLe_, kiemTraGopY: kiemTraGopY_, dongBoTaiKhoan: dongBoTaiKhoan_, khongPhaiBod: khongPhaiBod_,
    htmlSangChu: htmlSangChu_, lamSachHtml: lamSachHtml_, chuanBiGuiTuNhap: chuanBiGuiTuNhap_,
    coQuyen: coQuyen_, banQuanLy: banQuanLy_, quyenTask: quyenTask_, phamViHr: phamViHr_, ngayNopTheoKieu: ngayNopTheoKieu_, banCuaHr: banCuaHr_, kiemTraMatKhauMoi: kiemTraMatKhauMoi_, taoDongCongDiem: taoDongCongDiem_,
    chuanHoaLoaiHoatDong: chuanHoaLoaiHoatDong_, chuanHoaGhim: chuanHoaGhim_,
    TRANG_THAI_TASK: TRANG_THAI_TASK, NHAC_TRE: NHAC_TRE, ngayHopLe: ngayHopLe_, soNgayGiua: soNgayGiua_, hienNgay: hienNgay_,
    trangThaiTask: trangThaiTask_, laKhongHoanThanh: laKhongHoanThanh_,
    CHAT_LUONG: CHAT_LUONG, DUNG_HAN: DUNG_HAN, KET_QUA: KET_QUA, dungHanTask: dungHanTask_, ketQuaTask: ketQuaTask_, kiemTraDanhGia: kiemTraDanhGia_,
    kiemTraGiaHan: kiemTraGiaHan_, tongKpiTask: tongKpiTask_, banCoo: banCoo_, kiemTraTask: kiemTraTask_, taoDongTask: taoDongTask_, chonTaskTheoLich: chonTaskTheoLich_, chuanHoaLichNhac: chuanHoaLichNhac_, lichNhacTuCaiDatCu: lichNhacTuCaiDatCu_,
    lucCuaLich: lucCuaLich_, moTaMocNhac: moTaMocNhac_, MOC_TRE_MOI_NGAY: MOC_TRE_MOI_NGAY,
    moTaHan: moTaHan_, soanTinNhac: soanTinNhac_, chiaTin: chiaTin_, timMaTrongTin: timMaTrongTin_,
    THAO_TAC_MAIL: THAO_TAC_MAIL, TRANG_THAI_VIEC: TRANG_THAI_VIEC, emailHopLe: emailHopLe_, tachEmail: tachEmail_,
    kiemTraViecMail: kiemTraViecMail_, timChoTrong: timChoTrong_, thayTheMau: thayTheMau_, chuSangHtml: chuSangHtml_,
    docBangNgoai: docBangNgoai_, chuanBiGuiHangLoat: chuanBiGuiHangLoat_,
    chiSoBaoCao: chiSoBaoCao_, taskBiTre: taskBiTre_, tongHopBaoCao: tongHopBaoCao_, chiaMoc: chiaMoc_, bieuDoBaoCao: bieuDoBaoCao_,
    timTieuDeMauLog: timTieuDeMauLog_, kiemTraFileLog: kiemTraFileLog_, chuCot: chuCot_, xepTheoBan: xepTheoBan_, kiemTraTokenGoogle: kiemTraTokenGoogle_,
    base64Url: base64Url_, khoaCongP256: khoaCongP256_, kyP256: kyP256_, maHoaAesGcm: maHoaAesGcm_, maHoaThongBaoDay: maHoaThongBaoDay_, gocDiaChi: gocDiaChi_, diaChiDayHopLe: diaChiDayHopLe_,
    CACH_THONG_BAO: CACH_THONG_BAO, chuanHoaCachNhan: chuanHoaCachNhan_, loaiCongTay: loaiCongTay_, chuanHoaDsGio: chuanHoaDsGio_,
    CHU_DE: CHU_DE, chuDeHopLe: chuDeHopLe_, thuocTinhChuDe: thuocTinhChuDe_,
    chuanTenFb: chuanTenFb_,
    soNguoiTop: soNguoiTop_, topTheoDiem: topTheoDiem_, vuotGioiHan: vuotGioiHan_, gioiHanLoai: gioiHanLoai_,
    DUNG_CHO: DUNG_CHO, MUC_DIEM_QUY_CHE: MUC_DIEM_QUY_CHE, loaiDungCho: loaiDungCho_,
    NHOM_HR: NHOM_HR, TEN_NHOM_HR: TEN_NHOM_HR, nhomHr: nhomHr_, duocBaoCaoSeeding: duocBaoCaoSeeding_, chuanLinkBai: chuanLinkBai_, khopTenSeeding: khopTenSeeding_, taoBaoCaoSeeding: taoBaoCaoSeeding_,
    TRANG_THAI_BUOI: TRANG_THAI_BUOI, SU_KIEN_CHOT: SU_KIEN_CHOT, SU_KIEN_HUY: SU_KIEN_HUY, khoiLop: khoiLop_, giaoBanDau: giaoBanDau_, chuanHoaSuKienLog: chuanHoaSuKienLog_, chuanHoaBuoiLog: chuanHoaBuoiLog_,
    soBuoiThucDien: soBuoiThucDien_, giaoCuoi: giaoCuoi_, kpiLogSuKien: kpiLogSuKien_, kpiLogCuaNguoi: kpiLogCuaNguoi_, dongDiemLogVuot: dongDiemLogVuot_, docDangKyLog: docDangKyLog_,
    KQ_CERT: KQ_CERT, xepHangTop: xepHangTop_, phanTramTaskCert: phanTramTaskCert_, xetCertificate: xetCertificate_, danhSachKhenThuong: danhSachKhenThuong_
  };
}
