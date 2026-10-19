const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');
const asChi = (app) => login(app, 'chi@gmail.com', 'chungCLB');
const dayOff = (n) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
const born = (d, year = 2009) => new Date(year, d.getMonth(), d.getDate());

/** Bình sinh nhật mai, Chi sinh nhật hôm nay, BOD An sinh nhật sau 10 ngày. */
function bdSetUp() {
  const s = setUp();
  s.app.updateRecord_('members', 'M1', { birth_date: born(dayOff(1)), facebook_url: 'https://facebook.com/binh' });
  s.app.updateRecord_('members', 'M2', { birth_date: born(dayOff(0)) });
  s.app.updateRecord_('members', s.bod, { birth_date: born(dayOff(10), 1990) });
  return s;
}

test('ngày sinh: 29/2 năm không nhuận tính là 28/2, đếm ngày tới sinh nhật kế tiếp', () => {
  const { app } = setUp();
  assert.equal(app.birthdayIn_(2027, 2, 29).getDate(), 28);
  assert.equal(app.birthdayIn_(2028, 2, 29).getDate(), 29);
  assert.equal(app.daysToBirthday_(new Date(2026, 11, 31, 15), 1, 1), 1);
  assert.equal(app.daysToBirthday_(new Date(2026, 5, 10, 8), 6, 10), 0);
  assert.equal(app.daysToBirthday_(new Date(2026, 5, 11), 6, 10), 364);
});

test('trang Sinh nhật: NS phụ trách sinh nhật hoặc BOD; 30 ngày tới, cả năm, người thiếu ngày sinh', () => {
  const { app, term } = bdSetUp();
  assert.throws(() => app.birthdayPage(asBinh(app)), /Chỉ NS phụ trách sinh nhật/);
  app.insertRecords_('member_labels', [{ member_id: 'M1', term_id: term, label_type: 'birthday_lead' }], { termId: term });
  const d = plain(app.birthdayPage(asBinh(app)));
  assert.deepEqual(d.soon.map((p) => [p.name, p.inDays]), [['Lê Chi', 0], ['Trần Thị Bình', 1], ['Nguyễn Văn An', 10]]);
  assert.equal(d.people.length, 3);
  assert.deepEqual([d.days, d.time, d.calendarId, d.isBod], [1, '07:00', '', false]);
  app.updateRecord_('members', 'M2', { birth_date: '' });
  assert.deepEqual(plain(app.birthdayPage(asBod(app))).missing, ['Lê Chi']);
});

test('tin nhắc sinh nhật: gửi NS phụ trách sinh nhật, chưa có ai thì gửi BOD; trước mấy ngày theo cài đặt', () => {
  const { app, bod, term } = bdSetUp();
  let msgs = plain(app.birthdayReminderMessages_(new Date()));
  assert.deepEqual(msgs.map((m) => m.memberId), [bod], 'chưa có NS phụ trách sinh nhật thì gửi BOD');
  assert.match(msgs[0].body, /^CLB chưa có NS phụ trách sinh nhật/);
  assert.match(msgs[0].body, /• Lê Chi \(AD · 11A2\): \d\d\/\d\d, hôm nay\n• Trần Thị Bình \(PR · 11A1\): \d\d\/\d\d, ngày mai\n  https:\/\/facebook\.com\/binh$/);
  app.insertRecords_('member_labels', [{ member_id: 'M2', term_id: term, label_type: 'birthday_lead' }], { termId: term });
  app.saveBirthdaySettings(asBod(app), { days: 0, time: '06:15', calendarId: '' });
  msgs = plain(app.birthdayReminderMessages_(new Date()));
  assert.deepEqual(msgs.map((m) => [m.memberId, m.title]), [['M2', 'Nhắc sinh nhật']]);
  assert.doesNotMatch(msgs[0].body, /Bình/, '0 ngày là chỉ nhắc đúng ngày');
  assert.deepEqual(plain(app.birthdayReminderMessages_(dayOff(2))), [], 'không có sinh nhật thì không gửi');
  const trg = app.__triggers.find((t) => t.handler === 'runBirthdayReminders');
  assert.deepEqual([trg.hour, trg.minute], [6, 15]);
  app.saveBirthdaySettings(asBod(app), { days: 3, time: '20:00', calendarId: '' });
  assert.deepEqual(app.__triggers.filter((t) => t.handler === 'runBirthdayReminders').map((t) => t.hour), [20], 'đổi giờ thì cài lại, không để hai lịch');
  assert.equal(app.runBirthdayReminders({}), null);
  app.runBirthdayReminders({ triggerUid: app.__triggers.find((t) => t.handler === 'runBirthdayReminders').id });
  assert.equal(app.readTable_('notifications').filter((n) => n.title === 'Nhắc sinh nhật' && n.member_id === 'M2').length, 1);
  assert.throws(() => app.saveBirthdaySettings(asBod(app), { days: 30, time: '20:00' }), /từ 0 đến 14/);
  assert.throws(() => app.saveBirthdaySettings(asBod(app), { days: 1, time: '25:00' }), /Giờ nhắc/);
  assert.throws(() => app.saveBirthdaySettings(asChi(app), { days: 1, time: '07:00' }), /BOD/);
});

test('lịch Google: tạo sự kiện lặp không có nhắc, giữ cái không đổi, tạo lại khi đổi ban, bỏ người đã rời, không đụng sự kiện khác', () => {
  const { app, bod } = bdSetUp();
  assert.throws(() => app.saveBirthdaySettings(asBod(app), { days: 1, time: '07:00', calendarId: 'khong-co' }), /Không mở được lịch/);
  const cal = app.__makeCalendar('sn@group.calendar.google.com', 'Sinh nhật 2627');
  cal.createAllDayEventSeries('Họp CLB', new Date(), null, {});
  const d = plain(app.saveBirthdaySettings(asBod(app), { days: 1, time: '07:00', calendarId: cal.id }));
  assert.deepEqual([d.synced.added, d.synced.removed, d.synced.kept, d.synced.left], [3, 0, 0, 0]);
  const binh = cal.series.find((s) => s.tags.eco_member === 'M1');
  assert.equal(binh.title, 'Sinh nhật Trần Thị Bình (PR)');
  assert.equal(binh.description, 'Lớp 11A1\nhttps://facebook.com/binh');
  assert.equal(binh.reminders, false, 'tắt nhắc của Calendar');
  assert.equal(binh.date.getDate(), dayOff(1).getDate());
  const term = app.readTable_('member_terms').find((r) => r.member_id === 'M1').term_id;
  app.updateRecord_('member_terms', { member_id: 'M1', term_id: term }, { dept_code: 'HR' });
  app.updateRecord_('member_terms', { member_id: 'M2', term_id: term }, { status: 'left' });
  const r = plain(app.syncBirthdaysNow(asBod(app))).synced;
  assert.deepEqual([r.added, r.removed, r.kept], [1, 2, 1]);
  assert.deepEqual(cal.series.map((s) => s.title).sort(), ['Họp CLB', 'Sinh nhật Nguyễn Văn An (BOD)', 'Sinh nhật Trần Thị Bình (HR)']);
  assert.ok(cal.series.find((s) => s.tags.eco_member === bod));
  assert.equal(plain(app.birthdayPage(asBod(app))).sync.added, 1);
});
