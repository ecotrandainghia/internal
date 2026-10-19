const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');
const asChi = (app) => login(app, 'chi@gmail.com', 'chungCLB');
const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

test('Cần nhắc: người phụ trách ban thấy task trễ và sắp đến hạn của ban mình, kèm tên Facebook, lớp', () => {
  const { app } = setUp();
  app.updateRecord_('members', 'M1', { facebook_name: 'Bình Trần', facebook_url: 'https://facebook.com/binh' });
  assert.throws(() => app.teamReminders(asBinh(app)), /Chỉ người phụ trách ban/);
  const d = plain(app.teamReminders(asChi(app)));
  assert.equal(d.groups.length, 1);
  const g = d.groups[0];
  assert.equal(g.dept, 'PR');
  assert.deepEqual(g.late.map((r) => [r.task, r.name]), [['Báo cáo quỹ', 'Lê Chi'], ['Báo cáo quỹ', 'Trần Thị Bình']]);
  assert.deepEqual(g.soon.map((r) => [r.task, r.name, r.facebook, r.className]), [['Thiết kế poster', 'Trần Thị Bình', 'Bình Trần', '11A1']]);
});

test('Log của ban: số buổi đã đi so với số buổi giao của từng người', () => {
  const { app } = setUp();
  const d = plain(app.teamLog(asChi(app)));
  assert.deepEqual(d.people.map((p) => [p.name, p.attended, p.quota, p.percent, p.needed]), [['Trần Thị Bình', 2, 4, 50, 2]]);
  assert.equal(d.people[0].events[0].name, 'Ngày hội Xanh');
});

test('tin nhắc hạn task: gửi người phụ trách ban, BOD nhận task của mình, ban chưa có NS thì gửi thẳng, tự nhắc thì nhận thêm', () => {
  const { app, bod, ids } = setUp();
  const deadline = at(addDays(new Date(), 5), 23, 59);
  app.updateRecord_('tasks', ids.soon, { deadline });
  const ev = app.readTable_('events')[0].event_id, term = app.readTable_('terms')[0].term_id;
  const t = (name, dept) => app.insertRecords_('tasks', [{ event_id: ev, dept_code: dept, name, deadline, created_by: bod, is_cancelled: false, is_counted: true }], { termId: term })[0].task_id;
  app.insertRecords_('task_assignments', [{ task_id: t('Kế hoạch tài trợ', 'BOD'), member_id: bod }, { task_id: t('Gọi đối tác', 'AD'), member_id: 'M2' }]);
  const times = [{ day: -1, time: '20:30' }, { day: 0, time: '06:30' }, { day: 1, time: '06:30' }];
  const before = at(addDays(deadline, -1), 20, 30);
  let msgs = plain(app.taskReminderMessages_(before, 20 * 60 + 30, times));
  const by = (id) => msgs.find((m) => m.memberId === id);
  assert.deepEqual(msgs.map((m) => m.memberId).sort(), [bod, 'M2'].sort());
  assert.match(by('M2').body, /Nhờ bạn nhắc các bạn sau qua Messenger:\n• Trần Thị Bình \(PR · 11A1\): Thiết kế poster, hạn 23:59 \d\d\/\d\d \(còn 1 ngày\)/);
  assert.match(by('M2').body, /^Bạn có 1 task chưa xác nhận xong:\n• Gọi đối tác/, 'ban AD chưa có người phụ trách nên gửi thẳng');
  assert.match(by(bod).body, /^Bạn có 1 task chưa xác nhận xong:\n• Kế hoạch tài trợ.*\(còn 1 ngày\)$/);
  assert.deepEqual(plain(app.taskReminderMessages_(before, 6 * 60 + 30, times)), [], 'giờ 6:30 hôm trước không có mốc');
  app.updateRecord_('accounts', 'M1', { self_remind: true });
  msgs = plain(app.taskReminderMessages_(at(addDays(deadline, 1), 6, 30), 6 * 60 + 30, times));
  assert.match(msgs.find((m) => m.memberId === 'M1').body, /Thiết kế poster.*\(trễ 1 ngày\)/);
  app.updateRecord_('task_assignments', { task_id: ids.soon, member_id: 'M1' }, { confirmed_at: new Date(), confirmed_by: 'M1' });
  msgs = plain(app.taskReminderMessages_(at(addDays(deadline, 1), 6, 30), 6 * 60 + 30, times));
  assert.ok(!msgs.some((m) => /Thiết kế poster/.test(m.body)), 'đã xác nhận thì không nhắc');
});

test('lịch nhắc: mặc định 3 mốc, mỗi giờ một lịch tự chạy; sửa lịch thì cài lại; chỉ lịch của dự án gọi được', () => {
  const { app, bod, ids } = setUp();
  const tok = asBod(app);
  assert.throws(() => app.taskReminderSettings(asBinh(app)), /Chỉ BOD/);
  let d = plain(app.taskReminderSettings(tok));
  assert.deepEqual(d.times, [{ day: -1, time: '20:30' }, { day: 0, time: '06:30' }, { day: 1, time: '06:30' }]);
  const mine = () => plain(app.__triggers.filter((x) => x.handler === 'runTaskReminders').map((x) => [x.hour, x.minute]).sort((a, b) => a[0] - b[0]));
  assert.deepEqual(mine(), [[6, 30], [20, 30]]);
  app.taskReminderSettings(tok);
  assert.equal(mine().length, 2, 'gọi lại không cài trùng');
  assert.throws(() => app.saveTaskReminders(tok, []), /ít nhất một/);
  assert.throws(() => app.saveTaskReminders(tok, [{ day: 0, time: '25:00' }]), /20:30/);
  assert.throws(() => app.saveTaskReminders(tok, [{ day: 9, time: '07:00' }]), /7 ngày/);
  assert.throws(() => app.saveTaskReminders(tok, ['01', '02', '03', '04', '05', '06', '07'].map((h) => ({ day: 0, time: h + ':00' }))), /tối đa 6 giờ/);
  d = plain(app.saveTaskReminders(tok, [{ day: 0, time: '7:05' }, { day: -2, time: '19:00' }, { day: 0, time: '07:05' }]));
  assert.deepEqual(d.times, [{ day: -2, time: '19:00' }, { day: 0, time: '07:05' }]);
  assert.deepEqual(mine(), [[7, 5], [19, 0]]);
  assert.equal(app.runTaskReminders({}), null);
  assert.equal(app.runTaskReminders({ triggerUid: 'lạ' }), null);
  app.updateRecord_('tasks', ids.soon, { deadline: at(addDays(new Date(), 2), 23, 59) });
  const trg = app.__triggers.find((x) => x.handler === 'runTaskReminders' && x.hour === 19);
  const last = plain(app.runTaskReminders({ triggerUid: trg.id }));
  assert.equal(last.people, 1);
  assert.match(app.readTable_('notifications').find((n) => n.member_id === 'M2').body, /Thiết kế poster/);
  assert.equal(plain(app.taskReminderSettings(tok)).last.people, 1);
});
