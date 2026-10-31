const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const DAY = 864e5;

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');

test('file dữ liệu mới có sẵn thang điểm theo quy chế, hoạt động tự cộng ghi mã vào Cài đặt', () => {
  const { app } = setUp();
  const acts = app.readTable_('activities');
  assert.equal(acts.length, 9);
  assert.deepEqual(plain(acts.map((a) => a.points)), [1, 2, 3, 5, 10, 20, 40, 40, 50]);
  assert.equal(app.getSetting_('react_activity_id'), acts[0].activity_id);
  assert.equal(app.getSetting_('log_extra_activity_id'), acts[5].activity_id);
  assert.ok(acts.every((a) => a.is_active && a.added_date));
});

test('thang điểm có từ trước mà Cài đặt chưa ghi mã: app thêm dòng riêng, không đoán theo tên', () => {
  const { app } = setUp();
  const acts = app.readTable_('activities');
  ['react', 'comment'].forEach((k) => app.updateRecord_('settings', k + '_activity_id', { value: '' }));
  app.linkAutoActivities_();
  const react = app.findRecord_('activities', app.getSetting_('react_activity_id'));
  assert.notEqual(react.activity_id, acts[0].activity_id);
  assert.deepEqual([react.name, react.points], ['React bài đăng trong vòng 48 giờ', 1]);
  assert.equal(app.getSetting_('feedback_activity_id'), acts[4].activity_id);
  app.linkAutoActivities_();
  assert.equal(app.readTable_('activities').length, 11);
});

test('BOD sửa điểm react, comment ở mục riêng; chỉ số nguyên dương; ghi Nhật ký', () => {
  const { app } = setUp();
  const tok = asBod(app);
  assert.throws(() => app.setAutoPoints(login(app, 'binh@gmail.com', 'chungCLB'), 'react', 3), /Chỉ BOD/);
  assert.throws(() => app.setAutoPoints(tok, 'staff', 3), /Không có mục/);
  assert.throws(() => app.setAutoPoints(tok, 'react', 0), /số nguyên/);
  const d = plain(app.setAutoPoints(tok, 'comment', 3));
  assert.equal(d.autoActivities.find((a) => a.key === 'comment').points, 3);
  assert.equal(app.findRecord_('activities', app.getSetting_('comment_activity_id')).points, 3);
  assert.equal(app.readTable_('audit_log').filter((r) => r.action === 'set_auto_points').length, 1);
});

test('trang Cộng điểm: chỉ BOD, người không phải BOD kèm điểm giai đoạn này, hoạt động tự cộng có đánh dấu', () => {
  const { app } = setUp();
  assert.throws(() => app.pointsPage(login(app, 'binh@gmail.com', 'chungCLB')), /Chỉ BOD/);
  const d = plain(app.pointsPage(asBod(app)));
  assert.equal(d.canAdd, true);
  assert.equal(d.term.phaseLabel, 'GD1');
  assert.deepEqual(d.members.map((m) => [m.id, m.points]), [['M2', 50], ['M1', 40]]);
  assert.deepEqual(d.depts, ['PR', 'AD']);
  assert.equal(d.activities.length, 5);
  assert.deepEqual(d.autoActivities.map((a) => [a.key, a.points]), [['react', 1], ['comment', 2], ['feedback', 10], ['log_extra', 20]]);
  assert.equal(d.recent.length, 2);
});

test('cộng điểm cho nhiều người, ghi Nhật ký, rồi huỷ một người', () => {
  const { app, bod } = setUp();
  const tok = asBod(app);
  const staff = app.readTable_('activities').find((a) => a.points === 50).activity_id;
  const ev = app.readTable_('events')[0].event_id;
  assert.throws(() => app.addPoints(tok, { activityId: staff, memberIds: [] }), /chưa chọn người/);
  assert.throws(() => app.addPoints(tok, { activityId: app.getSetting_('react_activity_id'), memberIds: ['M1'] }), /app tự cộng/);
  assert.throws(() => app.addPoints(tok, { activityId: staff, memberIds: [bod] }), /là BOD/);
  let d = plain(app.addPoints(tok, { activityId: staff, eventId: ev, memberIds: ['M1', 'M2', 'M1'] }));
  assert.deepEqual(d.members.map((m) => [m.id, m.points]), [['M2', 100], ['M1', 90]]);
  const batch = d.recent[0];
  assert.deepEqual([batch.activity, batch.points, batch.event, batch.by, batch.active], ['Làm staff 1 buổi (sự kiện lớn)', 50, 'Ngày hội Xanh', 'Nguyễn Văn An', 2]);
  assert.equal(app.readTable_('audit_log').filter((r) => r.action === 'add_points').length, 2);
  const m1 = batch.entries.find((e) => e.name === 'Trần Thị Bình').id;
  d = plain(app.cancelPoints(tok, [m1]));
  assert.deepEqual(d.members.find((m) => m.id === 'M1').points, 40);
  assert.equal(d.recent[0].active, 1);
  const row = app.findRecord_('point_entries', m1);
  assert.deepEqual([row.is_cancelled, row.cancelled_by], [true, bod]);
  assert.equal(app.readTable_('audit_log').filter((r) => r.action === 'cancel_points').length, 3);
});

test('hoạt động khác tạo dòng Hoạt động đang tắt; thêm và ẩn hoạt động trong thang điểm', () => {
  const { app } = setUp();
  const tok = asBod(app);
  assert.throws(() => app.addPoints(tok, { other: { name: 'Thi vẽ', points: 2.5 }, memberIds: ['M1'] }), /số nguyên/);
  app.addPoints(tok, { other: { name: 'Thi vẽ tranh', points: 15 }, memberIds: ['M1'] });
  const other = app.readTable_('activities').find((a) => a.name === 'Thi vẽ tranh');
  assert.deepEqual([other.points, other.is_active], [15, false]);
  let d = plain(app.addActivity(tok, { name: 'Viết bài blog', points: 8, limitNote: 'Mỗi bài một lần' }));
  const blog = d.activities.find((a) => a.name === 'Viết bài blog');
  assert.equal(blog.limit, 'Mỗi bài một lần');
  assert.throws(() => app.addActivity(tok, { name: 'viết bài blog', points: 8 }), /đã có/);
  assert.throws(() => app.hideActivity(tok, app.getSetting_('feedback_activity_id')), /không ẩn được/);
  d = plain(app.hideActivity(tok, blog.id));
  assert.equal(d.activities.find((a) => a.id === blog.id), undefined);
});

test('giai đoạn giao thoa không cộng điểm được', () => {
  const { app, term } = setUp();
  app.updateRecord_('terms', term, { phase1_start_at: new Date(Date.now() + DAY) });
  const tok = asBod(app);
  assert.equal(app.pointsPage(tok).canAdd, false);
  const staff = app.readTable_('activities').find((a) => a.points === 50).activity_id;
  assert.throws(() => app.addPoints(tok, { activityId: staff, memberIds: ['M1'] }), /giao thoa/);
});
