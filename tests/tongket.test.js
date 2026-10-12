const test = require('node:test');
const assert = require('node:assert');
const L = require('./load-logic');

const kpi = (log, task) => ({ log: { tiLe: log }, task: { tiLe: task } });

test('top 40%: tính cả người bằng điểm, hạng đồng hạng, 0 điểm không vào top', () => {
  const ds = [10, 8, 8, 5, 0].map((d, i) => ({ ten: 'N' + i, d }));
  const xh = L.xepHangTop(ds, 'd', 40);
  assert.deepStrictEqual(Object.keys(xh.top).sort(), ['n0', 'n1', 'n2']);
  assert.deepStrictEqual([xh.hang.n0, xh.hang.n1, xh.hang.n2, xh.hang.n3], [1, 2, 2, 4]);
  assert.deepStrictEqual(L.xepHangTop([{ ten: 'A', d: 0 }, { ten: 'B', d: 0 }, { ten: 'C', d: 0 }], 'd', 40).top, {});
});

test('phần trăm task để xét certificate: HR theo lượt nhắc, SUP-RES miễn', () => {
  assert.strictEqual(L.phanTramTaskCert({ mien: true }), null);
  assert.strictEqual(L.phanTramTaskCert({ hr: { luot: 10, soQuen: 3 } }), 70);
  assert.strictEqual(L.phanTramTaskCert({ hr: { luot: 0, soQuen: 0 } }), null);
  assert.strictEqual(L.phanTramTaskCert({ task: { tiLe: 75 } }), 75);
});

test('xét certificate theo sơ đồ quy chế', () => {
  const C = L.KQ_CERT;
  const ds = [
    { ten: 'Đạt cả hai', kpi: kpi(80, 85), diemCaKy: 0, diemGd2: 0 },
    { ten: 'Bù trừ top', kpi: kpi(70, 90), diemCaKy: 100, diemGd2: 40 },
    { ten: 'Bù trừ trượt', kpi: kpi(90, 60), diemCaKy: 10, diemGd2: 5 },
    { ten: 'Dưới 60', kpi: kpi(59, 100), diemCaKy: 500, diemGd2: 300 },
    { ten: 'Chưa giao gì', kpi: kpi(null, null), diemCaKy: 0, diemGd2: 0 },
    { ten: 'SUP-RES', kpi: { log: { tiLe: 85 }, mien: true }, diemCaKy: 0, diemGd2: 0 },
    { ten: 'HR quên nhiều', kpi: { log: { tiLe: 95 }, hr: { luot: 10, soQuen: 3, dat: false } }, diemCaKy: 50, diemGd2: 20 },
    { ten: 'Bổ sung', boSung: true, kpi: kpi(65, 100), diemCaKy: null, diemGd2: 45 }
  ];
  const kq = Object.fromEntries(L.xetCertificate(ds).map((k) => [k.ten, k]));
  assert.strictEqual(kq['Đạt cả hai'].ketQua, C.CAP);
  assert.strictEqual(kq['Chưa giao gì'].ketQua, C.CAP);
  assert.strictEqual(kq['SUP-RES'].ketQua, C.CAP);
  assert.strictEqual(kq['Dưới 60'].ketQua, C.CHUA);
  assert.strictEqual(kq['Dưới 60'].buTru, false);
  // Chính thức (7 người) xếp theo tổng cả nhiệm kỳ: top 40% = 3 người (500, 100, 50).
  assert.strictEqual(kq['Bù trừ top'].ketQua, C.CAP_BU_TRU);
  assert.strictEqual(kq['Bù trừ top'].hangBuTru, 2);
  assert.strictEqual(kq['Bù trừ trượt'].ketQua, C.CHUA);
  assert.strictEqual(kq['Bù trừ trượt'].buTru, true);
  // HR: 70% lượt nhắc không quên (≥ 60, < 80) nên xét bù trừ; 50 điểm là hạng 3 nên vẫn trong top 40%.
  assert.strictEqual(kq['HR quên nhiều'].ketQua, C.CAP_BU_TRU);
  // Bổ sung xếp theo điểm giai đoạn 2 trong tất cả 8 người: top 40% = 3 người (300, 45, 40).
  assert.strictEqual(kq['Bổ sung'].ketQua, C.CAP_BU_TRU);
  assert.strictEqual(kq['Bổ sung'].diemBuTru, 45);
});

test('danh sách khen thưởng top 15% từng giai đoạn và cả hai giai đoạn', () => {
  const bang = [
    { ten: 'A', ban: 'PG', diem: 30, diemHk1: 50, diemCaKy: 80, top: true, topHk1: true },
    { ten: 'B', ban: 'PR', diem: 40, diemHk1: 5, diemCaKy: 45, top: true, topHk1: false },
    { ten: 'C', ban: 'AD', diem: 1, diemHk1: 40, diemCaKy: 41, top: false, topHk1: true }
  ];
  const k = L.danhSachKhenThuong(bang, true);
  assert.deepStrictEqual(k.gd1.map((p) => p.ten), ['A', 'C']);
  assert.deepStrictEqual(k.gd2.map((p) => p.ten), ['B', 'A']);
  assert.deepStrictEqual(k.caHai.map((p) => [p.ten, p.diem]), [['A', 80]]);
  assert.deepStrictEqual(L.danhSachKhenThuong(bang, false).gd1.map((p) => p.ten), ['B', 'A']);
});
