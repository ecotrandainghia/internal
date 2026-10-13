const test = require('node:test');
const assert = require('node:assert');
const L = require('./load-logic');

const TV = [{ HoVaTen: 'Nguyễn A', Ban: 'PG' }, { HoVaTen: 'Lê B', Ban: 'BOD' }];
const T = L.TRANG_THAI_TASK;

test('ngày và khoảng cách ngày', () => {
  assert.strictEqual(L.ngayHopLe('2026-02-29'), false);
  assert.strictEqual(L.ngayHopLe('2028-02-29'), true);
  assert.strictEqual(L.ngayHopLe('07/10/2026'), false);
  assert.strictEqual(L.soNgayGiua('2026-09-30', '2026-10-02'), 2);
  assert.strictEqual(L.soNgayGiua('2026-10-02', '2026-09-30'), -2);
  assert.strictEqual(L.hienNgay('2026-10-07'), '07/10/2026');
});

test('trangThaiTask tính sắp đến hạn và trễ hạn', () => {
  const hom = '2026-10-01';
  assert.strictEqual(L.trangThaiTask(T.GIAO, '2026-10-10', hom, 2), T.GIAO);
  assert.strictEqual(L.trangThaiTask(T.GIAO, '2026-10-03', hom, 2), T.SAP);
  assert.strictEqual(L.trangThaiTask(T.GIAO, '2026-10-01', hom, 0), T.SAP);
  assert.strictEqual(L.trangThaiTask(T.GIAO, '2026-09-30', hom, 2), T.TRE);
  assert.strictEqual(L.trangThaiTask(T.XONG, '2026-09-30', hom, 2), T.XONG);
  assert.strictEqual(L.trangThaiTask(T.HUY, '2026-09-30', hom, 2), T.HUY);
});

test('taoDongTask: mỗi người một dòng, ghi giao hay nhập', () => {
  const now = new Date(2026, 9, 1);
  const kq = L.taoDongTask({ ten: '  Chốt  địa điểm ', hanChot: '2026-10-07', nguoi: ['nguyễn a', 'Lê B', 'Nguyễn A'] }, TV, 'Lê B', 'BOD', now);
  assert.strictEqual(kq.loi, '');
  assert.strictEqual(kq.dong.length, 2);
  assert.strictEqual(kq.dong[0].TenTask, 'Chốt địa điểm');
  assert.strictEqual(kq.dong[0].NguoiPhuTrach, 'Nguyễn A');
  assert.strictEqual(kq.dong[0].KieuTao, 'Giao task');
  assert.strictEqual(kq.dong[0].TrangThai, T.GIAO);
  assert.strictEqual(L.taoDongTask({ ten: 'x', hanChot: '2026-10-07', nguoi: ['Lê B'] }, TV, 'C', 'HR', now).dong[0].KieuTao, 'Nhập task');
});

test('kiemTraTask báo lỗi rõ ràng', () => {
  assert.match(L.kiemTraTask({ ten: '', hanChot: '2026-10-07', nguoi: ['Lê B'] }, TV).loi, /tên task/);
  assert.match(L.kiemTraTask({ ten: 'x', hanChot: '', nguoi: ['Lê B'] }, TV).loi, /Hạn chót/);
  assert.match(L.kiemTraTask({ ten: 'x', hanChot: '2026-10-07', nguoi: [] }, TV).loi, /người phụ trách/);
  assert.match(L.kiemTraTask({ ten: 'x', hanChot: '2026-10-07', nguoi: ['Ai Đó'] }, TV).loi, /Ai Đó/);
});

test('chonTaskTheoLich: mỗi mốc có ngày và giờ riêng', () => {
  const hom = '2026-10-05';
  const ds = [
    { ten: 'còn 2', hanChot: '2026-10-07', trangThai: T.GIAO },
    { ten: 'hôm nay', hanChot: '2026-10-05', trangThai: T.SAP },
    { ten: 'trễ 1', hanChot: '2026-10-04', trangThai: T.TRE },
    { ten: 'trễ 3', hanChot: '2026-10-02', trangThai: T.TRE },
    { ten: 'xong', hanChot: '2026-10-05', trangThai: T.XONG }
  ];
  const lich = [{ ngay: -2, gio: 19, phut: 0 }, { ngay: 0, gio: 6, phut: 30 }, { ngay: 1, gio: 19, phut: 0 }];
  const ten = (l, luc) => L.chonTaskTheoLich(ds, hom, l, luc).map((t) => t.ten);
  assert.deepStrictEqual(ten(lich, 19 * 60), ['còn 2', 'trễ 1']);
  assert.deepStrictEqual(ten(lich, 6 * 60 + 30), ['hôm nay']);
  assert.deepStrictEqual(ten(lich, 8 * 60), []);
  assert.deepStrictEqual(ten(lich, null), ['còn 2', 'hôm nay', 'trễ 1']);
  assert.deepStrictEqual(ten([{ ngay: 'T', gio: 20, phut: 0 }], 20 * 60), ['trễ 1', 'trễ 3']);
});

test('chuanHoaLichNhac bỏ mốc sai và trùng, xếp theo ngày', () => {
  const kq = L.chuanHoaLichNhac('[{"ngay":"T","gio":20},{"ngay":0,"gio":6,"phut":30},{"ngay":-2,"gio":19},{"ngay":-2,"gio":19},{"ngay":1,"gio":25},{"ngay":"","gio":8},{"ngay":0,"gio":7,"phut":10}]');
  assert.deepStrictEqual(kq, [{ ngay: -2, gio: 19, phut: 0 }, { ngay: 0, gio: 6, phut: 30 }, { ngay: 'T', gio: 20, phut: 0 }]);
  assert.strictEqual(L.chuanHoaLichNhac('không phải json'), null);
  assert.strictEqual(L.chuanHoaLichNhac(null), null);
  assert.deepStrictEqual(L.lucCuaLich(kq), [390, 1140, 1200]);
  assert.strictEqual(L.moTaMocNhac(kq[1]), 'Ngày hạn chót lúc 06:30');
  assert.strictEqual(L.moTaMocNhac(kq[2]), 'Trễ hạn, mỗi ngày lúc 20:00');
});

test('lichNhacTuCaiDatCu giữ nguyên cách nhắc cũ', () => {
  const ten = (l) => l.map((m) => m.ngay + '@' + m.gio);
  assert.deepStrictEqual(ten(L.lichNhacTuCaiDatCu(2, [20], true, L.NHAC_TRE.MOI_NGAY)), ['-2@20', '-1@20', '0@20', 'T@20']);
  assert.deepStrictEqual(ten(L.lichNhacTuCaiDatCu(1, [7, 20], false, L.NHAC_TRE.MOT_LAN)), ['1@7', '1@20']);
  assert.deepStrictEqual(ten(L.lichNhacTuCaiDatCu(2, [20], false, L.NHAC_TRE.KHONG)), ['0@20']);
});

test('soanTinNhac và chiaTin', () => {
  const hom = '2026-10-05';
  const ds = [{ ten: 'B', nguoi: 'Nguyễn A', hanChot: '2026-10-06' }, { ten: 'A', nguoi: 'Lê B', hanChot: '2026-10-03' }];
  assert.strictEqual(L.soanTinNhac('C', [], hom, false), '');
  const tin = L.soanTinNhac('C', ds, hom, true);
  assert.match(tin, /Messenger/);
  assert.ok(tin.indexOf('Lê B: A (hạn 03/10/2026, trễ 2 ngày)') < tin.indexOf('Nguyễn A: B (hạn 06/10/2026, còn 1 ngày)'));
  const phan = L.chiaTin('a'.repeat(15) + '\n' + 'b'.repeat(8) + '\n' + 'c'.repeat(25), 20);
  assert.ok(phan.every((p) => p.length <= 20));
  assert.strictEqual(phan.join('').replace(/\n/g, ''), 'a'.repeat(15) + 'b'.repeat(8) + 'c'.repeat(25));
});

test('timMaTrongTin', () => {
  assert.strictEqual(L.timMaTrongTin('mã của mình là k7m2qp nhé', ['AB12CD', 'K7M2QP']), 'K7M2QP');
  assert.strictEqual(L.timMaTrongTin('xin chào', ['K7M2QP']), '');
  assert.strictEqual(L.timMaTrongTin('XK7M2QP', ['K7M2QP']), '');
});

test('quyền task: mọi BOD như nhau, không giao cho BOD; HR làm giúp cho người mình phụ trách; còn lại chỉ xem task của mình', () => {
  assert.deepStrictEqual(L.banQuanLy('ad, PR cap; pg,'), ['PG', 'PR', 'AD']);
  assert.deepStrictEqual(L.banQuanLy(''), []);
  assert.deepStrictEqual(L.banCuaHr('HR, BOD, ER'), ['ER'], 'HR không phụ trách ban BOD, HR; chưa phân thì rỗng');
  const ban = { An: 'PG', Binh: 'PR CAP', Bao: 'PR DES', Chi: 'AD', Dung: 'BOD', Duy: 'BOD', Em: 'HR', Ha: 'HR' };
  const ds = Object.keys(ban).concat(['Người cũ']);
  const ha = L.quyenTask({ VaiTro: 'HR', HoVaTen: 'Ha', BanQuanLy: 'PR, HR' }, '', ban);
  assert.deepStrictEqual(ds.filter(ha.sua), ['Binh', 'Bao'], 'các ban PR, không gồm ban HR và chính mình');
  assert.deepStrictEqual(ds.filter(ha.xem), ds.filter(ha.sua));
  const moi = L.quyenTask({ VaiTro: 'HR', HoVaTen: 'Ha', BanQuanLy: '' }, '', ban);
  assert.deepStrictEqual(ds.filter(moi.sua), []);
  assert.ok(moi.moTa, 'HR chưa được phân thì có lời giải thích');
  // Chức vụ không ảnh hưởng: mọi BOD quản lý task của mọi người trừ BOD.
  ['Head PR CAP', ' head  hr ', 'Vice pres', ''].forEach((cv) => {
    const q = L.quyenTask({ VaiTro: 'BOD', HoVaTen: 'Dung' }, cv, ban);
    assert.deepStrictEqual(ds.filter(q.sua), ['An', 'Binh', 'Bao', 'Chi', 'Em', 'Ha', 'Người cũ']);
    assert.deepStrictEqual(ds.filter(q.xem), ds.filter(q.sua));
  });
  const tv = L.quyenTask({ VaiTro: 'TV', HoVaTen: 'An' }, '', ban);
  assert.deepStrictEqual(ds.filter(tv.xem), ['An']);
  assert.deepStrictEqual(ds.filter(tv.sua), []);
  assert.deepStrictEqual(L.banCoo([{ Ban: 'PR DES' }, { Ban: 'BOD' }, { Ban: 'HR' }, { Ban: 'PG' }, { Ban: 'PR CAP' }]), ['PG', 'PR']);
});

test('phạm vi HR phụ trách: chỉ các ban được phân, không gồm BOD', () => {
  const ban = { An: 'PG', Binh: 'PR CAP', Bao: 'PR DES', Chi: 'AD', Dung: 'BOD', Em: 'HR', Ha: 'HR' };
  const ds = Object.keys(ban);
  const ha = L.phamViHr({ VaiTro: 'HR', HoVaTen: 'Ha', BanQuanLy: 'PR, AD' }, ban);
  assert.strictEqual(ha.co, true);
  assert.deepStrictEqual(ha.ban, ['PR', 'AD']);
  assert.deepStrictEqual(ds.filter(ha.thuoc), ['Binh', 'Bao', 'Chi']);
  const moi = L.phamViHr({ VaiTro: 'HR', HoVaTen: 'Moi', BanQuanLy: '' }, ban);
  assert.strictEqual(moi.co, false);
  assert.deepStrictEqual(ds.filter(moi.thuoc), []);
  assert.strictEqual(L.phamViHr({ VaiTro: 'UCV', HoVaTen: 'Ha', BanQuanLy: 'PR' }, ban).co, false);
});

test('KPI task: đúng hạn × chất lượng theo bảng 3 × 3', () => {
  const C = L.CHAT_LUONG, H = L.DUNG_HAN;
  assert.strictEqual(L.dungHanTask('Đã xong', '2026-10-05', '2026-10-05'), H.DUNG);
  assert.strictEqual(L.dungHanTask('Đã xong', '2026-10-05', '2026-10-06'), H.TRE);
  assert.strictEqual(L.dungHanTask('Không hoàn thành', '2026-10-05', ''), H.KHONG_LAM);
  assert.strictEqual(L.dungHanTask('Trễ hạn', '2026-10-05', ''), '');
  const bang = [
    [H.DUNG, C.HOAN_CHINH, 'Đạt'], [H.DUNG, C.CAN_SUA, 'Đạt'], [H.DUNG, C.SO_SAI, 'Chưa đạt'],
    [H.TRE, C.HOAN_CHINH, 'Đạt'], [H.TRE, C.CAN_SUA, 'Chưa đạt'], [H.TRE, C.SO_SAI, 'Chưa đạt'],
    [H.KHONG_LAM, '', 'Chưa đạt'], [H.DUNG, '', 'Chờ đánh giá'], ['', '', '']
  ];
  bang.forEach(([dh, cl, kq]) => assert.strictEqual(L.ketQuaTask(dh, cl), kq, dh + ' × ' + cl));
  assert.match(L.kiemTraDanhGia(C.SO_SAI, 'ngắn'), /dấu hiệu/);
  assert.strictEqual(L.kiemTraDanhGia(C.SO_SAI, 'Thiếu quá nửa phần việc'), '');
  assert.strictEqual(L.kiemTraDanhGia(C.CAN_SUA, ''), '');
  assert.match(L.kiemTraDanhGia('Tốt', ''), /Chọn/);
});

test('gia hạn chỉ hợp lệ khi xin trước hạn ít nhất 24 giờ', () => {
  assert.strictEqual(L.kiemTraGiaHan('2026-10-10', '2026-10-12', '2026-10-09'), '');
  assert.match(L.kiemTraGiaHan('2026-10-10', '2026-10-12', '2026-10-10'), /24 giờ/);
  assert.match(L.kiemTraGiaHan('2026-10-10', '2026-10-10', '2026-10-01'), /sau hạn/);
});

test('tổng KPI task, HR phụ trách ghi trên task', () => {
  const t = (trangThai, ketQua) => ({ trangThai, ketQua });
  const kq = L.tongKpiTask([t('Đã xong', 'Đạt'), t('Đã xong', 'Đạt'), t('Không hoàn thành', 'Chưa đạt'), t('Đã xong', 'Chờ đánh giá'), t('Đã giao', ''), t('Đã huỷ', '')]);
  assert.deepStrictEqual(kq, { giao: 5, dat: 2, chuaDat: 1, cho: 1, dangLam: 1, tiLe: 67 });
  assert.strictEqual(L.tongKpiTask([]).tiLe, null);
  assert.strictEqual(L.hrPhuTrach('an', [{ HoVaTen: 'An', NguoiHr: 'Hà' }], 'Em', true), 'Hà');
  assert.strictEqual(L.hrPhuTrach('Bình', [{ HoVaTen: 'An', NguoiHr: 'Hà' }], 'Em', true), 'Em');
  assert.strictEqual(L.hrPhuTrach('Bình', [], 'BOD A', false), '');
});

test('không giao task cho người được miễn task (ôn thi chuyển cấp)', () => {
  const tv = [{ HoVaTen: 'An' }, { HoVaTen: 'Bình' }];
  const kq = L.taoDongTask({ ten: 'X', hanChot: '2026-10-10', nguoi: ['An', 'Bình'] }, tv, 'Dung', 'BOD', new Date(), [], ['bình']);
  assert.match(kq.loi, /Bình đang được miễn task/);
  const ok = L.taoDongTask({ ten: 'X', hanChot: '2026-10-10', nguoi: ['An'] }, tv, 'Dung', 'BOD', new Date(), [{ HoVaTen: 'An', NguoiHr: 'Em' }], []);
  assert.strictEqual(ok.dong[0].HrPhuTrach, 'Em');
});

test('task trễ quá số ngày cài đặt thì tính là không hoàn thành và thôi nhắc', () => {
  assert.strictEqual(L.trangThaiTask('Đã giao', '2026-10-05', '2026-10-06', 2, 1), 'Trễ hạn');
  assert.strictEqual(L.trangThaiTask('Đã giao', '2026-10-05', '2026-10-07', 2, 1), 'Không hoàn thành');
  assert.strictEqual(L.trangThaiTask('Đã giao', '2026-10-05', '2026-10-06', 2, 0), 'Không hoàn thành');
  assert.strictEqual(L.trangThaiTask('Đã xong', '2026-10-05', '2026-10-20', 2, 1), 'Đã xong');
  assert.strictEqual(L.trangThaiTask('Đã giao', '2026-10-05', '2026-10-20', 2), 'Trễ hạn', 'không truyền số ngày thì không áp dụng');
  const lich = [{ ngay: 'T', gio: 6, phut: 30 }];
  const ds = [{ hanChot: '2026-10-05', trangThai: 'Trễ hạn' }, { hanChot: '2026-10-03', trangThai: 'Không hoàn thành' }];
  assert.strictEqual(L.chonTaskTheoLich(ds, '2026-10-06', lich, null).length, 1);
});

test('xác nhận xong task: chọn đúng hạn hay trễ hạn thay cho ngày nộp', () => {
  // Bấm sau hạn mà chọn đúng hạn thì ghi ngày nộp là hạn chót; bấm trước hạn thì ghi hôm nay.
  assert.strictEqual(L.ngayNopTheoKieu('dung', '2026-10-10', '2026-10-20'), '2026-10-10');
  assert.strictEqual(L.ngayNopTheoKieu('dung', '2026-10-10', '2026-10-08'), '2026-10-08');
  // Trễ hạn: hôm nay nếu đã qua hạn, còn chưa tới hạn thì ngày sau hạn chót (kể cả qua tháng).
  assert.strictEqual(L.ngayNopTheoKieu('tre', '2026-10-10', '2026-10-20'), '2026-10-20');
  assert.strictEqual(L.ngayNopTheoKieu('tre', '2026-10-31', '2026-10-31'), '2026-11-01');
  for (const [kieu, hom] of [['dung', '2026-10-20'], ['dung', '2026-10-01'], ['tre', '2026-10-05'], ['tre', '2026-10-25']]) {
    const nop = L.ngayNopTheoKieu(kieu, '2026-10-10', hom);
    assert.strictEqual(L.dungHanTask('Đã xong', '2026-10-10', nop), kieu === 'dung' ? 'Đúng hạn' : 'Trễ hạn', kieu + ' ' + hom);
  }
});
