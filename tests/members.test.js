const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const DAY = 864e5;
const ago = (ms) => new Date(Date.now() - ms);

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');

test('KPI của tôi: KPI task, KPI log kèm từng task, từng sự kiện; BOD không tính KPI', () => {
  const { app } = setUp();
  const d = plain(app.myKpi(asBinh(app)));
  assert.equal(d.counting, true);
  assert.equal(d.supplementary, false);
  // Chụp ảnh đạt; Báo cáo quỹ quá hạn 3 giờ nên chưa tính; Dựng video chờ chấm
  assert.deepEqual([d.task.pass, d.task.fail, d.task.waiting, d.task.percent], [1, 0, 1, 100]);
  assert.equal(d.task.list.length, 5);
  assert.equal(d.task.list.find((t) => t.name === 'Chụp ảnh').event, 'Ngày hội Xanh');
  assert.deepEqual([d.log.quota, d.log.attended, d.log.needed], [4, 2, 2]);
  assert.deepEqual(d.log.list.map((e) => [e.name, e.quota, e.attended, e.closed]), [['Ngày hội Xanh', 4, 2, false]]);
  const bod = plain(app.myKpi(asBod(app)));
  assert.deepEqual([bod.bod, bod.counting], [true, false]);
});

test('Điểm và xếp hạng: bảng của giai đoạn đang chạy, lịch sử điểm của chính mình', () => {
  const { app } = setUp();
  const d = plain(app.myRanking(asBinh(app)));
  assert.equal(d.phase, 'phase_1');
  assert.deepEqual(d.phases.map((p) => p.id), ['phase_1']);
  assert.deepEqual(d.list.map((x) => [x.id, x.points, x.rank, x.me]), [['M2', 50, 1, false], ['M1', 40, 2, true]]);
  assert.deepEqual(d.me, { points: 40, rank: 2, of: 2, top: false });
  // dòng 99 điểm cộng trước GD1 không tính
  assert.deepEqual(d.history.map((h) => h.points), [40]);
  const bod = plain(app.myRanking(asBod(app)));
  assert.equal(bod.me, null);
  assert.deepEqual(bod.history, []);
});

test('trang Thành viên: chỉ BOD; mỗi người một dòng, có số liệu theo từng sự kiện để lọc', () => {
  const { app } = setUp();
  assert.throws(() => app.membersPage(asBinh(app)), /Chỉ BOD/);
  const d = plain(app.membersPage(asBod(app)));
  assert.deepEqual(d.people.map((p) => p.id).sort(), ['M1', 'M2']);
  const m1 = d.people.find((p) => p.id === 'M1');
  assert.deepEqual([m1.dept, m1.grade, m1.points.phase_1, m1.ranks.phase_1.rank, m1.task.percent, m1.log.attended], ['PR', '11', 40, 2, 100, 2]);
  const ev = d.events[0].id;
  assert.deepEqual(m1.byEvent[ev], [1, 0, 1, 4, 2]);
  assert.deepEqual(d.depts, ['PR', 'AD']);
  assert.deepEqual(d.rounds, { round_1: null, round_2: null });
  const x = plain(app.memberDetail(asBod(app), 'M1'));
  assert.equal(x.name, 'Trần Thị Bình');
  assert.deepEqual(x.history.map((h) => [h.points, h.phase]), [[40, 'phase_1']]);
  assert.throws(() => app.memberDetail(asBod(app), 'M9'), /Không tìm thấy/);
});

/** Sang GD2 hai ngày trước, thêm Dung (bổ sung, vào đợt 2), chụp đợt tổng kết 1. */
function toPhase2(app, term, bod) {
  app.updateRecord_('terms', term, { phase2_start_at: ago(2 * DAY) });
  app.insertRecords_('members', [{ member_id: 'M3', full_name: 'Phạm Dung', email: 'dung@gmail.com', join_batch: 'D2', join_term_id: term,
    birth_date: new Date(2009, 2, 5), phone: '912345678' }]);
  app.insertRecords_('member_terms', [{ member_id: 'M3', term_id: term, dept_code: 'PR', class_name: '10A1', position: 'Thành viên', status: 'active' }]);
  app.insertRecords_('accounts', [{ member_id: 'M3', theme: 'system' }]);
  app.updateRecord_('members', 'M1', { birth_date: new Date(2008, 10, 20), phone: '0987654321' });
  app.insertRecords_('point_entries', [{ member_id: 'M3', activity_id: 'HD-0001', points: 30, awarded_at: ago(DAY), awarded_by: bod, source: 'manual' }], { termId: term });
  return app.withLock_(() => app.snapshotRound_('round_1'));
}

test('tổng kết đợt 1: chụp dòng GD1 của thành viên chính thức, rồi khoá sửa đổi thuộc GD1', () => {
  const { app, bod, term, ids } = setUp();
  assert.equal(toPhase2(app, term, bod), 2);
  const rows = app.readTable_('phase_results');
  assert.deepEqual(plain(rows.map((r) => [r.member_id, r.phase, r.summary_round, r.total_points, r.rank, r.kpi_task, r.certificate])),
    [['M2', 'phase_1', 'round_1', 50, 1, '', ''], ['M1', 'phase_1', 'round_1', 40, 2, 100, '']]);
  const tok = asBod(app);
  const entry = app.readTable_('point_entries').find((e) => e.member_id === 'M1' && e.points === 40).entry_id;
  assert.throws(() => app.cancelPoints(tok, [entry]), /GD1 của nhiệm kỳ .* đã tổng kết nên không huỷ điểm đã cộng được nữa/);
  assert.throws(() => app.gradeTask(tok, ids.waiting, 'M1', 'complete'), /đã tổng kết/);
  assert.throws(() => app.setTaskDeadline(tok, ids.graded, Date.now()), /đã tổng kết/);
  // task hạn ở GD2 vẫn sửa được
  app.setTaskDeadline(tok, ids.later, Date.now() + 5 * DAY);
  // chụp lại thì ghi đè, không nhân đôi
  app.withLock_(() => app.snapshotRound_('round_1'));
  assert.equal(app.readTable_('phase_results').length, 2);
  // GD2: Dung có tên, xem lại được bảng GD1
  const r = plain(app.myRanking(login(app, 'dung@gmail.com', 'chungCLB')));
  assert.equal(r.phase, 'phase_2');
  assert.deepEqual(r.list.map((x) => [x.id, x.points]), [['M3', 30], ['M1', 0], ['M2', 0]]);
  const r1 = plain(app.myRanking(login(app, 'dung@gmail.com', 'chungCLB'), 'phase_1'));
  assert.match(r1.notRanked, /GD1 chỉ xếp hạng thành viên chính thức/);
  assert.deepEqual(plain(app.membersPage(tok).rounds).round_2, null);
});

test('tổng kết đợt 2: dòng GD2 của mọi người, dòng Cả nhiệm kỳ của thành viên chính thức, certificate và nút copy', () => {
  const { app, bod, term } = setUp();
  toPhase2(app, term, bod);
  const tok = asBod(app);
  app.setSetting_('top_reward_percent', '50', bod);
  // trước khi chụp: tạm tính
  let v = plain(app.summaryView(tok));
  assert.deepEqual(v.live, { phase_2: true, full_term: true, certificates: true });
  // GD1 lấy từ lần chụp đợt 1 (lúc đó top 15% của 2 người là 0 người), không đổi theo cài đặt mới
  assert.deepEqual(v.rewards.phase_1, []);
  assert.deepEqual(v.rewards.full_term.map((p) => p.id), ['M2']);
  app.withLock_(() => app.snapshotRound_('round_2'));
  const rows = plain(app.readTable_('phase_results').filter((r) => r.summary_round === 'round_2'));
  assert.deepEqual(rows.map((r) => [r.member_id, r.phase, r.total_points, r.rank, r.certificate]), [
    ['M3', 'phase_2', 30, 1, 'cert_kpi'], ['M1', 'phase_2', 0, 2, ''], ['M2', 'phase_2', 0, 2, ''],
    ['M2', 'full_term', 50, 1, 'cert_kpi'], ['M1', 'full_term', 40, 2, 'none']
  ]);
  v = plain(app.summaryView(tok));
  assert.equal(v.term.current, true);
  assert.deepEqual(v.live, {});
  assert.deepEqual(v.rewards.full_term.map((p) => [p.id, p.points]), [['M2', 50]]);
  // top 50% của 3 người là 2 người, nhưng người 0 điểm không vào top
  assert.deepEqual(v.rewards.phase_2.map((p) => p.id), ['M3']);
  const dung = v.certificates.find((p) => p.id === 'M3');
  assert.deepEqual([dung.certificate, dung.birth, dung.phone, dung.supplementary], ['cert_kpi', '05/03/2009', '0912345678', true]);
  // Bình: log 2/4 = 50% dưới mức bù trừ nên chưa cấp, không có ngày sinh, SĐT
  const binh = v.certificates.find((p) => p.id === 'M1');
  assert.deepEqual([binh.certificate, binh.log, binh.birth], ['none', 50, undefined]);
  assert.throws(() => app.summaryView(asBinh(app)), /Chỉ BOD/);
});

test('ngày sinh và SĐT để dán sang sheet Đoàn', () => {
  const { app } = setUp();
  assert.equal(app.birthText_(new Date(2009, 0, 7)), '07/01/2009');
  assert.equal(app.birthText_(''), '');
  assert.equal(app.phoneText_(912345678), '0912345678');
  assert.equal(app.phoneText_('0912 345 678'), '0912345678');
  assert.equal(app.phoneText_(''), '');
});
