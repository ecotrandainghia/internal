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

test('phần trăm task để xét chứng nhận: chưa có task nào có kết quả thì không xét', () => {
  assert.strictEqual(L.phanTramTaskCert({}), null);
  assert.strictEqual(L.phanTramTaskCert({ task: { tiLe: null } }), null);
  assert.strictEqual(L.phanTramTaskCert({ task: { tiLe: 75 } }), 75);
});

test('xét certificate theo sơ đồ quy chế', () => {
  const C = L.KQ_CERT;
  const ds = [
    { ten: 'Đạt cả hai', kpi: kpi(80, 85), gd: [0, 0] },
    { ten: 'Bù trừ top', kpi: kpi(70, 90), gd: [60, 40] },
    { ten: 'Bù trừ trượt', kpi: kpi(90, 60), gd: [5, 5] },
    { ten: 'Dưới 60', kpi: kpi(59, 100), gd: [200, 300] },
    { ten: 'Chưa giao gì', kpi: kpi(null, null), gd: [0, 0] },
    { ten: 'Chưa có task', kpi: { log: { tiLe: 85 } }, gd: [0, 0] },
    { ten: 'Ban HR', ban: 'HR', kpi: kpi(95, 70), gd: [30, 20] },
    { ten: 'Bổ sung', gdVao: 2, kpi: kpi(65, 100), gd: [null, 45] }
  ];
  const kq = Object.fromEntries(L.xetCertificate(ds).map((k) => [k.ten, k]));
  assert.strictEqual(kq['Đạt cả hai'].ketQua, C.CAP);
  assert.strictEqual(kq['Chưa giao gì'].ketQua, C.CAP);
  assert.strictEqual(kq['Chưa có task'].ketQua, C.CAP);
  assert.strictEqual(kq['Dưới 60'].ketQua, C.CHUA);
  assert.strictEqual(kq['Dưới 60'].buTru, false);
  // Người vào từ giai đoạn 1 (7 người) xếp theo tổng cả nhiệm kỳ: top 40% = 3 người (500, 100, 50).
  assert.strictEqual(kq['Bù trừ top'].ketQua, C.CAP_BU_TRU);
  assert.strictEqual(kq['Bù trừ top'].hangBuTru, 2);
  assert.strictEqual(kq['Bù trừ top'].diemBuTru, 100);
  assert.strictEqual(kq['Bù trừ trượt'].ketQua, C.CHUA);
  assert.strictEqual(kq['Bù trừ trượt'].buTru, true);
  // Ban HR tính task như mọi ban: 70% (≥ 60, < 80) nên xét bù trừ; 50 điểm là hạng 3 nên vẫn trong top 40%.
  assert.strictEqual(kq['Ban HR'].ketQua, C.CAP_BU_TRU);
  // Vào ở giai đoạn 2: xếp theo điểm từ giai đoạn 2 trong tất cả 8 người: top 40% = 3 người (300, 45, 40).
  assert.strictEqual(kq['Bổ sung'].boSung, true);
  assert.strictEqual(kq['Bổ sung'].ketQua, C.CAP_BU_TRU);
  assert.strictEqual(kq['Bổ sung'].diemBuTru, 45);
  assert.strictEqual(kq['Bổ sung'].soBuTru, 8);
});

test('danh sách khen thưởng top từng giai đoạn, cả nhiệm kỳ và lọt top mọi giai đoạn', () => {
  const bang = [
    { ten: 'A', ban: 'PG', gd: [50, 30], caKy: 80, topGd: [true, true], topCaKy: true },
    { ten: 'B', ban: 'PR', gd: [5, 40], caKy: 45, topGd: [false, true], topCaKy: false },
    { ten: 'C', ban: 'AD', gd: [40, 1], caKy: 41, topGd: [true, false], topCaKy: false },
    { ten: 'D', ban: 'AD', gd: [null, 20], caKy: null, topGd: [false, false], topCaKy: false }
  ];
  const k = L.danhSachKhenThuong(bang, 2);
  assert.deepStrictEqual(k.gd.map((g) => [g.giaiDoan, g.ds.map((p) => p.ten)]), [[1, ['A', 'C']], [2, ['B', 'A']]]);
  assert.deepStrictEqual(k.caKy.map((p) => [p.ten, p.diem]), [['A', 80]]);
  assert.deepStrictEqual(k.moiGiaiDoan.map((p) => p.ten), ['A']);
  const mot = L.danhSachKhenThuong(bang.map((p) => Object.assign({}, p, { gd: p.gd.slice(0, 1), topGd: p.topGd.slice(0, 1) })), 1);
  assert.deepStrictEqual(mot.gd[0].ds.map((p) => p.ten), ['A', 'C']);
  assert.deepStrictEqual([mot.caKy, mot.moiGiaiDoan], [[], []]);
});
