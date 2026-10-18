const test = require('node:test');
const assert = require('node:assert/strict');

const { setUp } = require('./sample');

const asBod = (app) => app.login('an@gmail.com', 'matkhauAn').token;
const asBinh = (app) => app.login('binh@gmail.com', 'chungCLB').token;
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224, 1, 2, 3]).toString('base64');

test('giao diện theo mùa: chỉ BOD đổi, mã lạ bị từ chối, trống là bỏ trang trí, ghi Nhật ký', () => {
  const { app } = setUp();
  const token = asBod(app);
  assert.equal(app.seasonTheme_(), '');
  assert.throws(() => app.saveSeason(asBinh(app), 'tet'));
  assert.throws(() => app.saveSeason(token, 'mua-mua'), /không hợp lệ/);
  assert.equal(app.saveSeason(token, 'mid_autumn'), 'mid_autumn');
  assert.equal(app.seasonTheme_(), 'mid_autumn');
  assert.ok(app.readTable_('audit_log').some((a) => a.table_name === 'settings' && a.row_id === 'season_theme' && a.new_value === 'mid_autumn'));
  assert.equal(app.saveSeason(token, ''), '');
  assert.equal(app.seasonTheme_(), '');
});

test('ảnh nền đăng nhập: chỉ nhận JPEG, máy đã có bản mới thì không tải lại, đổi ảnh thì bỏ ảnh cũ', () => {
  const { app } = setUp();
  const token = asBod(app);
  assert.deepEqual(JSON.parse(JSON.stringify(app.loginBackground(''))), { version: '' });
  assert.throws(() => app.saveLoginBackground(token, 'data:image/png;base64,AAAA'), /JPEG/);
  assert.throws(() => app.saveLoginBackground(token, 'data:image/jpeg;base64,' + 'A'.repeat(2500004)), /quá lớn/);
  assert.throws(() => app.saveLoginBackground(asBinh(app), JPEG));

  const v1 = app.saveLoginBackground(token, JPEG);
  assert.ok(v1);
  const first = app.getSetting_('login_bg_file_id');
  const r = app.loginBackground('');
  assert.equal(r.version, v1);
  assert.equal(r.data, JPEG);
  assert.equal(app.loginBackground(v1).data, undefined, 'máy đã có đúng bản thì không gửi lại ảnh');

  const v2 = app.saveLoginBackground(token, JPEG);
  assert.notEqual(app.getSetting_('login_bg_file_id'), first);
  assert.equal(app.DriveApp.getFileById(first).__blob.trashed, true);
  assert.equal(app.DriveApp.getFileById(app.getSetting_('login_bg_file_id')).__blob.folder, 'Ảnh nền đăng nhập');
  assert.equal(app.loginBackground(v1).version, v2);

  assert.equal(app.saveLoginBackground(token, ''), '');
  assert.equal(app.loginBackground(v2).version, '');
});
