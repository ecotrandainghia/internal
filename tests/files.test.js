const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('tên file trong src/ không trùng nhau khi bỏ đuôi (Apps Script không cho file .gs và .html cùng tên)', () => {
  const names = fs.readdirSync(path.join(__dirname, '..', 'src')).filter((f) => /\.(gs|html)$/.test(f)).map((f) => f.replace(/\.(gs|html)$/, ''));
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});
