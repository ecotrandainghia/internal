const test = require('node:test');
const assert = require('node:assert');
const L = require('./load-logic');

const B = L.TRANG_THAI_BUOI;
const SK = { ThoiGian: new Date(1000), TenSuKien: 'Sự kiện A', SoBuoiDuKien: 12, GiaoMacDinh: 2, GiaoRieng: '', TrangThai: '' };
const A = { HoVaTen: 'Nguyễn A', Ban: 'PG', Lop: '10A1' };
const buoi = (i, tt, coMat, dangKy, tl) => ({ ThoiGian: i, TenBuoi: 'Buổi ' + i, Ngay: '2026-10-' + String(10 + i).padStart(2, '0'), ThoiLuong: tl || 90, TrangThai: tt, CoMat: (coMat || []).join(', '), DangKy: (dangKy || []).join(', ') });

test('khối lớp và số buổi giao theo khối, ban, mặc định', () => {
  assert.strictEqual(L.khoiLop('9A1'), 9);
  assert.strictEqual(L.khoiLop(' 10 Anh'), 10);
  assert.strictEqual(L.khoiLop('A9'), 0);
  assert.strictEqual(L.khoiLop('123'), 0);
  const sk = Object.assign({}, SK, { GiaoRieng: JSON.stringify([{ loai: 'ban', gia: 'PR', so: 3 }, { loai: 'ban', gia: 'HR', so: 0 }, { loai: 'khoi', gia: 9, so: 1 }]) });
  assert.strictEqual(L.giaoBanDau(sk, { Ban: 'PG', Lop: '11B' }), 2);
  assert.strictEqual(L.giaoBanDau(sk, { Ban: 'PR CAP', Lop: '11B' }), 3);
  assert.strictEqual(L.giaoBanDau(sk, { Ban: 'PR CAP', Lop: '9A2' }), 1, 'khối 9 ưu tiên hơn ban');
  assert.strictEqual(L.giaoBanDau(sk, { Ban: 'HR', Lop: '10' }), 0);
});

test('kiểm tra sự kiện và buổi log', () => {
  assert.match(L.chuanHoaSuKienLog({ ten: '', soBuoiDuKien: 4, giaoMacDinh: 1 }).loi, /tên/);
  assert.match(L.chuanHoaSuKienLog({ ten: 'X', soBuoiDuKien: 0, giaoMacDinh: 1 }).loi, /dự kiến/);
  assert.match(L.chuanHoaSuKienLog({ ten: 'X', soBuoiDuKien: 4, giaoMacDinh: 5 }).loi, /nhiều hơn/);
  assert.match(L.chuanHoaSuKienLog({ ten: 'X', soBuoiDuKien: 4, giaoMacDinh: 1, giaoRieng: [{ loai: 'ban', gia: 'pg', so: 2 }, { loai: 'ban', gia: 'PG', so: 1 }] }).loi, /hai lần/);
  const ok = L.chuanHoaSuKienLog({ ten: ' X ', soBuoiDuKien: 4, giaoMacDinh: '1', giaoRieng: [{ loai: 'khoi', gia: '9', so: 0 }] });
  assert.strictEqual(ok.loi, '');
  assert.deepStrictEqual(ok.dong, { TenSuKien: 'X', SoBuoiDuKien: 4, GiaoMacDinh: 1, GiaoRieng: '[{"loai":"khoi","gia":9,"so":0}]' });
  assert.match(L.chuanHoaBuoiLog({ ten: 'B', thoiLuong: 60 }).loi, /90 hoặc 180/);
  const b = L.chuanHoaBuoiLog({ ten: 'B1', ngay: '2026-10-12', thoiLuong: '180', trangThai: B.DIEN_RA, dangKy: ['An', 'an', ' Bình '], coMat: 'An' });
  assert.deepStrictEqual(b.dong, { TenBuoi: 'B1', Ngay: '2026-10-12', ThoiLuong: 180, TrangThai: B.DIEN_RA, DangKy: 'An, Bình', CoMat: 'An' });
});

test('số buổi được giao cuối giảm theo tỉ lệ khi huỷ vì hết việc, không bao giờ tăng', () => {
  assert.strictEqual(L.giaoCuoi(2, 12, 6), 1);
  assert.strictEqual(L.giaoCuoi(2, 12, 14), 2);
  assert.strictEqual(L.giaoCuoi(0, 12, 6), 0);
  // Chưa chốt: dự kiến trừ số buổi đã huỷ vì hết việc.
  const ds = [buoi(1, B.DIEN_RA), buoi(2, B.HUY_HET_VIEC), buoi(3, B.HUY_KHAC), buoi(4, B.XOA)];
  assert.strictEqual(L.soBuoiThucDien(SK, ds), 11);
  // Đã chốt: số buổi đã diễn ra hoặc huỷ vì lý do khác.
  assert.strictEqual(L.soBuoiThucDien(Object.assign({}, SK, { TrangThai: L.SU_KIEN_CHOT }), ds), 2);
});

test('KPI log một sự kiện: ví dụ trong quy chế, buổi huỷ vì lý do khác, buổi vượt', () => {
  const sk = Object.assign({}, SK, { TrangThai: L.SU_KIEN_CHOT });
  const ds = [1, 2, 3, 4, 5, 6].map((i) => buoi(i, B.DIEN_RA, i <= 3 ? ['nguyễn a'] : [], [], i === 3 ? 180 : 90));
  ds.push(buoi(7, B.HUY_HET_VIEC, [], ['Nguyễn A']));
  const k = L.kpiLogSuKien(sk, ds, A);
  assert.strictEqual(k.giao, 2);
  assert.strictEqual(k.giaoCuoi, 1, '6 × 2/12 = 1 buổi');
  assert.strictEqual(k.thamGia, 3);
  assert.deepStrictEqual(k.vuot.map((b) => b.TenBuoi), ['Buổi 2', 'Buổi 3'], 'buổi vượt là những buổi muộn nhất');
  // Huỷ vì lý do khác: tính là đã tham gia với người đã đăng ký, nhưng không được cộng điểm vượt.
  const ds2 = [buoi(1, B.HUY_KHAC, [], ['Nguyễn A']), buoi(2, B.HUY_KHAC, [], ['Nguyễn A']), buoi(3, B.HUY_KHAC, [], ['Nguyễn A'])];
  const k2 = L.kpiLogSuKien(Object.assign({}, SK, { SoBuoiDuKien: 3, GiaoMacDinh: 2 }), ds2, A);
  assert.strictEqual(k2.thamGia, 3);
  assert.strictEqual(k2.vuot.length, 0);
});

test('KPI log cả nhiệm kỳ: cộng các sự kiện, bỏ sự kiện huỷ, người vào ở giai đoạn 2 chỉ tính từ giai đoạn 2', () => {
  const s1 = Object.assign({}, SK, { ThoiGian: new Date(1000), SoBuoiDuKien: 4, GiaoMacDinh: 2, buoi: [buoi(1, B.DIEN_RA, ['Nguyễn A'])] });
  const s2 = Object.assign({}, SK, { ThoiGian: new Date(5000), TenSuKien: 'B', SoBuoiDuKien: 3, GiaoMacDinh: 1, buoi: [buoi(1, B.DIEN_RA, ['Nguyễn A']), buoi(2, B.DIEN_RA, ['Nguyễn A'])] });
  const s3 = Object.assign({}, SK, { ThoiGian: new Date(6000), TrangThai: L.SU_KIEN_HUY, buoi: [] });
  const k = L.kpiLogCuaNguoi(A, [s1, s2, s3], { 1: 0, 2: 4000 });
  assert.strictEqual(k.giaoCuoi, 3);
  assert.strictEqual(k.thamGia, 3);
  assert.strictEqual(k.tiLe, 100);
  assert.strictEqual(k.chiTiet.length, 2);
  const bs = L.kpiLogCuaNguoi(Object.assign({}, A, { GiaiDoanVao: 2 }), [s1, s2], { 1: 0, 2: 4000 });
  assert.deepStrictEqual([bs.giaoCuoi, bs.thamGia, bs.tiLe], [1, 2, 200]);
  assert.strictEqual(L.kpiLogCuaNguoi(A, [], {}).tiLe, null);
  // Số lẻ: 2/12 × 7 = 1,1667 buổi; tham gia 1 buổi -> 85,7% -> 86%.
  const s4 = Object.assign({}, SK, { TrangThai: L.SU_KIEN_CHOT, buoi: [1, 2, 3, 4, 5, 6, 7].map((i) => buoi(i, B.DIEN_RA, i === 1 ? ['Nguyễn A'] : [])) });
  const k4 = L.kpiLogCuaNguoi(A, [s4], {});
  assert.strictEqual(k4.giaoCuoi, 1.17);
  assert.strictEqual(k4.tiLe, 86);
});

test('điểm log vượt khi chốt: mỗi buổi vượt một dòng theo thời lượng', () => {
  const loai = [{ TenLoai: 'Log 90', Diem: 20, DungCho: 'log90' }, { TenLoai: 'Log 180', Diem: 40, DungCho: 'log180' }];
  const sk = Object.assign({}, SK, { SoBuoiDuKien: 4, GiaoMacDinh: 1, TrangThai: L.SU_KIEN_CHOT });
  const ds = [buoi(1, B.DIEN_RA, ['Nguyễn A']), buoi(2, B.DIEN_RA, ['Nguyễn A'], [], 180), buoi(3, B.DIEN_RA, ['Nguyễn A']), buoi(4, B.DIEN_RA, [])];
  const ky = { NhiemKy: '2026-2027', HocKy: 1 };
  const kq = L.dongDiemLogVuot(sk, ds, [A, { HoVaTen: 'Lê B', Ban: 'PG' }], loai, ky, 'Log: BOD', new Date(9));
  assert.strictEqual(kq.loi, '');
  assert.deepStrictEqual(kq.dong.map((d) => [d.HoVaTen, d.LoaiHoatDong, d.Diem, d.TenHoatDong]), [
    ['Nguyễn A', 'Log 180', 40, 'Sự kiện A · Buổi 2'], ['Nguyễn A', 'Log 90', 20, 'Sự kiện A · Buổi 3']]);
  assert.match(L.dongDiemLogVuot(sk, ds, [A], loai.slice(0, 1), ky, 'x', new Date()).loi, /180/);
  // Không ai vượt thì không cần loại hoạt động.
  assert.deepStrictEqual(L.dongDiemLogVuot(sk, ds.slice(3), [A], [], ky, 'x', new Date()), { dong: [], loi: '' });
});

test('đọc đăng ký từ file đăng ký log', () => {
  const cu = [['[ECO] Đăng ký log'], [''], ['', '', '', '', 2, 1, ''], ['Họ và tên', 'Lớp', 'Ban', 'SĐT', 'Sáng T7', 'Chiều T7', 'Ghi chú'],
    ['Nguyễn A', '10A1', 'PG', '09', true, false, ''], ['Lê B', '11', 'PR', '', true, true, 'x'], ['', '', '', '', false, false, '']];
  assert.deepStrictEqual(L.docDangKyLog(cu, true), [{ ten: 'Sáng T7', dangKy: ['Nguyễn A', 'Lê B'] }, { ten: 'Chiều T7', dangKy: ['Lê B'] }]);
  const chung = [['STT', 'Họ và tên', 'Ban', 'Số điện thoại', 'Buổi 1', 'Buổi 2'], [1, 'Nguyễn A', 'PG', '', 'TRUE', 'FALSE']];
  assert.deepStrictEqual(L.docDangKyLog(chung, false), [{ ten: 'Buổi 1', dangKy: ['Nguyễn A'] }, { ten: 'Buổi 2', dangKy: [] }]);
  assert.deepStrictEqual(L.docDangKyLog([['x']], false), []);
});

test('mức điểm theo quy chế gắn log vượt với hai chức năng tự cộng', () => {
  const kq = L.chuanHoaLoaiHoatDong(L.MUC_DIEM_QUY_CHE);
  assert.strictEqual(kq.loi, '');
  assert.strictEqual(L.loaiDungCho(kq.ds, 'log90').Diem, 20);
  assert.strictEqual(L.loaiDungCho(kq.ds, 'log180').Diem, 40);
});
