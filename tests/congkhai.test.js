// Trên Apps Script, trang web gọi thẳng được mọi hàm không có dấu _ ở cuối tên.
// Kiểm tra: hàm nào gọi được từ ngoài thì phải kiểm tra đăng nhập, trừ vài hàm được phép công khai.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const CONG_KHAI = [
  'doGet', 'include', // Apps Script tự gọi
  'khoiTaoCoSoDuLieu', // chạy tay trong Apps Script để cấp quyền; chạy lại nhiều lần không sao
  'caiDatTaoMoi', 'caiDatDungFileCo', // cài đặt lần đầu: chỉ chủ dự án, khi chưa cài (kiểm tra canChuDuAn_)
  'guiThuDaLenLich', 'nhacViecHangNgay', 'nhacSeedingTheoGio', 'chayHangDem', // lịch chạy tự động (kiểm tra laLichChay_)
  'dangNhap', 'dangNhapGoogle', 'dangXuat', 'moDesk', 'layAnhNen' // trước khi đăng nhập
];

function hamCongKhai() {
  const ra = [];
  fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).forEach((f) => {
    const s = fs.readFileSync(path.join(SRC, f), 'utf8');
    const dau = [...s.matchAll(/^function ([A-Za-z0-9$]+)\(/gm)];
    dau.forEach((m, i) => {
      const than = s.slice(m.index, i + 1 < dau.length ? dau[i + 1].index : s.length);
      ra.push({ ten: m[1], file: f, than });
    });
  });
  return ra;
}

test('hàm gọi được từ trang web đều kiểm tra đăng nhập', () => {
  const thieu = hamCongKhai().filter((h) => CONG_KHAI.indexOf(h.ten) < 0 && !/(canDangNhap_|docPhien_)\(/.test(h.than));
  assert.deepStrictEqual(thieu.map((h) => h.file + ': ' + h.ten), []);
});

test('hàm chạy theo lịch và cài đặt lần đầu có chặn người ngoài', () => {
  const ds = hamCongKhai();
  const than = (ten) => ds.filter((h) => h.ten === ten)[0].than;
  ['nhacViecHangNgay', 'guiThuDaLenLich', 'nhacSeedingTheoGio', 'chayHangDem'].forEach((t) => assert.match(than(t), /laLichChay_\(e\)/, t));
  ['caiDatTaoMoi', 'caiDatDungFileCo'].forEach((t) => assert.match(than(t), /^function \w+\(yc\) \{\n  canChuDuAn_\(\);/, t));
  const cd = fs.readFileSync(path.join(SRC, 'CaiDatLanDau.gs'), 'utf8');
  assert.match(cd, /function canChuDuAn_\(\) \{\n  if \(daCaiDat_\(\)\) throw[^\n]*\n  if \(!laChuDuAn_\(\)\) throw/);
  assert.match(cd, /function laChuDuAn_\(\) \{[\s\S]*getActiveUser\(\)[\s\S]*getEffectiveUser\(\)[\s\S]*return !!dangMo && dangMo === chu;/);
});

test('lịch chạy tự động có ghi nhật ký và báo lỗi cho BOD', () => {
  const ds = hamCongKhai();
  const than = (ten) => ds.filter((h) => h.ten === ten)[0].than;
  ['nhacViecHangNgay', 'guiThuDaLenLich', 'nhacSeedingTheoGio', 'chayHangDem'].forEach((t) => assert.match(than(t), new RegExp("chayViec_\\('" + t + "'"), t));
});
