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

test('tinhKyMoi theo ba kiểu tải', () => {
  const t10 = new Date(2026, 9, 1);
  const t2 = new Date(2027, 1, 1);
  assert.deepStrictEqual(L.tinhKyMoi(null, L.KIEU_TAI.DOT1, t10), { NhiemKy: '2026-2027', HocKy: 1 });
  assert.deepStrictEqual(L.tinhKyMoi({ NhiemKy: '2026-2027', HocKy: 1 }, L.KIEU_TAI.DOT2, t2), { NhiemKy: '2026-2027', HocKy: 2 });
  assert.strictEqual(L.tinhKyMoi({ NhiemKy: '2026-2027', HocKy: 1 }, L.KIEU_TAI.CAP_NHAT, t2), null);
});

test('tongHopBangDiem chỉ tính học kỳ hiện tại, ẩn thông tin riêng, có điểm HK1 cho người ở lại', () => {
  const tv = [
    { HoVaTen: 'A', Lop: '10A', Ban: 'PR CAP', Email: 'a@x', SoDienThoaiCaNhan: '090' },
    { HoVaTen: 'B', Lop: '11B', Ban: 'PG', LoaiThanhVien: 'Bổ sung' }
  ];
  const ls = [
    { HoVaTen: 'A', Diem: 5, NhiemKy: '2026-2027', HocKy: 1 },
    { HoVaTen: 'A', Diem: 3, NhiemKy: '2026-2027', HocKy: 2 },
    { HoVaTen: 'B', Diem: 2, NhiemKy: '2026-2027', HocKy: 2 },
    { HoVaTen: 'A', Diem: 9, NhiemKy: '2025-2026', HocKy: 2 }
  ];
  const luuTru = [{ NhiemKy: '2026-2027', HocKy: 1, HoVaTen: 'A' }];
  const kq = L.tongHopBangDiem(tv, ls, { NhiemKy: '2026-2027', HocKy: 2 }, luuTru);
  assert.deepStrictEqual(kq[0], { ten: 'A', lop: '10A', ban: 'PR CAP', nhom: 'PR', diem: 3, diemHk1: 5, boSung: false });
  assert.strictEqual(kq[1].diem, 2);
  assert.strictEqual(kq[1].boSung, true);
  assert.strictEqual(kq[1].diemHk1, null);
  assert.strictEqual(JSON.stringify(kq).includes('090'), false);
});

test('lichSuCongKhai lọc đúng người, đúng kỳ, mới nhất trước', () => {
  const ls = [
    { HoVaTen: 'A', ThoiGian: new Date(2026, 9, 1), LoaiHoatDong: 'Log', TenHoatDong: '', Diem: 3, NguoiCong: 'X', NhiemKy: '2026-2027', HocKy: 1 },
    { HoVaTen: 'A', ThoiGian: new Date(2026, 9, 5), LoaiHoatDong: 'Seeding', TenHoatDong: 'react', Diem: 1, NguoiCong: 'X', NhiemKy: '2026-2027', HocKy: 1 },
    { HoVaTen: 'B', ThoiGian: new Date(2026, 9, 2), LoaiHoatDong: 'Log', Diem: 3, NhiemKy: '2026-2027', HocKy: 1 }
  ];
  const kq = L.lichSuCongKhai(ls, 'a', '2026-2027', 1);
  assert.strictEqual(kq.length, 2);
  assert.strictEqual(kq[0].ten, 'react');
  assert.strictEqual(JSON.stringify(kq).includes('NguoiCong'), false);
});

test('linkHopLe, kiemTraGopY, taiKhoanBodCanCo', () => {
  assert.strictEqual(L.linkHopLe('https://a.com/x'), true);
  assert.strictEqual(L.linkHopLe('javascript:alert(1)'), false);
  assert.notStrictEqual(L.kiemTraGopY('   '), '');
  assert.notStrictEqual(L.kiemTraGopY('x'.repeat(2001)), '');
  assert.strictEqual(L.kiemTraGopY('ok'), '');
  const bod = L.taiKhoanBodCanCo([{ HoVaTen: 'A', Ban: 'BOD', Email: 'a@x' }, { HoVaTen: 'B', Ban: 'PG', Email: 'b@x' }, { HoVaTen: 'C', Ban: 'BOD', Email: '' }]);
  assert.deepStrictEqual(bod, [{ Email: 'a@x', HoVaTen: 'A' }]);
});

test('locNhiemKy: ẩn dữ liệu nhiệm kỳ cũ, không rõ thời điểm thì giữ', () => {
  const moc = new Date(2026, 8, 15).getTime();
  const ds = [{ t: new Date(2026, 8, 1) }, { t: new Date(2026, 8, 15) }, { t: new Date(2026, 9, 1).getTime() }, { t: '' }, { t: 'không phải ngày' }];
  assert.strictEqual(L.locNhiemKy(ds, (d) => d.t, moc).length, 4);
  assert.ok(!L.locNhiemKy(ds, (d) => d.t, moc).includes(ds[0]));
  assert.strictEqual(L.locNhiemKy(ds, (d) => d.t, 0).length, 5);
});

test('batDauNhiemKyTu: lấy lần tải đợt 1 đầu tiên của nhiệm kỳ đang chạy', () => {
  const d = (m, n) => new Date(2026, m, n);
  assert.strictEqual(L.batDauNhiemKyTu([]), 0);
  const ds = [
    { NhiemKy: '2025-2026', HocKy: 1, BatDau: d(0, 1) },
    { NhiemKy: '2026-2027', HocKy: 1, BatDau: d(8, 10) },
    { NhiemKy: '2026-2027', HocKy: 1, BatDau: d(8, 12) },
    { NhiemKy: '2026-2027', HocKy: 2, BatDau: d(11, 1) }
  ];
  assert.strictEqual(L.batDauNhiemKyTu(ds), d(8, 10).getTime());
});

test('kiemTraMaHr: gọn khoảng trắng, không trùng giữa các HR', () => {
  const tk = [
    { Email: 'a@x.vn', HoVaTen: 'An', VaiTro: 'HR', MaHr: 'HR01' },
    { Email: 'b@x.vn', HoVaTen: 'Bình', VaiTro: 'HR', MaHr: '' },
    { Email: 'c@x.vn', HoVaTen: 'Chi', VaiTro: 'BOD', MaHr: 'HR02' }
  ];
  assert.deepStrictEqual(L.kiemTraMaHr('  HR  03 ', tk, 'b@x.vn'), { ma: 'HR 03', loi: '' });
  assert.match(L.kiemTraMaHr('hr01', tk, 'b@x.vn').loi, /An/);
  assert.strictEqual(L.kiemTraMaHr('HR01', tk, 'A@x.vn').loi, '');
  assert.strictEqual(L.kiemTraMaHr('HR02', tk, 'b@x.vn').loi, '');
  assert.strictEqual(L.kiemTraMaHr('', tk, 'b@x.vn').loi, '');
  assert.match(L.kiemTraMaHr('x'.repeat(21), tk, 'b@x.vn').loi, /20/);
});

test('kiểu tải: nhiệm kỳ theo năm tải, mỗi đợt một lần, làm lại thì thành Cập nhật', () => {
  const K = L.KIEU_TAI;
  const t10 = new Date(2026, 9, 1), t2 = new Date(2027, 1, 1);
  assert.strictEqual(L.nhiemKyTheoKieu(t10, K.ODAY), '2026-2027');
  assert.strictEqual(L.nhiemKyTheoKieu(t10, K.DOT1), '2026-2027');
  assert.strictEqual(L.nhiemKyTheoKieu(t2, K.DOT2), '2026-2027');
  let kt = L.kieuTaiThucTe(K.ODAY, t10, []);
  assert.deepStrictEqual([kt.kieu, kt.nhiemKy, kt.doiThanhCapNhat, kt.dauNhiemKy], [K.ODAY, '2026-2027', false, true]);
  kt = L.kieuTaiThucTe(K.DOT1, t10, [{ NhiemKy: '2026-2027', Kieu: K.ODAY }]);
  assert.deepStrictEqual([kt.kieu, kt.dauNhiemKy], [K.DOT1, false]);
  kt = L.kieuTaiThucTe(K.DOT1, t10, [{ NhiemKy: '2026-2027', KieuTaiLen: K.DOT1 }]); // dòng KyHoatDong cũ
  assert.deepStrictEqual([kt.kieu, kt.doiThanhCapNhat], [K.CAP_NHAT, true]);
  kt = L.kieuTaiThucTe(K.ODAY, t10, [{ NhiemKy: '2026-2027', Kieu: K.DOT1 }]); // Oday sau đợt 1
  assert.strictEqual(kt.kieu, K.CAP_NHAT);
  kt = L.kieuTaiThucTe(K.DOT1, new Date(2027, 8, 1), [{ NhiemKy: '2026-2027', Kieu: K.DOT1 }]); // nhiệm kỳ sau
  assert.deepStrictEqual([kt.kieu, kt.nhiemKy, kt.dauNhiemKy], [K.DOT1, '2027-2028', true]);
  assert.strictEqual(L.kieuTaiThucTe(K.CAP_NHAT, t10, []).kieu, K.CAP_NHAT);
});

test('so danh sách: thêm, sửa, ẩn, đổi ban; gắn chính thức và bổ sung', () => {
  const cu = [
    { HoVaTen: 'An', Ban: 'PG', Lop: '10A1', LoaiThanhVien: 'Chính thức' },
    { HoVaTen: 'Bình', Ban: 'AD', Lop: '10A2', LoaiThanhVien: 'Bổ sung', DotGiaNhap: 'Đợt 2' },
    { HoVaTen: 'Chi', Ban: 'HR' }
  ];
  const moi = [{ HoVaTen: 'an', Ban: 'PR CAP', Lop: '10A1' }, { HoVaTen: 'Bình', Ban: 'AD', Lop: '10A2' }, { HoVaTen: 'Dũng', Ban: 'PG' }];
  const ss = L.soSanhDanhSach(cu, moi);
  assert.deepStrictEqual(ss.them, ['Dũng']);
  assert.deepStrictEqual(ss.sua, ['an']);
  assert.deepStrictEqual(ss.an, ['Chi']);
  assert.deepStrictEqual(ss.doiBan, [{ HoVaTen: 'an', BanCu: 'PG', BanMoi: 'PR CAP' }]);
  const g2 = L.ganLoaiThanhVien(moi, cu, L.KIEU_TAI.DOT2, false);
  assert.deepStrictEqual(g2.map((t) => [t.LoaiThanhVien, t.DotGiaNhap]), [['Chính thức', ''], ['Bổ sung', 'Đợt 2'], ['Bổ sung', 'Đợt 2']]);
  const g1 = L.ganLoaiThanhVien(moi, cu, L.KIEU_TAI.DOT1, true); // đầu nhiệm kỳ mới: mọi người là chính thức
  assert.deepStrictEqual(g1.map((t) => [t.LoaiThanhVien, t.DotGiaNhap]), [['Chính thức', ''], ['Chính thức', ''], ['Chính thức', 'Đợt 1']]);
  assert.strictEqual(L.ganLoaiThanhVien(moi, cu, L.KIEU_TAI.CAP_NHAT, false)[2].LoaiThanhVien, 'Chính thức');
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
