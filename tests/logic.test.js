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
  assert.deepStrictEqual(kq[0], { ten: 'A', lop: '10A', ban: 'PR CAP', nhom: 'PR', diem: 3, diemHk1: 5, diemCaKy: 8, boSung: false, top: false, topHk1: false, topCaKy: false });
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

test('tongHopBangDiem: giai đoạn 1 chỉ xếp hạng chính thức; giai đoạn 2 có bảng giai đoạn 1 và cả nhiệm kỳ', () => {
  const ten = Array.from({ length: 10 }, (_, i) => 'N' + i);
  const tv = ten.map((t) => ({ HoVaTen: t, Ban: 'PG' })).concat([{ HoVaTen: 'Bs', Ban: 'PG', LoaiThanhVien: 'Bổ sung' }]);
  const ls = ten.map((t, i) => ({ HoVaTen: t, Diem: 10 - i, NhiemKy: 'K', HocKy: 1 }))
    .concat([{ HoVaTen: 'N9', Diem: 50, NhiemKy: 'K', HocKy: 2 }, { HoVaTen: 'Bs', Diem: 40, NhiemKy: 'K', HocKy: 2 }]);
  const gd1 = L.tongHopBangDiem(tv.slice(0, 10), ls, { NhiemKy: 'K', HocKy: 1 }, []);
  assert.deepStrictEqual(gd1.filter((p) => p.top).map((p) => p.ten), ['N0', 'N1']);
  const luuTru = ten.map((t) => ({ NhiemKy: 'K', HocKy: 1, HoVaTen: t }));
  const gd2 = L.tongHopBangDiem(tv, ls, { NhiemKy: 'K', HocKy: 2 }, luuTru);
  // Giai đoạn 2: 11 người, top 2 → N9 (50) và Bs (40).
  assert.deepStrictEqual(gd2.filter((p) => p.top).map((p) => p.ten), ['N9', 'Bs']);
  // Giai đoạn 1 và cả nhiệm kỳ: chỉ 10 người chính thức.
  assert.deepStrictEqual(gd2.filter((p) => p.topHk1).map((p) => p.ten), ['N0', 'N1']);
  assert.deepStrictEqual(gd2.filter((p) => p.topCaKy).map((p) => p.ten), ['N0', 'N9']);
  const bs = gd2.filter((p) => p.ten === 'Bs')[0];
  assert.strictEqual(bs.diemHk1, null);
  assert.strictEqual(bs.diemCaKy, null);
});

test('giới hạn số lần mỗi giai đoạn (góp ý được dùng tối đa 2 lần)', () => {
  const KY = { NhiemKy: 'K', HocKy: 1 };
  const LOAI = [{ TenLoai: 'Góp ý', Diem: 10, GioiHan: 2 }, { TenLoai: 'Staff', Diem: 3 }];
  const TV = [{ HoVaTen: 'An' }, { HoVaTen: 'Bình' }];
  const ls = [
    { HoVaTen: 'An', LoaiHoatDong: 'Góp ý', NhiemKy: 'K', HocKy: 1 },
    { HoVaTen: 'An', LoaiHoatDong: 'Góp ý', NhiemKy: 'K', HocKy: 1 },
    { HoVaTen: 'Bình', LoaiHoatDong: 'Góp ý', NhiemKy: 'K', HocKy: 2 } // giai đoạn khác không tính
  ];
  const now = new Date();
  assert.match(L.taoDongCongDiem({ loai: 'Góp ý', nguoi: ['An', 'Bình'] }, TV, LOAI, 'BOD', KY, now, ls).loi, /tối đa 2 lần mỗi giai đoạn\. Đã đủ: An\./);
  assert.strictEqual(L.taoDongCongDiem({ loai: 'Góp ý', nguoi: ['Bình'] }, TV, LOAI, 'BOD', KY, now, ls).loi, '');
  assert.strictEqual(L.taoDongCongDiem({ loai: 'Staff', nguoi: ['An'] }, TV, LOAI, 'BOD', KY, now, ls.concat(ls, ls)).loi, '');
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
  assert.deepStrictEqual(L.nhomHr(' sup-seed, CRE ; abc, SUP-SEED'), ['SUP-SEED', 'CRE']);
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
});
