const test = require('node:test');
const assert = require('node:assert');
const L = require('./load-logic');

test('chuanHoaTenCot bỏ dấu, chữ hoa và khoảng trắng', () => {
  assert.strictEqual(L.chuanHoaTenCot('Số điện thoại cá nhân'), 'sodienthoaicanhan');
  assert.strictEqual(L.chuanHoaTenCot('  Họ và tên '), 'hovaten');
  assert.strictEqual(L.chuanHoaTenCot('Đ'), 'd');
});

test('nhomBan gộp PR CAP, PR DES, PR PHO thành PR', () => {
  assert.strictEqual(L.nhomBan('PR CAP'), 'PR');
  assert.strictEqual(L.nhomBan('pr  des'), 'PR');
  assert.strictEqual(L.nhomBan('BOD'), 'BOD');
  assert.strictEqual(L.nhomBan(''), '');
});

test('nhanDienCot không phụ thuộc thứ tự cột và bỏ qua cột Ghi chú', () => {
  const values = [
    ['', '', ''],
    ['Email', 'Ghi chú', 'Ban', 'Họ và tên'],
    ['a@gmail.com', 'x', 'PG', 'Trần A']
  ];
  const nd = L.nhanDienCot(values);
  assert.strictEqual(nd.dongTieuDe, 1);
  assert.deepStrictEqual(nd.thieu, []);
  assert.strictEqual(nd.viTri.HoVaTen, 3);
  assert.strictEqual(nd.viTri.Email, 0);
});

test('docDanhSachThanhVien bỏ dòng trống, báo trùng tên, thiếu cột', () => {
  const ok = L.docDanhSachThanhVien([
    ['Họ và tên', 'Ban', 'Email', 'Ghi chú'],
    ['Nguyễn  Văn A ', 'BOD', ' A@Gmail.com ', 'abc'],
    ['', '', '', ''],
    ['Lê B', 'PR CAP', '', '']
  ]);
  assert.deepStrictEqual(ok.loi, []);
  assert.strictEqual(ok.thanhVien.length, 2);
  assert.strictEqual(ok.thanhVien[0].HoVaTen, 'Nguyễn Văn A');
  assert.strictEqual(ok.thanhVien[0].Email, 'a@gmail.com');
  assert.strictEqual(ok.thanhVien[0].GhiChu, undefined);

  const trung = L.docDanhSachThanhVien([['Họ và tên', 'Ban'], ['A', 'PG'], ['a', 'AD']]);
  assert.match(trung.loi[0], /trùng/);

  const thieu = L.docDanhSachThanhVien([['Họ và tên', 'Lớp'], ['A', '10A']]);
  assert.match(thieu.loi[0], /Ban/);
});

test('tinhKyMoi: đợt n mở giai đoạn n, Oday và Cập nhật không mở giai đoạn', () => {
  const K = L.KIEU_TAI;
  assert.deepStrictEqual(L.tinhKyMoi(K.DOT1, '2026-2027'), { NhiemKy: '2026-2027', GiaiDoan: 1 });
  assert.deepStrictEqual(L.tinhKyMoi(K.DOT2, '2026-2027'), { NhiemKy: '2026-2027', GiaiDoan: 2 });
  assert.strictEqual(L.tinhKyMoi(K.ODAY, '2026-2027'), null);
  assert.strictEqual(L.tinhKyMoi(K.CAP_NHAT, '2026-2027'), null);
});

test('tongHopBangDiem: điểm từng giai đoạn, người vào sau không có điểm giai đoạn trước, ẩn thông tin riêng', () => {
  const tv = [
    { MaTV: '26-1-CAP-01', HoVaTen: 'A', Lop: '10A', Ban: 'PR CAP', Email: 'a@x', SoDienThoai: '090', GiaiDoanVao: 1 },
    { MaTV: '26-2-PG-01', HoVaTen: 'B', Lop: '11B', Ban: 'PG', GiaiDoanVao: 2 }
  ];
  const ls = [
    { HoVaTen: 'A', Diem: 5, NhiemKy: '2026-2027', GiaiDoan: 1 },
    { HoVaTen: 'A', Diem: 3, NhiemKy: '2026-2027', GiaiDoan: 2 },
    { HoVaTen: 'B', Diem: 2, NhiemKy: '2026-2027', GiaiDoan: 2 },
    { HoVaTen: 'A', Diem: 9, NhiemKy: '2025-2026', GiaiDoan: 2 }
  ];
  const kq = L.tongHopBangDiem(tv, ls, { NhiemKy: '2026-2027', GiaiDoan: 2 });
  assert.deepStrictEqual(kq[0], { ten: 'A', maTV: '26-1-CAP-01', lop: '10A', ban: 'PR CAP', nhom: 'PR', boSung: false, gdVao: 1, diem: 3, gd: [5, 3], caKy: 8, top: false, topGd: [false, false], topCaKy: false }); // 2 người × 15% = 0 người trong top
  assert.deepStrictEqual([kq[1].diem, kq[1].boSung, kq[1].gd, kq[1].caKy], [2, true, [null, 2], null]);
  assert.strictEqual(JSON.stringify(kq).includes('090'), false);
  assert.strictEqual(JSON.stringify(kq).includes('a@x'), false);
});

test('lichSuCongKhai lọc đúng người, đúng giai đoạn (0 là cả nhiệm kỳ), mới nhất trước', () => {
  const ls = [
    { HoVaTen: 'A', ThoiGian: new Date(2026, 9, 1), LoaiHoatDong: 'Log', TenHoatDong: '', Diem: 3, NguoiCong: 'X', NhiemKy: '2026-2027', GiaiDoan: 1 },
    { HoVaTen: 'A', ThoiGian: new Date(2026, 9, 5), LoaiHoatDong: 'Seeding', TenHoatDong: 'react', Diem: 1, NguoiCong: 'X', NhiemKy: '2026-2027', GiaiDoan: 1 },
    { HoVaTen: 'A', ThoiGian: new Date(2027, 1, 5), LoaiHoatDong: 'Staff', TenHoatDong: 'hội chợ', Diem: 5, NguoiCong: 'X', NhiemKy: '2026-2027', GiaiDoan: 2 },
    { HoVaTen: 'B', ThoiGian: new Date(2026, 9, 2), LoaiHoatDong: 'Log', Diem: 3, NhiemKy: '2026-2027', GiaiDoan: 1 }
  ];
  const kq = L.lichSuCongKhai(ls, 'a', '2026-2027', 1);
  assert.strictEqual(kq.length, 2);
  assert.strictEqual(kq[0].ten, 'react');
  assert.strictEqual(JSON.stringify(kq).includes('NguoiCong'), false);
  assert.deepStrictEqual(L.lichSuCongKhai(ls, 'A', '2026-2027', 0).map((d) => d.giaiDoan), [2, 1, 1]);
});

test('linkHopLe, kiemTraGopY', () => {
  assert.strictEqual(L.linkHopLe('https://a.com/x'), true);
  assert.strictEqual(L.linkHopLe('javascript:alert(1)'), false);
  assert.notStrictEqual(L.kiemTraGopY('   '), '');
  assert.notStrictEqual(L.kiemTraGopY('x'.repeat(2001)), '');
  assert.strictEqual(L.kiemTraGopY('ok'), '');
});

test('locNhiemKy: ẩn dữ liệu nhiệm kỳ cũ, không rõ thời điểm thì giữ', () => {
  const moc = new Date(2026, 8, 15).getTime();
  const ds = [{ t: new Date(2026, 8, 1) }, { t: new Date(2026, 8, 15) }, { t: new Date(2026, 9, 1).getTime() }, { t: '' }, { t: 'không phải ngày' }];
  assert.strictEqual(L.locNhiemKy(ds, (d) => d.t, moc).length, 4);
  assert.ok(!L.locNhiemKy(ds, (d) => d.t, moc).includes(ds[0]));
  assert.strictEqual(L.locNhiemKy(ds, (d) => d.t, 0).length, 5);
});

test('batDauNhiemKyTu: lúc mở giai đoạn 1 đầu tiên của nhiệm kỳ đang chạy', () => {
  const d = (m, n) => new Date(2026, m, n);
  assert.strictEqual(L.batDauNhiemKyTu([]), 0);
  const ds = [
    { NhiemKy: '2025-2026', GiaiDoan: 1, BatDau: d(0, 1) },
    { NhiemKy: '2026-2027', GiaiDoan: 1, BatDau: d(8, 10) },
    { NhiemKy: '2026-2027', GiaiDoan: 2, BatDau: d(11, 1) }
  ];
  assert.strictEqual(L.batDauNhiemKyTu(ds), d(8, 10).getTime());
  const k = L.khoangNhiemKy(ds);
  assert.deepStrictEqual(k['2025-2026'], { tu: d(0, 1).getTime(), den: d(8, 10).getTime() });
  assert.deepStrictEqual(k['2026-2027'], { tu: d(8, 10).getTime(), den: 0 });
});

test('kiểu tải: gợi ý nhiệm kỳ, mỗi đợt một lần, làm lại thì thành Cập nhật, phải theo thứ tự', () => {
  const K = L.KIEU_TAI;
  const t10 = new Date(2026, 9, 1);
  assert.deepStrictEqual(L.cacKieuTai(2), [K.ODAY, K.DOT1, K.DOT2, K.CAP_NHAT]);
  assert.strictEqual(L.goiYNhiemKy(K.ODAY, t10, []), '2026-2027');
  assert.strictEqual(L.goiYNhiemKy(K.DOT2, new Date(2027, 1, 1), [{ NhiemKy: '2026-2027', Kieu: K.DOT1 }]), '2026-2027');
  assert.strictEqual(L.goiYNhiemKy(K.ODAY, new Date(2027, 8, 1), [{ NhiemKy: '2026-2027', Kieu: K.DOT2 }]), '2027-2028');
  let kt = L.kieuTaiThucTe(K.ODAY, '2026-2027', [], 2);
  assert.deepStrictEqual([kt.kieu, kt.doiThanhCapNhat, kt.dauNhiemKy, kt.loi], [K.ODAY, false, true, '']);
  kt = L.kieuTaiThucTe(K.DOT1, '2026-2027', [{ NhiemKy: '2026-2027', Kieu: K.ODAY }], 2);
  assert.deepStrictEqual([kt.kieu, kt.dauNhiemKy], [K.DOT1, false]);
  kt = L.kieuTaiThucTe(K.DOT1, '2026-2027', [{ NhiemKy: '2026-2027', Kieu: K.DOT1 }], 2);
  assert.deepStrictEqual([kt.kieu, kt.doiThanhCapNhat], [K.CAP_NHAT, true]);
  kt = L.kieuTaiThucTe(K.ODAY, '2026-2027', [{ NhiemKy: '2026-2027', Kieu: K.DOT1 }], 2);
  assert.strictEqual(kt.kieu, K.CAP_NHAT);
  assert.match(L.kieuTaiThucTe(K.DOT2, '2026-2027', [{ NhiemKy: '2026-2027', Kieu: K.ODAY }], 2).loi, /chưa tải "Sau tuyển đợt 1"/);
  assert.match(L.kieuTaiThucTe(L.kieuDot(3), '2026-2027', [], 2).loi, /không hợp lệ/);
  assert.match(L.kieuTaiThucTe(K.ODAY, '2026', [], 2).loi, /2026-2027/);
  assert.strictEqual(L.kieuTaiThucTe(K.CAP_NHAT, '2026-2027', [], 2).kieu, K.CAP_NHAT);
});

test('mã thành viên: năm vào, đợt vào, ban lúc vào, số thứ tự; không cấp lại', () => {
  assert.strictEqual(L.maThanhVienMoi('2026-2027', 1, 'PG', {}), '26-1-PG-01');
  assert.strictEqual(L.maThanhVienMoi('2026-2027', 0, 'CAP', { '26-0-CAP-01': 1, '26-0-CAP-09': 1, '26-1-CAP-20': 1 }), '26-0-CAP-10');
  assert.deepStrictEqual(L.docMaThanhVien('26-2-des-07'), { nam: 2026, nhiemKy: '2026-2027', dot: 2, ban: 'DES', so: 7 });
  assert.strictEqual(L.docMaThanhVien('PG-07'), null);
});

test('tải danh sách: nhận người theo mã, email, tên; cấp mã người mới; người vắng thành Đã rời; đổi ban', () => {
  const K = L.KIEU_TAI, t = new Date(2027, 1, 1);
  const cu = [
    { MaTV: '26-1-PG-01', HoVaTen: 'An', Ban: 'PG', Lop: '10A1', Email: 'an@x', GiaiDoanVao: 1, LoaiThanhVien: 'Chính thức', TrangThai: 'Đang hoạt động' },
    { MaTV: '26-1-AD-01', HoVaTen: 'Bình', Ban: 'AD', Lop: '10A2', Email: 'binh@x', GiaiDoanVao: 1, LoaiThanhVien: 'Chính thức', TrangThai: 'Đang hoạt động' },
    { MaTV: '26-1-HR-01', HoVaTen: 'Chi', Ban: 'HR', GiaiDoanVao: 1, TrangThai: 'Đang hoạt động' },
    { MaTV: '26-1-PG-02', HoVaTen: 'Dũng', Ban: 'PG', GiaiDoanVao: 1, TrangThai: 'Đã rời' }
  ];
  const moi = [
    { HoVaTen: 'An Nguyễn', Ban: 'pr cap', Lop: '10A1', Email: 'AN@x' }, // đổi tên và ban, nhận theo email
    { MaTV: '26-1-ad-01', HoVaTen: 'Bình', Ban: 'AD', Lop: '10A2' },
    { HoVaTen: 'Dũng', Ban: 'PG' }, // quay lại
    { HoVaTen: 'Em', Ban: 'PG' },
    { HoVaTen: 'Lạ', Ban: 'ER' }
  ];
  const k = L.keHoachTaiDanhSach(moi, cu, { kieu: K.DOT2, nhiemKy: '2026-2027', dauNhiemKy: false, giaiDoan: 2, bayGio: t });
  assert.deepStrictEqual(k.banLa, ['ER']);
  assert.deepStrictEqual(k.them.map((x) => [x.MaTV, x.HoVaTen, x.GiaiDoanVao, x.LoaiThanhVien]), [['26-2-PG-01', 'Em', 2, 'Bổ sung']]);
  assert.deepStrictEqual(k.doiBan, [{ MaTV: '26-1-PG-01', HoVaTen: 'An Nguyễn', BanCu: 'PG', BanMoi: 'PR CAP' }]);
  assert.deepStrictEqual(k.roi.map((x) => x.HoVaTen), ['Chi']);
  assert.deepStrictEqual(k.quayLai.map((x) => [x.MaTV, x.GiaiDoanVao, x.LoaiThanhVien]), [['26-1-PG-02', 2, 'Bổ sung']]);
  assert.deepStrictEqual(k.sua.map((x) => x.MaTV), ['26-1-PG-01']);
  assert.strictEqual(k.ds.length, 5);
  const ma = L.keHoachTaiDanhSach([{ MaTV: '99-1-PG-01', HoVaTen: 'X', Ban: 'PG' }], cu, { kieu: K.CAP_NHAT, nhiemKy: '2026-2027', giaiDoan: 2, bayGio: t });
  assert.match(ma.loi[0], /99-1-PG-01/);
  // Trùng tên nhưng khác email là người khác.
  const ten = L.keHoachTaiDanhSach([{ HoVaTen: 'Bình', Ban: 'AD', Email: 'binh2@x' }], cu, { kieu: K.CAP_NHAT, nhiemKy: '2026-2027', giaiDoan: 2, bayGio: t });
  assert.strictEqual(ten.them.length, 1);
  // Đầu nhiệm kỳ mới: mọi người ở lại thành chính thức, vào từ giai đoạn 1.
  const dau = L.keHoachTaiDanhSach([{ HoVaTen: 'Dũng', Ban: 'PG' }, { HoVaTen: 'Chi', Ban: 'HR' }], cu, { kieu: K.ODAY, nhiemKy: '2027-2028', dauNhiemKy: true, giaiDoan: 2, bayGio: t });
  assert.deepStrictEqual(dau.ds.filter((x) => x.TrangThai === 'Đang hoạt động').map((x) => [x.HoVaTen, x.GiaiDoanVao, x.LoaiThanhVien]), [['Chi', 1, 'Chính thức'], ['Dũng', 1, 'Chính thức']]);
});

test('ngày sinh và kế hoạch lịch sinh nhật', () => {
  assert.deepStrictEqual(L.docNgaySinh(new Date(2009, 1, 3)), { ngay: 3, thang: 2 });
  assert.deepStrictEqual(L.docNgaySinh('03/02/2009'), { ngay: 3, thang: 2 });
  assert.deepStrictEqual(L.docNgaySinh('2009-02-03'), { ngay: 3, thang: 2 });
  assert.deepStrictEqual(L.docNgaySinh('29/2'), { ngay: 29, thang: 2 });
  assert.strictEqual(L.docNgaySinh('31/02/2009'), null);
  assert.strictEqual(L.docNgaySinh(''), null);
  assert.strictEqual(L.tenLichSinhNhat('2026-2027'), 'Sinh nhật 2627');
  const tv = [
    { HoVaTen: 'An', Ban: 'PG', NgaySinh: '01/05/2010' },
    { HoVaTen: 'Bình', Ban: 'AD', NgaySinh: '02/06/2010' },
    { HoVaTen: 'Chi', Ban: 'HR', NgaySinh: '' },
    { HoVaTen: 'Dũng', Ban: 'PG', NgaySinh: '04/07/2010' }
  ];
  const daCo = [
    { HoVaTen: 'An', NgaySinh: '01/05', TieuDe: 'Sinh nhật An (PG)', MaSuKien: 'a' },
    { HoVaTen: 'Bình', NgaySinh: '02/06', TieuDe: 'Sinh nhật Bình (PR)', MaSuKien: 'b' },
    { HoVaTen: 'Em', NgaySinh: '05/08', TieuDe: 'Sinh nhật Em (PG)', MaSuKien: 'e' }
  ];
  const kh = L.keHoachSinhNhat(tv, daCo);
  assert.strictEqual(kh.soGiu, 1);
  assert.deepStrictEqual(kh.tao.map((x) => x.TieuDe), ['Sinh nhật Bình (AD)', 'Sinh nhật Dũng (PG)']);
  assert.deepStrictEqual(kh.xoa.map((x) => x.MaSuKien), ['b', 'e']);
  assert.deepStrictEqual(kh.thieuNgay, ['Chi']);
});

test('top 15%: làm tròn thông thường, tính cả người bằng điểm, không tính người 0 điểm', () => {
  assert.strictEqual(L.soNguoiTop(10), 2); // 1,5 → 2
  assert.strictEqual(L.soNguoiTop(70), 11); // 10,5 → 11 (không bị sai số thành 10)
  assert.strictEqual(L.soNguoiTop(16), 2); // 2,4 → 2
  assert.strictEqual(L.soNguoiTop(3), 0);
  const ds = (diem) => diem.map((d, i) => ({ ten: 'T' + i, diem: d }));
  assert.deepStrictEqual(Object.keys(L.topTheoDiem(ds([9, 8, 8, 7, 5, 4, 3, 2, 1, 0]), 'diem')), ['t0', 't1', 't2']);
  assert.deepStrictEqual(Object.keys(L.topTheoDiem(ds([5, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'diem')), ['t0']);
  assert.deepStrictEqual(L.topTheoDiem(ds([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'diem'), {});
});

test('tongHopBangDiem: mỗi giai đoạn xếp hạng người đã vào đến giai đoạn đó; cả nhiệm kỳ chỉ người vào từ giai đoạn 1', () => {
  const ten = Array.from({ length: 10 }, (_, i) => 'N' + i);
  const tv = ten.map((t) => ({ HoVaTen: t, Ban: 'PG', GiaiDoanVao: 1 })).concat([{ HoVaTen: 'Bs', Ban: 'PG', GiaiDoanVao: 2 }]);
  const ls = ten.map((t, i) => ({ HoVaTen: t, Diem: 10 - i, NhiemKy: 'K', GiaiDoan: 1 }))
    .concat([{ HoVaTen: 'N9', Diem: 50, NhiemKy: 'K', GiaiDoan: 2 }, { HoVaTen: 'Bs', Diem: 40, NhiemKy: 'K', GiaiDoan: 2 }]);
  const gd1 = L.tongHopBangDiem(tv.slice(0, 10), ls, { NhiemKy: 'K', GiaiDoan: 1 });
  assert.deepStrictEqual(gd1.filter((p) => p.top).map((p) => p.ten), ['N0', 'N1']);
  const gd2 = L.tongHopBangDiem(tv, ls, { NhiemKy: 'K', GiaiDoan: 2 });
  // Giai đoạn 2: 11 người, top 15% = 2 → N9 (50) và Bs (40).
  assert.deepStrictEqual(gd2.filter((p) => p.top).map((p) => p.ten), ['N9', 'Bs']);
  // Giai đoạn 1 và cả nhiệm kỳ: chỉ 10 người vào từ giai đoạn 1.
  assert.deepStrictEqual(gd2.filter((p) => p.topGd[0]).map((p) => p.ten), ['N0', 'N1']);
  assert.deepStrictEqual(gd2.filter((p) => p.topCaKy).map((p) => p.ten), ['N0', 'N9']);
  const bs = gd2.filter((p) => p.ten === 'Bs')[0];
  assert.deepStrictEqual([bs.gd, bs.caKy], [[null, 40], null]);
});

test('giới hạn số lần mỗi giai đoạn (góp ý được dùng tối đa 2 lần)', () => {
  const KY = { NhiemKy: 'K', GiaiDoan: 1 };
  const LOAI = [{ TenLoai: 'Góp ý', Diem: 10, GioiHan: 2 }, { TenLoai: 'Staff', Diem: 3 }];
  const TV = [{ HoVaTen: 'An' }, { HoVaTen: 'Bình' }];
  const ls = [
    { HoVaTen: 'An', LoaiHoatDong: 'Góp ý', NhiemKy: 'K', GiaiDoan: 1 },
    { HoVaTen: 'An', LoaiHoatDong: 'Góp ý', NhiemKy: 'K', GiaiDoan: 1 },
    { HoVaTen: 'Bình', LoaiHoatDong: 'Góp ý', NhiemKy: 'K', GiaiDoan: 2 } // giai đoạn khác không tính
  ];
  const now = new Date();
  assert.match(L.taoDongCongDiem({ loai: 'Góp ý', nguoi: ['An', 'Bình'] }, TV, LOAI, 'BOD', KY, now, ls).loi, /tối đa 2 lần mỗi giai đoạn\. Đã đủ: An\./);
  assert.strictEqual(L.taoDongCongDiem({ loai: 'Góp ý', nguoi: ['Bình'] }, TV, LOAI, 'BOD', KY, now, ls).loi, '');
  assert.strictEqual(L.taoDongCongDiem({ loai: 'Staff', nguoi: ['An'] }, TV, LOAI, 'BOD', KY, now, ls.concat(ls, ls)).loi, '');
});

test('quy tắc: chỉ nhận các mục BOD được chỉnh, bỏ giá trị sai', () => {
  const q = L.chuanHoaQuyTac(JSON.stringify({ tiLeTop: 20, sapDenHanNgay: 3, khtSauNgay: 2, thoiLuongBuoi: [180, 60, 60, 5], datTask: 50, soGiaiDoan: 4 }));
  assert.deepStrictEqual([q.tiLeTop, q.sapDenHanNgay, q.khtSauNgay, q.thoiLuongBuoi], [20, 3, 2, [60, 180]]);
  assert.deepStrictEqual([q.datTask, q.soGiaiDoan, q.seedingGio], [80, 2, 48], 'mục cố định không đổi được');
  assert.strictEqual(L.chuanHoaQuyTac({ tiLeTop: 0 }).tiLeTop, 15);
  assert.strictEqual(L.chuanHoaQuyTac('hỏng').tiLeTop, 15);
  assert.deepStrictEqual(L.CHINH_DUOC, ['tiLeTop', 'sapDenHanNgay', 'khtSauNgay', 'thoiLuongBuoi']);
});

test('cơ cấu ban: kiểm tra chữ viết tắt, cần có BOD; áp dụng thì mọi chỗ dùng ban mới', () => {
  assert.match(L.chuanHoaCoCau([{ ma: 'PG' }]).loi, /ban điều hành/);
  assert.match(L.chuanHoaCoCau([{ ma: 'BOD', laBod: true }, { ma: 'PG' }, { ma: 'pg' }]).loi, /trùng/);
  assert.match(L.chuanHoaCoCau([{ ma: 'BOD', laBod: true }, { ma: 'PR A', vietTat: 'PR' }, { ma: 'PR B', vietTat: 'pr' }]).loi, /cùng chữ viết tắt PR/);
  const kq = L.chuanHoaCoCau([{ ma: 'bod', ten: 'Ban điều hành', laBod: true }, { ma: 'Media', vietTat: 'MD' }, { ma: 'PG', dangDung: false }]);
  assert.strictEqual(kq.loi, '');
  try {
    L.apCauHinh(kq.ds, null);
    assert.strictEqual(L.laBanBod('Bod'), true);
    assert.deepStrictEqual(L.banCoo(), ['MEDIA'], 'ban đã giải thể không được giao HR phụ trách');
    assert.strictEqual(L.timBan('media').vietTat, 'MD');
  } finally { L.apCauHinh(null, null); }
  assert.strictEqual(L.timBan('Media'), null);
});

test('chuanHoaLoaiHoatDong: số lần tối đa, gắn chức năng tự cộng, mức điểm theo quy chế', () => {
  const kq = L.chuanHoaLoaiHoatDong([{ ten: 'Góp ý', diem: 10, gioiHan: '2', dungCho: 'gopy', congTay: false }, { ten: 'Staff', diem: 3, gioiHan: '' }]);
  assert.deepStrictEqual(kq.ds, [{ TenLoai: 'Góp ý', Diem: 10, CongTay: 'khong', GioiHan: 2, DungCho: 'gopy' }, { TenLoai: 'Staff', Diem: 3, CongTay: 'co' }]);
  assert.match(L.chuanHoaLoaiHoatDong([{ ten: 'A', diem: 1, gioiHan: 1.5 }]).loi, /số nguyên/);
  assert.match(L.chuanHoaLoaiHoatDong([{ ten: 'A', diem: 1, dungCho: 'react' }, { ten: 'B', diem: 1, dungCho: 'react' }]).loi, /chỉ chọn một/i);
  const qc = L.chuanHoaLoaiHoatDong(L.MUC_DIEM_QUY_CHE);
  assert.strictEqual(qc.loi, '');
  assert.strictEqual(qc.ds.length, 10);
  assert.deepStrictEqual(qc.ds.map((l) => l.Diem), [1, 2, 3, 5, 10, 20, 40, 40, 40, 50]);
  assert.strictEqual(L.loaiDungCho(qc.ds, 'gopy').GioiHan, 2);
});

test('nhóm HR và quyền báo cáo seeding', () => {
  assert.deepStrictEqual(L.nhomHr(' sup-seed, CRE ; abc, SUP-SEED'), ['SUP-SEED'], 'chỉ còn phụ trách seeding; mã cũ CRE, SUP-RES bị bỏ qua');
  assert.deepStrictEqual(L.nhomHr('SUP-RES'), []);
  assert.strictEqual(L.duocBaoCaoSeeding({ VaiTro: 'HR', NhomHr: 'SUP-SEED' }), true);
  assert.strictEqual(L.duocBaoCaoSeeding({ VaiTro: 'HR', NhomHr: 'CRE' }), false);
  assert.strictEqual(L.duocBaoCaoSeeding({ VaiTro: 'BOD' }), true);
  assert.strictEqual(L.duocBaoCaoSeeding(null), false);
});

test('báo cáo seeding: dò tên, chặn trùng bài, cảnh báo 48 giờ, cộng theo loại react/comment', () => {
  const KY = { NhiemKy: 'K', HocKy: 1 };
  const TV = [{ HoVaTen: 'Nguyễn Văn An', TenFacebook: 'An Nguyễn' }, { HoVaTen: 'Lê Bình', TenFacebook: '' }];
  const LOAI = [{ TenLoai: 'React', Diem: 1, DungCho: 'react' }, { TenLoai: 'Comment', Diem: 2, DungCho: 'comment' }];
  const now = new Date(2026, 9, 10, 20);
  const luc = now.getTime() - 50 * 3600000;
  const yc = { link: 'https://www.facebook.com/eco/posts/123?mibextid=x', lucDang: luc, react: 'an nguyen\nLê Bình\nNgười Lạ\n\nAN NGUYỄN', comment: 'An Nguyễn' };
  const kq = L.taoBaoCaoSeeding(yc, TV, LOAI, KY, 'HR Seed', now, [], []);
  assert.strictEqual(kq.loi, '');
  assert.deepStrictEqual(kq.react, ['Nguyễn Văn An', 'Lê Bình']);
  assert.deepStrictEqual(kq.comment, ['Nguyễn Văn An']);
  assert.deepStrictEqual(kq.khongKhop, ['Người Lạ']);
  assert.deepStrictEqual(kq.canhBao, []);
  assert.deepStrictEqual(kq.dong.map((d) => [d.HoVaTen, d.LoaiHoatDong, d.Diem, d.NguoiCong]), [
    ['Nguyễn Văn An', 'React', 1, 'Seeding: HR Seed'], ['Lê Bình', 'React', 1, 'Seeding: HR Seed'], ['Nguyễn Văn An', 'Comment', 2, 'Seeding: HR Seed']]);
  assert.strictEqual(kq.bao.TrangThai, 'Đã cộng');
  // Cùng bài (link khác tham số) thì chặn; báo cáo cũ đã huỷ thì cho điền lại.
  const cu = [{ LinkBai: 'http://m.facebook.com/eco/posts/123/', NguoiNop: 'X', TrangThai: 'Đã cộng' }];
  assert.match(L.taoBaoCaoSeeding(yc, TV, LOAI, KY, 'HR', now, cu, []).loi, /đã có báo cáo của X/);
  assert.strictEqual(L.taoBaoCaoSeeding(yc, TV, LOAI, KY, 'HR', now, [{ ...cu[0], TrangThai: 'Đã huỷ' }], []).loi, '');
  assert.notStrictEqual(L.chuanLinkBai('https://facebook.com/permalink.php?story_fbid=1&id=2'), L.chuanLinkBai('https://facebook.com/permalink.php?story_fbid=3&id=2'));
  // Chưa đủ 48 giờ: vẫn gửi được nhưng có cảnh báo.
  assert.match(L.taoBaoCaoSeeding({ ...yc, lucDang: now.getTime() - 3600000 }, TV, LOAI, KY, 'HR', now, [], []).canhBao[0], /chưa đủ 48 giờ/);
  assert.match(L.taoBaoCaoSeeding({ ...yc, link: 'abc' }, TV, LOAI, KY, 'HR', now, [], []).loi, /link/);
  assert.match(L.taoBaoCaoSeeding({ ...yc, lucDang: now.getTime() + 3600000 }, TV, LOAI, KY, 'HR', now, [], []).loi, /tương lai/);
  assert.match(L.taoBaoCaoSeeding(yc, TV, LOAI.slice(1), KY, 'HR', now, [], []).loi, /react/);
  assert.match(L.taoBaoCaoSeeding(yc, TV, LOAI, null, 'HR', now, [], []).loi, /Chưa có giai đoạn/);
  // Không ghi giờ đăng: lấy giờ gửi, không cảnh báo 48 giờ, ô giờ đăng để trống.
  const khongGio = L.taoBaoCaoSeeding({ ...yc, lucDang: undefined }, TV, LOAI, KY, 'HR', now, [], []);
  assert.strictEqual(khongGio.loi, '');
  assert.deepStrictEqual(khongGio.canhBao, []);
  assert.strictEqual(khongGio.bao.LucDang, '');
});

test('lưu trữ: nhiệm kỳ xong hơn một năm mới chuyển; chia dòng theo cột NhiemKy hoặc theo thời gian', () => {
  const d = (y, m) => new Date(y, m, 1).getTime();
  const khoang = { '2024-2025': { tu: d(2024, 8), den: d(2025, 8) }, '2025-2026': { tu: d(2025, 8), den: d(2026, 8) }, '2026-2027': { tu: d(2026, 8), den: 0 } };
  assert.deepStrictEqual(L.nhiemKyCanLuuTru(khoang, d(2026, 9), {}), ['2024-2025']);
  assert.deepStrictEqual(L.nhiemKyCanLuuTru(khoang, d(2026, 9), { '2024-2025': true }), []);
  const ds = [{ NhiemKy: '2024-2025', ThoiGian: new Date(2026, 0, 1) }, { ThoiGian: new Date(2025, 0, 1) }, { ThoiGian: new Date(2025, 9, 1) }, { ThoiGian: '' }];
  const c = L.chiaDongLuuTru(ds, 'ThoiGian', khoang, '2024-2025');
  assert.deepStrictEqual([c.chuyen.length, c.giu.length], [2, 2]);
  assert.strictEqual(c.giu[1].ThoiGian, '');
});
