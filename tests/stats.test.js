const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./gas');
const plain = (x) => JSON.parse(JSON.stringify(x));

const app = loadApp(['schema.gs', 'records.gs', 'stats.gs']);
const d = (s) => { const [dd, mm, yy, hh = '0', mi = '0'] = s.split(/[/ :]/); return new Date(+yy, mm - 1, +dd, +hh, +mi); };
const TERM = { term_id: '2627', prep_start_at: d('05/09/2026'), phase1_start_at: d('01/10/2026'), phase2_start_at: d('15/02/2027') };

test('nhiệm kỳ đang chạy và giai đoạn', () => {
  assert.equal(app.currentTerm_([{ term_id: '2526' }, TERM]).term_id, '2627');
  assert.equal(app.currentTerm_([]), null);
  assert.equal(app.termLabel_('2627'), '2026-2027');
  assert.equal(app.phaseAt_(TERM, d('01/09/2026')), '');
  assert.equal(app.phaseAt_(TERM, d('20/09/2026')), 'prep');
  assert.equal(app.phaseAt_(TERM, d('01/10/2026')), 'phase_1');
  assert.equal(app.phaseAt_(TERM, d('01/03/2027')), 'phase_2');
  assert.equal(app.phaseAt_({ term_id: '2627', prep_start_at: d('05/09/2026') }, d('01/03/2027')), 'prep');
  assert.equal(app.phaseRange_(TERM, 'phase_1').to.getTime(), TERM.phase2_start_at.getTime());
  assert.equal(app.phaseRange_(TERM, 'phase_2').to, null);
  assert.equal(app.phaseRange_({ term_id: '2627' }, 'phase_1'), null);
});

test('thành viên chính thức và bổ sung', () => {
  assert.ok(app.isSupplementary_({ join_batch: 'D2', join_term_id: '2627' }, '2627'));
  assert.ok(!app.isSupplementary_({ join_batch: 'D2', join_term_id: '2526' }, '2627'));
  assert.ok(!app.isSupplementary_({ join_batch: 'D1', join_term_id: '2627' }, '2627'));
  assert.equal(app.kpiFrom_({ join_batch: 'OD', join_term_id: '2627' }, TERM), null);
  assert.equal(app.kpiFrom_({ join_batch: 'D2', join_term_id: '2627' }, TERM).getTime(), TERM.phase2_start_at.getTime());
  assert.equal(app.kpiFrom_({ join_batch: 'D2', join_term_id: '2627' }, { term_id: '2627' }), false);
});

test('đúng hạn, trễ hạn, không làm; bảng kết quả task', () => {
  const t = { deadline: d('05/11/2026 23:59') };
  const now = d('10/11/2026');
  assert.equal(app.taskTiming_(t, { confirmed_at: d('05/11/2026 22:10') }, now, 24), 'on_time');
  assert.equal(app.taskTiming_(t, { confirmed_at: d('06/11/2026 08:00') }, now, 24), 'late');
  assert.equal(app.taskTiming_(t, { confirmed_at: d('06/11/2026 08:00'), marked_on_time: true }, now, 24), 'on_time');
  assert.equal(app.taskTiming_(t, {}, d('06/11/2026 23:59'), 24), 'open');
  assert.equal(app.taskTiming_(t, {}, d('07/11/2026 00:00'), 24), 'not_done');
  const r = app.taskResult_;
  assert.deepEqual(['complete', 'needs_revision', 'poor'].map((q) => r('on_time', q)), ['pass', 'pass', 'fail']);
  assert.deepEqual(['complete', 'needs_revision', 'poor'].map((q) => r('late', q)), ['pass', 'fail', 'fail']);
  assert.equal(r('not_done', ''), 'fail');
  assert.equal(r('on_time', ''), 'waiting');
  assert.equal(r('open', ''), '');
});

test('trạng thái task để hiện', () => {
  const t = { deadline: d('05/11/2026 23:59') }, s = (now, a = {}, task = t) => app.taskStatus_(task, a, d(now), 2, 24);
  assert.equal(s('01/11/2026'), 'assigned');
  assert.equal(s('04/11/2026'), 'due_soon');
  assert.equal(s('06/11/2026 10:00'), 'late');
  assert.equal(s('07/11/2026 00:00'), 'not_done');
  assert.equal(s('07/11/2026', { confirmed_at: d('06/11/2026') }), 'done');
  assert.equal(s('01/11/2026', {}, { ...t, is_cancelled: true }), 'cancelled');
  assert.equal(s('01/11/2026', {}, {}), 'assigned');
});

test('KPI task: chỉ tính task được tính, chưa huỷ, đúng nhiệm kỳ; chưa chấm thì chưa tính', () => {
  const events = [{ event_id: 'SK1', term_id: '2627' }, { event_id: 'SK0', term_id: '2526' }];
  const mk = (id, extra = {}) => ({ task_id: id, event_id: 'SK1', deadline: d('05/11/2026 23:59'), created_at: d('01/11/2026'), is_counted: true, is_cancelled: false, ...extra });
  const tasks = [mk('T1'), mk('T2'), mk('T3'), mk('T4'), mk('T5', { is_cancelled: true }), mk('T6', { is_counted: false }), mk('T7', { event_id: 'SK0' }),
    mk('T8', { deadline: d('30/12/2026') }), mk('T9')];
  const A = (task_id, extra = {}) => ({ task_id, member_id: 'A', ...extra });
  const assignments = [
    A('T1', { confirmed_at: d('05/11/2026'), quality: 'complete' }),
    A('T2', { confirmed_at: d('06/11/2026'), quality: 'needs_revision' }),
    A('T3'),
    A('T4', { confirmed_at: d('05/11/2026') }),
    A('T5'), A('T6'), A('T7'), A('T8'),
    { task_id: 'T9', member_id: 'B', confirmed_at: d('05/11/2026'), quality: 'complete' }
  ];
  const { list, ...k } = plain(app.kpiTask_('A', { tasks, assignments, events, termId: '2627', from: null, now: d('10/11/2026'), notDoneHours: 24, threshold: 80 }));
  // cần thêm 7 task đạt: (1 + 7) ÷ (3 + 7) = 80%
  assert.deepEqual(k, { assigned: 5, pass: 1, fail: 2, waiting: 1, open: 1, percent: 33, needed: 7 });
  assert.deepEqual(list.map((t) => [t.taskId, t.result]), [['T1', 'pass'], ['T2', 'fail'], ['T3', 'fail'], ['T4', 'waiting'], ['T8', 'open']]);
  const nov = app.kpiTask_('A', { tasks, assignments, events, termId: '2627', from: null, range: { from: d('01/11/2026'), to: d('01/12/2026') },
    now: d('10/11/2026'), notDoneHours: 24 });
  assert.equal(nov.assigned, 4);
  const sup = app.kpiTask_('A', { tasks, assignments, events, termId: '2627', from: d('02/11/2026'), now: d('10/11/2026'), notDoneHours: 24 });
  assert.equal(sup.assigned, 0);
  assert.equal(app.kpiTask_('A', { tasks, assignments, events, termId: '2627', from: false, now: d('10/11/2026'), notDoneHours: 24 }).assigned, 0);
});

test('chỉ tiêu log: riêng người, rồi khối, rồi ban', () => {
  const q = [
    { event_id: 'SK1', scope_type: 'dept', scope_value: 'AD', initial_sessions: 4 },
    { event_id: 'SK1', scope_type: 'dept', scope_value: 'PR', initial_sessions: 2 },
    { event_id: 'SK1', scope_type: 'grade', scope_value: '12', initial_sessions: 1 },
    { event_id: 'SK1', scope_type: 'member', scope_value: 'A', initial_sessions: 3 }
  ];
  assert.equal(app.gradeOf_('10A1'), '10');
  assert.equal(app.gradeOf_(''), '');
  assert.equal(app.initialQuota_(q, 'SK1', 'A', { dept_code: 'PR', class_name: '12A1' }), 3);
  assert.equal(app.initialQuota_(q, 'SK1', 'B', { dept_code: 'PR', class_name: '12A1' }), 1);
  assert.equal(app.initialQuota_(q, 'SK1', 'B', { dept_code: 'AD', class_name: '10A1' }), 4);
  assert.equal(app.initialQuota_(q, 'SK1', 'B', { dept_code: 'HR', class_name: '10A1' }), 0);
  assert.equal(app.initialQuota_(q, 'SK2', 'A', { dept_code: 'PR' }), 0);
  assert.equal(app.sessionUnits_(180), 2);
  assert.equal(app.sessionUnits_(90), 1);
});

test('KPI log: sự kiện đã chốt lấy số lúc chốt, sự kiện đang mở tạm tính; dự báo cần thêm mấy buổi', () => {
  const events = [
    { event_id: 'SK1', term_id: '2627', planned_date: d('01/11/2026') },
    { event_id: 'SK2', term_id: '2627', planned_date: d('01/12/2026') },
    { event_id: 'SK3', term_id: '2627', planned_date: d('20/09/2026') },
    { event_id: 'SK4', term_id: '2526', planned_date: d('01/11/2025') }
  ];
  const sessions = [
    { session_id: 'B1', event_id: 'SK1', duration_min: 90, is_counted: true },
    { session_id: 'B2', event_id: 'SK2', duration_min: 180, is_counted: true },
    { session_id: 'B3', event_id: 'SK2', duration_min: 90, is_counted: true },
    { session_id: 'B4', event_id: 'SK3', duration_min: 90, is_counted: false },
    { session_id: 'B5', event_id: 'SK4', duration_min: 90, is_counted: true }
  ];
  const c = {
    events, sessions,
    closings: [{ event_id: 'SK1', status: 'closed' }],
    results: [{ event_id: 'SK1', member_id: 'A', initial_quota: 2, final_quota: 1.17, attended: 1 }],
    quotas: [{ event_id: 'SK2', scope_type: 'dept', scope_value: 'PR', initial_sessions: 4 }, { event_id: 'SK3', scope_type: 'dept', scope_value: 'PR', initial_sessions: 2 },
      { event_id: 'SK4', scope_type: 'dept', scope_value: 'PR', initial_sessions: 2 }],
    attendance: [{ session_id: 'B2', member_id: 'A' }, { session_id: 'B4', member_id: 'A' }, { session_id: 'B3', member_id: 'B' }],
    termId: '2627', from: null, threshold: 80
  };
  const { list, ...k } = plain(app.kpiLog_('A', { dept_code: 'PR' }, c));
  assert.deepEqual(list, [{ eventId: 'SK1', name: undefined, quota: 1.17, attended: 1, closed: true }, { eventId: 'SK2', name: undefined, quota: 4, attended: 2, closed: false }].map(plain));
  // SK1 đã chốt: 1 / 1,17; SK2 đang mở: 2 (buổi 180 phút) / 4; SK3 tạo trong giao thoa, SK4 nhiệm kỳ khác: bỏ
  assert.deepEqual(k, { quota: 5.17, attended: 3, percent: 58, needed: 2, events: 2 });
  const sup = app.kpiLog_('A', { dept_code: 'PR' }, { ...c, from: d('15/11/2026') });
  assert.deepEqual([sup.quota, sup.attended, sup.events], [4, 2, 1]);
  // chỉ tính sự kiện có ngày trong khoảng: SK1 chưa có lúc chốt nên lấy ngày dự kiến 01/11
  const dec = app.kpiLog_('A', { dept_code: 'PR' }, { ...c, range: { from: d('15/11/2026'), to: null } });
  assert.deepEqual([dec.quota, dec.attended], [4, 2]);
  const late = app.kpiLog_('A', { dept_code: 'PR' }, { ...c, closings: [{ event_id: 'SK1', status: 'closed', closed_at: d('20/11/2026') }], range: { from: d('15/11/2026'), to: null } });
  assert.deepEqual([late.quota, late.attended], [5.17, 3]);
  const { list: l0, ...none } = plain(app.kpiLog_('C', { dept_code: 'HR' }, c));
  assert.deepEqual(none, { quota: 0, attended: 0, percent: null, needed: 0, events: 0 });
});

test('điểm theo giai đoạn và xếp hạng: bằng điểm thì cùng hạng, GD1 không xếp người bổ sung, BOD không có tên', () => {
  const entries = [
    { member_id: 'A', points: 40, awarded_at: d('10/10/2026') },
    { member_id: 'A', points: 5, awarded_at: d('20/02/2027') },
    { member_id: 'B', points: 40, awarded_at: d('11/10/2026') },
    { member_id: 'B', points: 50, awarded_at: d('12/10/2026'), is_cancelled: true },
    { member_id: 'C', points: 20, awarded_at: d('13/10/2026') },
    { member_id: 'A', points: 99, awarded_at: d('20/09/2026') }
  ];
  const p1 = plain(app.pointsBetween_(entries, TERM.phase1_start_at, TERM.phase2_start_at));
  assert.deepEqual(p1, { A: 40, B: 40, C: 20 });
  const members = [{ member_id: 'A', join_batch: 'OD', join_term_id: '2627' }, { member_id: 'B', join_batch: 'D1', join_term_id: '2627' },
    { member_id: 'C', join_batch: 'CU', join_term_id: '2526' }, { member_id: 'D', join_batch: 'D2', join_term_id: '2627' },
    { member_id: 'E', join_batch: 'OD', join_term_id: '2627' }, { member_id: 'F', join_batch: 'OD', join_term_id: '2627' }];
  const mt = [['A', 'PR'], ['B', 'AD'], ['C', 'HR'], ['D', 'PG'], ['E', 'BOD'], ['F', 'PR', 'left']]
    .map(([member_id, dept_code, status = 'active']) => ({ member_id, dept_code, status, term_id: '2627' }));
  assert.deepEqual(plain(app.rankedMembers_(members, mt, '2627', 'phase_1')), ['A', 'B', 'C']);
  assert.deepEqual(plain(app.rankedMembers_(members, mt, '2627', 'phase_2')), ['A', 'B', 'C', 'D']);
  const list = plain(app.rankList_(['C', 'A', 'B', 'D'], p1));
  assert.deepEqual(list.map((x) => [x.memberId, x.points, x.rank]), [['A', 40, 1], ['B', 40, 1], ['C', 20, 3], ['D', 0, 4]]);
});

test('phần trăm làm tròn thông thường', () => {
  assert.equal(app.percent_(1, 8), 13);
  assert.equal(app.percent_(1, 3), 33);
  assert.equal(app.percent_(1, 0), null);
  assert.equal(app.percent_(5, 200), 3);
});

test('top 15%: làm tròn thông thường, bằng điểm người cuối cũng vào, 0 điểm không vào', () => {
  assert.equal(app.topCount_(70, 15), 11);
  assert.equal(app.topCount_(10, 15), 2);
  const list = app.rankList_(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], { A: 50, B: 40, C: 40, D: 30 });
  assert.deepEqual(Object.keys(app.topIds_(list, 15)).sort(), ['A', 'B', 'C']);
  assert.deepEqual(Object.keys(app.topIds_(app.rankList_(['A', 'B'], {}), 50)), []);
  assert.deepEqual(Object.keys(app.topIds_([], 15)), []);
});

test('certificate: đạt KPI, bù trừ, chưa cấp; phần không có việc coi như đạt', () => {
  const r = { threshold: 80, offsetThreshold: 60 };
  assert.equal(app.certificateOf_(80, 90, false, r), 'cert_kpi');
  assert.equal(app.certificateOf_(null, 85, false, r), 'cert_kpi');
  assert.equal(app.certificateOf_(70, 90, true, r), 'cert_offset');
  assert.equal(app.certificateOf_(70, 90, false, r), 'none');
  assert.equal(app.certificateOf_(59, 90, true, r), 'none');
  assert.equal(app.needsOffset_(70, null, r), true);
  assert.equal(app.needsOffset_(90, 90, r), false);
  assert.equal(app.tasksNeeded_(3, 1, 80), 1);
  assert.equal(app.tasksNeeded_(4, 0, 80), 0);
});

test('khoá sau tổng kết: GD1 đã chụp thì khoá tới lúc bắt đầu GD2; GD2 khoá tới lúc nhiệm kỳ sau bắt đầu', () => {
  const terms = [
    { term_id: '2627', prep_start_at: d('01/08/2026'), phase1_start_at: d('01/09/2026'), phase2_start_at: d('01/01/2027') },
    { term_id: '2728', prep_start_at: d('01/06/2027') }
  ];
  let ranges = app.lockedRanges_(terms, [{ term_id: '2627', phase: 'phase_1' }]);
  assert.equal(app.lockedAt_(ranges, d('15/12/2026')).phase, 'phase_1');
  assert.equal(app.lockedAt_(ranges, d('15/01/2027')), null);
  assert.equal(app.lockedAt_(ranges, null), null);
  ranges = app.lockedRanges_(terms, [{ term_id: '2627', phase: 'phase_1' }, { term_id: '2627', phase: 'phase_2' }, { term_id: '2627', phase: 'full_term' }]);
  assert.equal(app.lockedAt_(ranges, d('15/05/2027')).phase, 'phase_2');
  assert.equal(app.lockedAt_(ranges, d('15/06/2027')), null);
});
