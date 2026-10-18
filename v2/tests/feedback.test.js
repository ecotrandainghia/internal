const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');

test('gửi góp ý: ẩn danh không lưu người gửi, chỉ ghi ngày; có tên thì thấy lại ở trang của mình', () => {
  const { app } = setUp();
  const tok = asBinh(app);
  assert.throws(() => app.sendFeedback(tok, { content: '   ' }), /chưa viết/);
  assert.throws(() => app.sendFeedback(tok, { content: 'x'.repeat(2001) }), /2000/);
  assert.throws(() => app.sendFeedback(asBod(app), { content: 'BOD gửi' }), /BOD đọc góp ý/);
  app.sendFeedback(tok, { content: 'Ẩn danh nè', named: false });
  const d = plain(app.sendFeedback(tok, { content: 'Có tên nè', named: true }));
  const rows = app.readTable_('feedback').slice(-2);
  assert.deepEqual(plain(rows.map((r) => [r.content, r.member_id, r.is_anonymous, r.is_read])), [['Ẩn danh nè', '', true, false], ['Có tên nè', 'M1', false, false]]);
  const t = rows[0].sent_date;
  assert.deepEqual([t.getHours(), t.getMinutes(), t.getSeconds()], [0, 0, 0]);
  assert.deepEqual(d.mine.map((f) => [f.content, f.read, f.applied]), [['Có tên nè', false, false]]);
  assert.equal(d.canEarn, true);
});

test('BOD mở trang Góp ý: góp ý mới chuyển sang đã đọc, lần xem này vẫn hiện Mới', () => {
  const { app } = setUp();
  app.sendFeedback(asBinh(app), { content: 'Góp ý 3', named: true });
  const tok = asBod(app);
  let d = plain(app.feedbackPage(tok));
  assert.equal(d.isBod, true);
  assert.deepEqual(d.items.map((f) => [f.content, f.isNew, f.name]), [['Góp ý 3', true, 'Trần Thị Bình'], ['Góp ý 2', false, ''], ['Góp ý 1', true, '']]);
  assert.ok(app.readTable_('feedback').every((f) => f.is_read));
  d = plain(app.feedbackPage(tok));
  assert.ok(d.items.every((f) => !f.isNew));
  assert.equal(plain(app.homeData(tok)).bod.counts.feedback, 0);
});

test('đánh dấu áp dụng: +10, tối đa 2 lần mỗi giai đoạn, ẩn danh không được, bỏ đánh dấu thì huỷ điểm', () => {
  const { app, bod } = setUp();
  const binh = asBinh(app);
  ['A', 'B', 'C'].forEach((x) => app.sendFeedback(binh, { content: x, named: true }));
  const tok = asBod(app);
  const ids = app.readTable_('feedback').map((f) => f.feedback_id);
  assert.throws(() => app.applyFeedback(binh, ids[2]), /Chỉ BOD/);
  assert.throws(() => app.applyFeedback(tok, ids[0]), /ẩn danh/);
  app.applyFeedback(tok, ids[2]);
  assert.throws(() => app.applyFeedback(tok, ids[2]), /đã được đánh dấu/);
  let d = plain(app.applyFeedback(tok, ids[3]));
  assert.throws(() => app.applyFeedback(tok, ids[4]), /đã có 2 góp ý được áp dụng trong GD1/);
  const c = d.items.find((f) => f.id === ids[4]);
  assert.deepEqual([c.used, c.inClub, c.applied], [2, true, false]);
  const pts = app.readTable_('point_entries').filter((e) => e.source === 'feedback');
  assert.deepEqual(plain(pts.map((e) => [e.member_id, e.points, e.source_id, e.awarded_by])), [['M1', 10, ids[2], bod], ['M1', 10, ids[3], bod]]);
  assert.equal(app.findRecord_('feedback', ids[2]).marked_by, bod);
  d = plain(app.unapplyFeedback(tok, ids[2]));
  assert.equal(d.items.find((f) => f.id === ids[2]).applied, false);
  assert.equal(app.readTable_('point_entries').find((e) => e.source_id === ids[2]).is_cancelled, true);
  app.applyFeedback(tok, ids[4]);
  const audit = app.readTable_('audit_log').filter((r) => r.action === 'apply_feedback' && r.column_name === 'is_applied');
  assert.equal(audit.length, 4);
});

test('giai đoạn giao thoa: gửi được nhưng chưa đánh dấu áp dụng được', () => {
  const { app, term } = setUp();
  app.updateRecord_('terms', term, { phase1_start_at: new Date(Date.now() + 864e5) });
  app.sendFeedback(asBinh(app), { content: 'Trong giao thoa', named: true });
  const tok = asBod(app);
  const d = plain(app.feedbackPage(tok));
  assert.equal(d.canApply, false);
  assert.throws(() => app.applyFeedback(tok, d.items[0].id), /giao thoa/);
});
