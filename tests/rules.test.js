const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');
const audit = (app, table) => app.readTable_('audit_log').filter((a) => a.action === 'change_setting' && a.table_name === table);

test('cơ cấu ban: sửa tên, mảng, tắt ban; thêm ban mới; không xoá, không trùng mã, BOD luôn bật; ghi Nhật ký', () => {
  const { app } = setUp();
  const bod = asBod(app);
  assert.throws(() => app.clubRules(asBinh(app)), /BOD/);
  const d = plain(app.clubRules(bod));
  assert.deepEqual(d.depts.map((x) => [x.code, x.people]), [['BOD', 1], ['PG', 0], ['PR', 1], ['AD', 1], ['HR', 0]]);
  const list = d.depts.map((x) => ({ ...x }));
  list[2].subTeams = 'cap, des,  pho, VID';
  list[4].active = false;
  list[0].active = false;
  list.push({ code: 'mkt', name: 'Marketing', subTeams: '', active: true });
  const out = plain(app.saveDepartments(bod, list));
  assert.deepEqual(out.depts.map((x) => [x.code, x.active, x.order]), [['BOD', true, 1], ['PG', true, 2], ['PR', true, 3], ['AD', true, 4], ['HR', false, 5], ['MKT', true, 6]]);
  assert.equal(out.depts[2].subTeams, 'CAP, DES, PHO, VID');
  assert.ok(audit(app, 'departments').some((a) => a.row_id === 'HR' && a.column_name === 'is_active'));
  assert.ok(audit(app, 'departments').some((a) => a.row_id === 'MKT'));
  assert.throws(() => app.saveDepartments(bod, list.slice(1)), /Không xoá được ban BOD/);
  assert.throws(() => app.saveDepartments(bod, list.concat([{ code: 'PR', name: 'X' }])), /bị trùng/);
  assert.throws(() => app.saveDepartments(bod, list.concat([{ code: 'Ban mới', name: 'X' }])), /chỉ gồm chữ không dấu/);
  assert.throws(() => app.saveDepartments(bod, list.concat([{ code: 'QT', name: ' ' }])), /chưa có tên/);
});

test('số trong quy chế: lưu đúng phạm vi, bù trừ không cao hơn KPI, chỉ ghi Nhật ký số thật sự đổi', () => {
  const { app } = setUp();
  const bod = asBod(app);
  const d = plain(app.saveRuleNumbers(bod, { kpi_threshold: 75, offset_threshold: 60, due_soon_days: 3 }));
  assert.equal(d.numbers.kpi_threshold, 75);
  assert.equal(d.numbers.due_soon_days, 3);
  assert.equal(String(app.getSetting_('kpi_threshold')), '75');
  assert.deepEqual(plain(audit(app, 'settings').map((a) => a.row_id).filter((k) => !/^pinned/.test(k)).sort()), ['due_soon_days', 'kpi_threshold']);
  assert.throws(() => app.saveRuleNumbers(bod, { offset_threshold: 90 }), /không được cao hơn/);
  assert.throws(() => app.saveRuleNumbers(bod, { top_reward_percent: 0 }), /từ 1 đến 100/);
  assert.throws(() => app.saveRuleNumbers(bod, { due_soon_days: 1.5 }), /số nguyên/);
});

test('link ghim: lưu theo thứ tự, bỏ link thừa, phải có tên và https', () => {
  const { app } = setUp();
  const bod = asBod(app);
  assert.deepEqual(plain(app.clubRules(bod)).links.map((l) => l.label), ['Form đăng ký log', 'Quy chế']);
  const d = plain(app.savePinnedLinks(bod, [{ label: 'Quy chế mới', url: 'https://example.com/q' }, { label: '', url: '' }]));
  assert.deepEqual(d.links, [{ url: 'https://example.com/q', label: 'Quy chế mới' }]);
  assert.deepEqual(plain(app.readTable_('settings').filter((s) => /^pinned_link_/.test(s.key)).map((s) => s.key)), ['pinned_link_1']);
  assert.throws(() => app.savePinnedLinks(bod, [{ label: 'A', url: 'http://x.com' }]), /https/);
  assert.throws(() => app.savePinnedLinks(bod, [{ label: '', url: 'https://x.com' }]), /chưa có tên/);
  assert.throws(() => app.savePinnedLinks(bod, Array.from({ length: 9 }, (_, i) => ({ label: 'L' + i, url: 'https://x.com/' + i }))), /Tối đa 8/);
});

test('ảnh đại diện: lưu lên Drive, ai có link xem được, ảnh cũ vào thùng rác, bỏ ảnh được', () => {
  const { app } = setUp();
  const binh = asBinh(app), jpg = 'data:image/jpeg;base64,' + Buffer.from('anh').toString('base64');
  assert.throws(() => app.saveAvatar(binh, 'data:image/png;base64,AAAA'), /không hợp lệ/);
  const url = app.saveAvatar(binh, jpg);
  assert.match(url, /^https:\/\/drive\.google\.com\/thumbnail\?id=[\w-]{20,}&sz=w256$/);
  const first = app.DriveApp.getFileById(app.avatarFileId_(url));
  assert.equal(first.__blob.folder, '[APP] Ảnh đại diện');
  assert.equal(first.__blob.sharing, 'anyone_with_link:view');
  assert.equal(app.findRecord_('accounts', 'M1').avatar_url, url);
  const url2 = app.saveAvatar(binh, jpg);
  assert.notEqual(url2, url);
  assert.equal(first.__blob.trashed, true);
  assert.equal(app.saveAvatar(binh, ''), '');
  assert.equal(app.findRecord_('accounts', 'M1').avatar_url, '');
  assert.equal(app.DriveApp.getFileById(app.avatarFileId_(url2)).__blob.trashed, true);
});
