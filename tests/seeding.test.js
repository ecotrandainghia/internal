// Seeding: so tên Facebook trong báo cáo seeding với cột Tên Facebook của thành viên.
const test = require('node:test');
const assert = require('node:assert');
const L = require('./load-logic');

test('so tên Facebook không phân biệt dấu, hoa thường, biểu tượng, khoảng trắng', () => {
  assert.strictEqual(L.chuanTenFb('  Bình   TRẦN 🌱 '), 'binh tran');
  assert.strictEqual(L.chuanTenFb('An Nguyễn'), L.chuanTenFb('an nguyen'));
});
