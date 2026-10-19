/**
 * Các con số app tính lại mỗi lần mở, không lưu vào sheet: giai đoạn, trạng thái task, KPI task, KPI log, điểm và hạng.
 * Theo quy chế và doc "Sheet dữ liệu app ECO". Chỉ dùng dữ liệu truyền vào, không gọi gì của Google, nên chạy thử được bằng Node.
 */

var HOUR_MS = 36e5;
var DAY_MS = 864e5;

/* ===================== Nhiệm kỳ và giai đoạn ===================== */

/** Nhiệm kỳ đang chạy: dòng có mã lớn nhất trong tab Nhiệm kỳ (nhiệm kỳ mới mở ngay khi BOD bấm Kết thúc nhiệm kỳ cũ). */
function currentTerm_(terms) {
  var best = null;
  terms.forEach(function (t) { if (t.term_id && (!best || String(t.term_id) > String(best.term_id))) best = t; });
  return best;
}

/** 2627 → 2026-2027. */
function termLabel_(termId) {
  var s = String(termId || '');
  return /^\d{4}$/.test(s) ? '20' + s.slice(0, 2) + '-20' + s.slice(2) : s;
}

/** Giai đoạn của một lúc trong nhiệm kỳ: 'prep' (giao thoa), 'phase_1', 'phase_2', hoặc '' nếu trước nhiệm kỳ. */
function phaseAt_(term, d) {
  if (!term || !d) return '';
  var ms = d.getTime();
  if (term.phase2_start_at && ms >= term.phase2_start_at.getTime()) return 'phase_2';
  if (term.phase1_start_at && ms >= term.phase1_start_at.getTime()) return 'phase_1';
  if (term.prep_start_at && ms >= term.prep_start_at.getTime()) return 'prep';
  return '';
}

/** Khoảng thời gian của GD1 hoặc GD2: { from, to } (to = null là chưa kết thúc). null nếu giai đoạn chưa bắt đầu. */
function phaseRange_(term, phase) {
  if (!term) return null;
  if (phase === 'phase_1') return term.phase1_start_at ? { from: term.phase1_start_at, to: term.phase2_start_at || null } : null;
  if (phase === 'phase_2') return term.phase2_start_at ? { from: term.phase2_start_at, to: null } : null;
  return null;
}

/** Thành viên bổ sung: vào CLB ở đợt tuyển 2 của chính nhiệm kỳ này. Còn lại (các năm trước, Oday, đợt 1) là chính thức. */
function isSupplementary_(member, termId) {
  return member.join_batch === 'D2' && String(member.join_term_id) === String(termId);
}

/**
 * Từ lúc nào thì việc được giao tính vào KPI của một người: chính thức tính cả nhiệm kỳ (null),
 * bổ sung chỉ tính từ lúc bắt đầu GD2. Chưa có GD2 thì bổ sung chưa có gì để tính (trả về false).
 */
function kpiFrom_(member, term) {
  if (!isSupplementary_(member, term.term_id)) return null;
  return term.phase2_start_at || false;
}

/* ===================== Task ===================== */

/**
 * Đúng hạn hay trễ hạn tính theo lúc bấm xác nhận (hoặc nút "Nộp đúng hạn" của NS, BOD). Chưa xác nhận mà quá hạn
 * hơn notDoneHours giờ thì là Không làm. Còn lại là 'open': chưa biết kết quả.
 */
function taskTiming_(task, a, now, notDoneHours) {
  if (a.confirmed_at) {
    if (a.marked_on_time || !task.deadline) return 'on_time';
    return a.confirmed_at.getTime() <= task.deadline.getTime() ? 'on_time' : 'late';
  }
  if (task.deadline && now.getTime() > task.deadline.getTime() + notDoneHours * HOUR_MS) return 'not_done';
  return 'open';
}

/** Bảng kết quả task trong quy chế: đúng hạn × chất lượng. Không làm thì luôn Chưa đạt. */
var TASK_RESULTS = {
  on_time: { complete: 'pass', needs_revision: 'pass', poor: 'fail' },
  late: { complete: 'pass', needs_revision: 'fail', poor: 'fail' }
};

/** 'pass' (Đạt), 'fail' (Chưa đạt), 'waiting' (đã xong, chờ BOD chấm) hoặc '' (chưa xong, chưa tới hạn). */
function taskResult_(timing, quality) {
  if (timing === 'not_done') return 'fail';
  if (timing === 'open') return '';
  if (!quality) return 'waiting';
  return (TASK_RESULTS[timing] || {})[quality] || 'fail';
}

/** Trạng thái để hiện: cancelled, done (đã xác nhận), not_done, late, due_soon, assigned. */
function taskStatus_(task, a, now, dueSoonDays, notDoneHours) {
  if (task.is_cancelled) return 'cancelled';
  if (a.confirmed_at) return 'done';
  if (!task.deadline) return 'assigned';
  var left = task.deadline.getTime() - now.getTime();
  if (left < -notDoneHours * HOUR_MS) return 'not_done';
  if (left < 0) return 'late';
  if (left <= dueSoonDays * DAY_MS) return 'due_soon';
  return 'assigned';
}

/** Mã sự kiện → nhiệm kỳ. */
function eventTerms_(events) {
  var m = {};
  events.forEach(function (e) { m[e.event_id] = String(e.term_id); });
  return m;
}

/** Ngày của task để biết task thuộc giai đoạn nào: hạn chót, chưa có hạn thì lúc tạo. */
function taskDate_(t) {
  return t.deadline || t.created_at || null;
}

/** Ngày của sự kiện để biết thuộc giai đoạn nào: lúc chốt (mốc kết thúc của sự kiện), chưa chốt thì ngày dự kiến. */
function eventDate_(e, closing) {
  return closing && closing.status === 'closed' && closing.closed_at ? closing.closed_at : e.planned_date || null;
}

/** Ngày d có nằm trong khoảng { from, to } không (to = null là chưa kết thúc). Không có khoảng thì luôn đúng. */
function inRange_(d, range) {
  if (!range) return true;
  if (!d) return false;
  var ms = d.getTime();
  return ms >= range.from.getTime() && (!range.to || ms < range.to.getTime());
}

/**
 * KPI task của một người trong nhiệm kỳ. Chỉ tính task được tính (không tạo trong giao thoa), chưa huỷ, của sự kiện trong
 * nhiệm kỳ; người bổ sung chỉ tính task tạo từ lúc bắt đầu GD2. Phần trăm = Đạt ÷ (Đạt + Chưa đạt): task chưa xong hoặc
 * chưa chấm chưa tính, để KPI không tụt oan. needed: số task đạt cần thêm để lên ngưỡng (nếu các task còn lại đều đạt).
 * c: { tasks, assignments, events, termId, from, range (chỉ tính task có hạn trong khoảng này), now, notDoneHours, threshold }
 * list: từng task { taskId, eventId, name, deadline, result, timing, quality }.
 */
function kpiTask_(memberId, c) {
  var out = { assigned: 0, pass: 0, fail: 0, waiting: 0, open: 0, percent: null, needed: 0, list: [] };
  if (c.from === false) return out;
  var termOf = eventTerms_(c.events), byId = {};
  c.tasks.forEach(function (t) { byId[t.task_id] = t; });
  c.assignments.forEach(function (a) {
    var t = byId[a.task_id];
    if (a.member_id !== memberId || !t || t.is_cancelled || !t.is_counted || termOf[t.event_id] !== String(c.termId)) return;
    if (c.from && (!t.created_at || t.created_at.getTime() < c.from.getTime())) return;
    if (!inRange_(taskDate_(t), c.range)) return;
    out.assigned++;
    var timing = taskTiming_(t, a, c.now, c.notDoneHours), r = taskResult_(timing, a.quality);
    if (r === 'pass') out.pass++;
    else if (r === 'fail') out.fail++;
    else if (r === 'waiting') out.waiting++;
    else out.open++;
    out.list.push({ taskId: t.task_id, eventId: t.event_id, name: t.name, deadline: t.deadline || null, result: r || 'open', timing: timing, quality: a.quality || '' });
  });
  out.percent = percent_(out.pass, out.pass + out.fail);
  out.needed = tasksNeeded_(out.pass, out.fail, c.threshold);
  return out;
}

/** Cần thêm bao nhiêu task đạt (không thêm task chưa đạt nào) để Đạt ÷ (Đạt + Chưa đạt) lên tới ngưỡng. */
function tasksNeeded_(pass, fail, threshold) {
  if (!threshold || !fail) return 0;
  var t = threshold / 100;
  if (t >= 1) return 999;
  return Math.max(0, Math.ceil((t * (pass + fail) - pass) / (1 - t) - 1e-9));
}

/** Phần trăm làm tròn thông thường (2,5 → 3). null nếu chưa có gì để chia. */
function percent_(part, whole) {
  return whole > 0 ? Math.round(part * 100 / whole + 1e-9) : null;
}

/* ===================== Log ===================== */

/** Số buổi quy ra buổi 90 phút: buổi 180 phút tính là 2. */
function sessionUnits_(minutes) {
  var n = Number(minutes) / 90;
  return n > 0 ? n : 1;
}

/** Khối từ tên lớp: 10A1 → 10. */
function gradeOf_(className) {
  var m = /^\s*(\d{1,2})/.exec(String(className || ''));
  return m ? m[1] : '';
}

/** Chỉ tiêu ban đầu của một người ở một sự kiện: dòng riêng người đó thắng, rồi đến khối, rồi đến ban. 0 nếu không có. */
function initialQuota_(quotas, eventId, memberId, memberTerm) {
  var want = { member: memberId, grade: gradeOf_(memberTerm && memberTerm.class_name), dept: memberTerm ? memberTerm.dept_code : '' };
  var best = null, order = { member: 0, grade: 1, dept: 2 };
  quotas.forEach(function (q) {
    if (q.event_id !== eventId || !(q.scope_type in order) || !want[q.scope_type] || String(q.scope_value) !== String(want[q.scope_type])) return;
    if (!best || order[q.scope_type] < order[best.scope_type]) best = q;
  });
  return best ? Number(best.initial_sessions) || 0 : 0;
}

/**
 * KPI log của một người trong nhiệm kỳ, đơn vị buổi 90 phút, giữ số lẻ.
 * Sự kiện đã chốt: lấy Giao cuối và Đã tham gia trong Kết quả log (con số lúc chốt).
 * Sự kiện đang mở: tạm lấy chỉ tiêu ban đầu và số buổi đã điểm danh, để thành viên biết còn thiếu bao nhiêu.
 * Bỏ sự kiện chưa có buổi nào được tính (tạo trong giao thoa). Người bổ sung chỉ tính sự kiện bắt đầu từ GD2.
 * needed: số buổi còn phải đi để đạt ngưỡng (dự báo "cần thêm 1 buổi").
 * c: { events, closings, sessions, attendance, quotas, results, termId, from, range (chỉ tính sự kiện có ngày trong khoảng này), threshold }
 * list: từng sự kiện { eventId, name, quota, attended, closed }.
 */
function kpiLog_(memberId, memberTerm, c) {
  var out = { quota: 0, attended: 0, percent: null, needed: 0, events: 0, list: [] };
  if (c.from === false) return out;
  var closed = {}, closing = {}, counted = {}, units = {};
  c.closings.forEach(function (x) { closing[x.event_id] = x; if (x.status === 'closed') closed[x.event_id] = true; });
  c.sessions.forEach(function (s) {
    units[s.session_id] = { eventId: s.event_id, units: sessionUnits_(s.duration_min) };
    if (s.is_counted) counted[s.event_id] = true;
    else units[s.session_id].skip = true;
  });
  c.events.forEach(function (e) {
    if (String(e.term_id) !== String(c.termId) || !counted[e.event_id]) return;
    if (c.from && (!e.planned_date || e.planned_date.getTime() < c.from.getTime())) return;
    if (!inRange_(eventDate_(e, closing[e.event_id]), c.range)) return;
    var quota = 0, attended = 0;
    if (closed[e.event_id]) {
      var r = c.results.filter(function (x) { return x.event_id === e.event_id && x.member_id === memberId; })[0];
      if (r) { quota = Number(r.final_quota) || 0; attended = Number(r.attended) || 0; }
    } else {
      quota = initialQuota_(c.quotas, e.event_id, memberId, memberTerm);
      c.attendance.forEach(function (a) {
        var s = units[a.session_id];
        if (a.member_id === memberId && s && !s.skip && s.eventId === e.event_id) attended += s.units;
      });
    }
    if (!quota) return;
    out.events++;
    out.quota += quota;
    out.attended += attended;
    out.list.push({ eventId: e.event_id, name: e.name, quota: quota, attended: attended, closed: !!closed[e.event_id] });
  });
  out.quota = Math.round(out.quota * 100) / 100;
  out.percent = percent_(out.attended, out.quota);
  if (out.quota > 0) out.needed = Math.max(0, Math.ceil(c.threshold * out.quota / 100 - out.attended - 1e-9));
  return out;
}

/** Buổi đã ra sao: pending (chưa điểm danh), held (đã điểm danh), no_work (huỷ vì hết việc), other_reason (huỷ vì lý do khác). */
function sessionOutcome_(s, attendanceCount) {
  if (s.cancelled_no_work) return 'no_work';
  if (s.cancelled_other_reason) return 'other_reason';
  return attendanceCount ? 'held' : 'pending';
}

/**
 * Kết quả log của một sự kiện lúc chốt (LOG-06, LOG-07). Chỉ tính buổi được tính (không tạo trong giao thoa).
 * Dự kiến = mọi buổi đã tạo; thực diễn ra = buổi đã điểm danh và buổi huỷ vì lý do khác; đều quy ra buổi 90 phút.
 * Giao cuối = thực diễn ra × giao ban đầu ÷ dự kiến, giữ 2 số lẻ. Buổi vượt = đã tham gia − giao cuối làm tròn xuống, không âm.
 * people: { Mã TV: dòng Thành viên theo nhiệm kỳ } của những người có thể có chỉ tiêu (không có BOD).
 * Người không có chỉ tiêu mà vẫn đi log thì cũng có dòng (đi bao nhiêu buổi là vượt bấy nhiêu).
 */
function logResults_(eventId, sessions, attendance, quotas, people) {
  var mine = sessions.filter(function (s) { return s.event_id === eventId && s.is_counted; });
  var count = {}, units = {};
  attendance.forEach(function (a) { count[a.session_id] = (count[a.session_id] || 0) + 1; });
  var planned = 0, actual = 0;
  mine.forEach(function (s) {
    units[s.session_id] = sessionUnits_(s.duration_min);
    planned += units[s.session_id];
    var o = sessionOutcome_(s, count[s.session_id]);
    if (o === 'held' || o === 'other_reason') actual += units[s.session_id];
  });
  var attended = {};
  attendance.forEach(function (a) { if (units[a.session_id]) attended[a.member_id] = (attended[a.member_id] || 0) + units[a.session_id]; });
  var ids = Object.keys(people).filter(function (id) { return initialQuota_(quotas, eventId, id, people[id]) > 0; });
  Object.keys(attended).forEach(function (id) { if (people[id] && ids.indexOf(id) < 0) ids.push(id); });
  var rows = ids.map(function (id) {
    var initial = initialQuota_(quotas, eventId, id, people[id]);
    var fin = planned ? Math.round(actual * initial / planned * 100) / 100 : 0;
    var att = attended[id] || 0;
    return { member_id: id, initial_quota: initial, final_quota: fin, attended: att, extra_sessions: Math.max(0, att - Math.floor(fin + 1e-9)) };
  });
  return { planned: planned, actual: actual, rows: rows };
}

/* ===================== Điểm và hạng ===================== */

/** Tổng điểm từng người trong khoảng [from, to). Bỏ dòng đã huỷ. */
function pointsBetween_(entries, from, to) {
  var sum = {};
  entries.forEach(function (p) {
    if (p.is_cancelled || !p.awarded_at) return;
    var ms = p.awarded_at.getTime();
    if (ms < from.getTime() || (to && ms >= to.getTime())) return;
    sum[p.member_id] = (sum[p.member_id] || 0) + (Number(p.points) || 0);
  });
  return sum;
}

/** Người có tên trên bảng xếp hạng một giai đoạn: đang ở CLB trong nhiệm kỳ, không phải BOD; GD1 chỉ thành viên chính thức. */
function rankedMembers_(members, memberTerms, termId, phase) {
  var inTerm = {};
  memberTerms.forEach(function (r) { if (String(r.term_id) === String(termId) && r.status === 'active' && r.dept_code !== 'BOD') inTerm[r.member_id] = true; });
  return members.filter(function (m) {
    return inTerm[m.member_id] && !(phase === 'phase_1' && isSupplementary_(m, termId));
  }).map(function (m) { return m.member_id; });
}

/** Bảng xếp hạng: điểm cao trước, bằng điểm thì cùng hạng. */
function rankList_(memberIds, points) {
  var list = memberIds.map(function (id) { return { memberId: id, points: points[id] || 0 }; });
  list.sort(function (a, b) { return b.points - a.points; });
  list.forEach(function (x, i) { x.rank = i && list[i - 1].points === x.points ? list[i - 1].rank : i + 1; });
  return list;
}

/** Số người trong top: số người được xếp hạng × tỉ lệ, làm tròn thông thường (70 × 15% = 10,5 → 11). */
function topCount_(n, pct) {
  return Math.round(n * pct / 100 + 1e-9);
}

/**
 * Mã những người lọt top pct% của một bảng xếp hạng (kết quả rankList_). Người bằng điểm với người cuối trong top cũng được
 * tính; người 0 điểm không được tính. { Mã TV: true }.
 */
function topIds_(list, pct) {
  var k = topCount_(list.length, pct), out = {};
  if (!k) return out;
  var sorted = list.slice().sort(function (a, b) { return b.points - a.points; }), cut = sorted[k - 1].points;
  sorted.forEach(function (x) { if (x.points > 0 && x.points >= cut) out[x.memberId] = true; });
  return out;
}

/**
 * Certificate theo quy chế (mục 5.4): log và task đều từ ngưỡng đạt (80%) thì cấp vì đạt KPI; đều từ ngưỡng bù trừ (60%)
 * và lọt top bù trừ thì cấp nhờ bù trừ; còn lại chưa cấp. Phần chưa được giao việc gì (null) coi như đạt.
 * rules: { threshold, offsetThreshold }. Trả về 'cert_kpi', 'cert_offset' hoặc 'none'.
 */
function certificateOf_(log, task, inOffsetTop, rules) {
  var ok = function (x, min) { return x === null || x === undefined || x >= min; };
  if (ok(log, rules.threshold) && ok(task, rules.threshold)) return 'cert_kpi';
  if (ok(log, rules.offsetThreshold) && ok(task, rules.offsetThreshold)) return inOffsetTop ? 'cert_offset' : 'none';
  return 'none';
}

/** Có cần bù trừ không: chưa đạt KPI nhưng mỗi phần đều từ ngưỡng bù trừ. */
function needsOffset_(log, task, rules) {
  return certificateOf_(log, task, true, rules) === 'cert_offset';
}

/* ===================== Khoá sau tổng kết ===================== */

/**
 * Khoảng thời gian bị khoá vì giai đoạn đã tổng kết (tab Kết quả giai đoạn đã có dòng của giai đoạn đó).
 * GD2 kéo tới lúc nhiệm kỳ sau bắt đầu (giao thoa). [{ termId, phase, from, to }].
 */
function lockedRanges_(terms, results) {
  var done = {};
  results.forEach(function (r) { done[r.term_id + '|' + r.phase] = true; });
  var sorted = terms.filter(function (t) { return t.term_id; }).sort(function (a, b) { return String(a.term_id) < String(b.term_id) ? -1 : 1; });
  var out = [];
  sorted.forEach(function (t, i) {
    var next = sorted[i + 1];
    ['phase_1', 'phase_2'].forEach(function (p) {
      var r = phaseRange_(t, p);
      if (!r || !done[t.term_id + '|' + p]) return;
      out.push({ termId: String(t.term_id), phase: p, from: r.from, to: p === 'phase_2' ? (next && next.prep_start_at) || null : r.to });
    });
  });
  return out;
}

/** Giai đoạn đã khoá chứa ngày d, hoặc null. */
function lockedAt_(ranges, d) {
  if (!d) return null;
  return ranges.filter(function (r) { return inRange_(d, r); })[0] || null;
}
