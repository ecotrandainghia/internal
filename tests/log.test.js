const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const DAY = 864e5;

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');

/** Sự kiện mới không có task, ba buổi 90, 180, 90 phút. */
function withEvent(app, tok) {
  const plan = plain(app.saveEvent(tok, { name: 'Oday', plannedDate: Date.now() + 3 * DAY, description: 'Ngày hội tân thành viên' }));
  const ev = plan.events.find((e) => e.name === 'Oday').id;
  app.saveSession(tok, { eventId: ev, name: 'Buổi 1', duration: 90 });
  app.saveSession(tok, { eventId: ev, name: 'Buổi 2', duration: 180 });
  const d = plain(app.saveSession(tok, { eventId: ev, name: 'Buổi 3', duration: 90 }));
  return { ev, s: d.event.sessions.map((x) => x.id) };
}

test('Kế hoạch năm: tạo, sửa sự kiện; chỉ BOD', () => {
  const { app } = setUp();
  const tok = asBod(app);
  assert.throws(() => app.eventPlan(login(app, 'binh@gmail.com', 'chungCLB')), /Chỉ BOD/);
  assert.throws(() => app.saveEvent(tok, { name: 'X' }), /ngày bắt đầu/);
  let d = plain(app.saveEvent(tok, { name: ' Oday ', plannedDate: Date.now() + DAY }));
  const oday = d.events.find((e) => e.name === 'Oday');
  assert.equal(oday.closed, false);
  d = plain(app.saveEvent(tok, { eventId: oday.id, name: 'Oday 2026', plannedDate: Date.now() + DAY, description: 'Sân trường' }));
  assert.deepEqual(d.events.map((e) => e.name), ['Ngày hội Xanh', 'Oday 2026']);
  assert.equal(app.findRecord_('events', oday.id).description, 'Sân trường');
});

test('buổi log: tạo, trùng tên, thời lượng, xoá buổi chưa điểm danh', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const { ev, s } = withEvent(app, tok);
  assert.throws(() => app.saveSession(tok, { eventId: ev, name: 'buổi 1', duration: 90 }), /đã có buổi tên/);
  assert.throws(() => app.saveSession(tok, { eventId: ev, name: 'Buổi 4', duration: 120 }), /90 hoặc 180/);
  let d = plain(app.logBoard(tok, ev));
  assert.deepEqual(d.event.sessions.map((x) => [x.name, x.units, x.outcome, x.counted]), [['Buổi 1', 1, 'pending', true], ['Buổi 2', 2, 'pending', true], ['Buổi 3', 1, 'pending', true]]);
  assert.deepEqual(d.event.summary, { planned: 4, actual: 0, held: 0, cancelled: 0, pending: 3 });
  d = plain(app.saveSession(tok, { sessionId: s[2], name: 'Buổi 3 (dọn dẹp)', duration: 180 }));
  assert.equal(d.event.sessions[2].units, 2);
  d = plain(app.deleteSession(tok, s[2]));
  assert.equal(d.event.sessions.length, 2);
  app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: ['M1'] });
  assert.throws(() => app.deleteSession(tok, s[0]), /không xoá được/);
});

test('chỉ tiêu: riêng từng người thắng khối, khối thắng ban', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const { ev } = withEvent(app, tok);
  assert.throws(() => app.saveQuotas(tok, ev, [{ type: 'dept', value: 'PR', sessions: 0.3 }]), /buổi 90 phút/);
  let d = plain(app.saveQuotas(tok, ev, [{ type: 'dept', value: 'PR', sessions: 4 }, { type: 'dept', value: 'AD', sessions: 1 },
    { type: 'grade', value: '11', sessions: 2 }, { type: 'member', value: 'M1', sessions: 3 }]));
  assert.deepEqual(d.event.members.map((m) => [m.id, m.quota]), [['M2', 2], ['M1', 3]]);
  d = plain(app.saveQuotas(tok, ev, [{ type: 'dept', value: 'PR', sessions: 4 }, { type: 'member', value: 'M1', sessions: '' }]));
  assert.deepEqual(d.event.quotas, [{ type: 'dept', value: 'PR', sessions: 4 }]);
  assert.deepEqual(d.event.members.map((m) => [m.id, m.quota]), [['M2', 0], ['M1', 4]]);
});

test('điểm danh: có mặt, huỷ lý do khác, huỷ hết việc; sửa lại được và ghi Nhật ký', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const { ev, s } = withEvent(app, tok);
  assert.throws(() => app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: [] }), /ít nhất một người/);
  assert.throws(() => app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: ['M9'] }), /không còn ở CLB/);
  app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: ['M1', 'M2'] });
  let d = plain(app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: ['M1'] }));
  assert.deepEqual(d.event.sessions[0].attendees, ['M1']);
  d = plain(app.saveAttendance(tok, s[1], { outcome: 'other_reason', memberIds: ['M1'] }));
  assert.equal(d.event.sessions[1].outcome, 'other_reason');
  assert.equal(app.findRecord_('attendance', { session_id: s[1], member_id: 'M1' }).counted_as, 'registered_cancelled');
  d = plain(app.saveAttendance(tok, s[2], { outcome: 'no_work', memberIds: ['M1'] }));
  assert.deepEqual([d.event.sessions[2].outcome, d.event.sessions[2].attendees], ['no_work', []]);
  assert.deepEqual(d.event.summary, { planned: 4, actual: 3, held: 1, cancelled: 2, pending: 0 });
  assert.equal(d.event.members.find((m) => m.id === 'M1').attended, 3);
  const log = app.readTable_('audit_log').filter((r) => r.action === 'mark_attendance');
  assert.ok(log.some((r) => r.row_id === s[0] + ' / M2' && r.column_name === 'member_id' && r.new_value === ''));
});

test('chốt: giao cuối theo số buổi thực diễn ra, cộng điểm log vượt; mở chốt huỷ điểm, chốt lại tính lại', () => {
  const { app, bod } = setUp();
  const tok = asBod(app);
  const { ev, s } = withEvent(app, tok);
  app.saveQuotas(tok, ev, [{ type: 'dept', value: 'PR', sessions: 3 }, { type: 'dept', value: 'AD', sessions: 2 }]);
  app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: ['M1', 'M2'] });
  app.saveAttendance(tok, s[1], { outcome: 'other_reason', memberIds: ['M1'] });
  assert.throws(() => app.closeEvent(tok, ev), /Buổi “Buổi 3” chưa điểm danh/);
  app.saveAttendance(tok, s[2], { outcome: 'no_work' });
  let d = plain(app.closeEvent(tok, ev));
  assert.equal(d.event.closed, true);
  // dự kiến 4, thực diễn ra 3. Bình: giao 3 → cuối 2,25, đi 3 → vượt 1. Chi: giao 2 → cuối 1,5, đi 1 → không vượt.
  assert.deepEqual(d.event.results.map((r) => [r.id, r.initial, r.final, r.attended, r.extra]), [['M2', 2, 1.5, 1, 0], ['M1', 3, 2.25, 3, 1]]);
  const closing = app.findRecord_('event_closings', ev);
  assert.deepEqual([closing.status, closing.planned_sessions, closing.actual_sessions, closing.closed_by], ['closed', 4, 3, bod]);
  let extra = app.readTable_('point_entries').filter((e) => e.source === 'log_extra');
  assert.deepEqual(plain(extra.map((e) => [e.member_id, e.points, e.source_id, e.is_cancelled])), [['M1', 20, ev, false]]);
  assert.throws(() => app.saveSession(tok, { eventId: ev, name: 'Buổi 4', duration: 90 }), /đã chốt/);
  assert.throws(() => app.saveAttendance(tok, s[0], { outcome: 'held', memberIds: ['M1'] }), /đã chốt/);
  // KPI log của Bình dùng con số lúc chốt
  const home = plain(app.homeData(login(app, 'binh@gmail.com', 'chungCLB')));
  assert.ok(home.member.kpiLog.quota >= 2.25);
  d = plain(app.reopenEvent(tok, ev));
  assert.equal(d.event.closed, false);
  assert.equal(app.readTable_('point_entries').find((e) => e.source === 'log_extra').is_cancelled, true);
  app.saveAttendance(tok, s[2], { outcome: 'held', memberIds: ['M1'] });
  d = plain(app.closeEvent(tok, ev));
  // giờ thực diễn ra 4: Bình cuối 3, đi 4 → vượt 1; Chi cuối 2, đi 1
  assert.deepEqual(d.event.results.map((r) => [r.id, r.final, r.attended, r.extra]), [['M2', 2, 1, 0], ['M1', 3, 4, 1]]);
  extra = app.readTable_('point_entries').filter((e) => e.source === 'log_extra' && !e.is_cancelled);
  assert.equal(extra.length, 1);
  const actions = app.readTable_('audit_log').filter((r) => r.column_name === 'status').map((r) => r.action);
  assert.equal(actions.filter((a) => a === 'close_event').length, 2);
  assert.equal(actions.filter((a) => a === 'reopen_event').length, 1);
});

test('chưa chốt được khi task của sự kiện chưa có kết quả', () => {
  const { app } = setUp();
  const tok = asBod(app);
  const ev = app.readTable_('events')[0].event_id;
  const s = app.readTable_('log_sessions')[0].session_id;
  app.saveAttendance(tok, s, { outcome: 'held', memberIds: ['M1'] });
  assert.throws(() => app.closeEvent(tok, ev), /Task “Dựng video” còn 1 người chưa có kết quả/);
});

test('logResults_: buổi 180 phút tính 2, người không có chỉ tiêu đi log thì vượt hết', () => {
  const { app } = setUp();
  const sessions = [{ session_id: 'a', event_id: 'E', duration_min: 180, is_counted: true },
    { session_id: 'b', event_id: 'E', duration_min: 90, is_counted: true, cancelled_no_work: true },
    { session_id: 'c', event_id: 'E', duration_min: 90, is_counted: false }];
  const r = plain(app.logResults_('E', sessions, [{ session_id: 'a', member_id: 'P' }, { session_id: 'a', member_id: 'Q' }, { session_id: 'c', member_id: 'Q' }],
    [{ event_id: 'E', scope_type: 'dept', scope_value: 'PR', initial_sessions: 3 }],
    { P: { dept_code: 'PR', class_name: '10A1' }, Q: { dept_code: 'AD', class_name: '11A1' }, R: { dept_code: 'PR', class_name: '12A1' } }));
  assert.deepEqual([r.planned, r.actual], [3, 2]);
  assert.deepEqual(r.rows.map((x) => [x.member_id, x.final_quota, x.attended, x.extra_sessions]), [['P', 2, 2, 0], ['R', 2, 0, 0], ['Q', 0, 2, 2]]);
});
