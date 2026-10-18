/**
 * KPI của tôi, Điểm và xếp hạng (thành viên) và trang Thành viên của BOD: bảng tổng hợp, chi tiết từng người, Tổng kết.
 * Tổng kết theo doc "Sheet dữ liệu app ECO" (tab Kết quả giai đoạn): app tự chụp kết quả ở hai đợt, đợt 1 lúc tải sheet
 * đợt 2 (dòng GD1 của thành viên chính thức), đợt 2 lúc bấm Kết thúc nhiệm kỳ (dòng GD2 của mọi người, dòng Cả nhiệm kỳ của
 * thành viên chính thức). Sau khi chụp, mọi sửa đổi thuộc giai đoạn đó bị khoá. Trước lúc chụp, trang Tổng kết hiện kết quả
 * tạm tính, cùng cách tính.
 */

var CERT_LABELS = { cert_kpi: 'Cấp vì đạt KPI', cert_offset: 'Cấp nhờ bù trừ', none: 'Chưa cấp' };

function summaryRules_() {
  return {
    threshold: getNumberSetting_('kpi_threshold', 80), offsetThreshold: getNumberSetting_('offset_threshold', 60),
    topPercent: getNumberSetting_('top_reward_percent', 15), offsetTopPercent: getNumberSetting_('offset_top_percent', 40),
    notDoneHours: getNumberSetting_('not_done_after_hours', 24), dueSoonDays: getNumberSetting_('due_soon_days', 2)
  };
}

/** Đọc mọi tab cần để tính điểm, KPI, hạng một lần cho mỗi lần gọi. term: nhiệm kỳ cần tính (mặc định nhiệm kỳ đang chạy). */
function summaryContext_(termId) {
  var terms = readTable_('terms');
  var term = termId ? terms.filter(function (t) { return String(t.term_id) === String(termId); })[0] : currentTerm_(terms);
  return {
    now: new Date(), terms: terms, term: term || null, data: peopleData_(), rules: summaryRules_(),
    tasks: readTable_('tasks'), assignments: readTable_('task_assignments'), events: readTable_('events'),
    closings: readTable_('event_closings'), sessions: readTable_('log_sessions'), attendance: readTable_('attendance'),
    quotas: readTable_('log_quotas'), logResults: readTable_('log_results'), entries: readTable_('point_entries'),
    activities: readTable_('activities'), phaseResults: readTable_('phase_results')
  };
}

/** Khoảng của GD1, GD2 trong nhiệm kỳ của ctx. GD2 kéo tới lúc nhiệm kỳ sau bắt đầu. */
function phaseRangeOf_(ctx, phase) {
  var r = phaseRange_(ctx.term, phase);
  if (!r || phase !== 'phase_2') return r;
  var next = ctx.terms.filter(function (t) { return String(t.term_id) > String(ctx.term.term_id) && t.prep_start_at; })
    .sort(function (a, b) { return String(a.term_id) < String(b.term_id) ? -1 : 1; })[0];
  return { from: r.from, to: next ? next.prep_start_at : null };
}

function memberTermOf_(ctx, memberId) {
  return ctx.data.member_terms.filter(function (r) { return r.member_id === memberId && String(r.term_id) === String(ctx.term.term_id); })[0] || null;
}

/** KPI task và log của một người. opts: { from (lúc bắt đầu tính, false là chưa có gì), range (chỉ một giai đoạn) }. */
function kpiOf_(ctx, memberId, opts) {
  var c = ctx.rules, mt = memberTermOf_(ctx, memberId);
  return {
    task: kpiTask_(memberId, { tasks: ctx.tasks, assignments: ctx.assignments, events: ctx.events, termId: ctx.term.term_id, from: opts.from,
      range: opts.range, now: ctx.now, notDoneHours: c.notDoneHours, threshold: c.threshold }),
    log: kpiLog_(memberId, mt, { events: ctx.events, closings: ctx.closings, sessions: ctx.sessions, attendance: ctx.attendance,
      quotas: ctx.quotas, results: ctx.logResults, termId: ctx.term.term_id, from: opts.from, range: opts.range, threshold: c.threshold })
  };
}

/** Phạm vi xét KPI của một người: chính thức cả nhiệm kỳ, bổ sung từ GD2. */
function kpiScopeOf_(ctx, member) {
  return { from: kpiFrom_(member, ctx.term) };
}

/**
 * Điểm, hạng, top, KPI và certificate của mọi người có tên trên bảng xếp hạng nhiệm kỳ (không có BOD).
 * Trả về { lists: { phase_1, phase_2, full } (bảng xếp hạng, null nếu giai đoạn chưa bắt đầu), people: { Mã TV: {...} } }.
 */
function termSummary_(ctx) {
  var term = ctx.term, rules = ctx.rules, out = { lists: {}, people: {} };
  if (!term) return out;
  var members = {};
  ctx.data.members.forEach(function (m) { members[m.member_id] = m; });
  var pts = {}, ids = {};
  ['phase_1', 'phase_2'].forEach(function (p) {
    var r = phaseRangeOf_(ctx, p);
    ids[p] = rankedMembers_(ctx.data.members, ctx.data.member_terms, term.term_id, p);
    pts[p] = r ? pointsBetween_(ctx.entries, r.from, r.to) : null;
    out.lists[p] = r ? rankList_(ids[p], pts[p]) : null;
  });
  var officials = ids.phase_1, total = {};
  officials.forEach(function (id) { total[id] = ((pts.phase_1 || {})[id] || 0) + ((pts.phase_2 || {})[id] || 0); });
  out.lists.full = out.lists.phase_1 ? rankList_(officials, total) : null;
  var tops = {}, offsetTops = {};
  ['phase_1', 'phase_2', 'full'].forEach(function (k) {
    tops[k] = out.lists[k] ? topIds_(out.lists[k], rules.topPercent) : {};
    offsetTops[k] = out.lists[k] ? topIds_(out.lists[k], rules.offsetTopPercent) : {};
  });
  var rankOf = function (k, id) {
    var x = out.lists[k] && out.lists[k].filter(function (y) { return y.memberId === id; })[0];
    return x ? { rank: x.rank, of: out.lists[k].length } : null;
  };
  var everyone = ids.phase_2.slice();
  officials.forEach(function (id) { if (everyone.indexOf(id) < 0) everyone.push(id); });
  if (!out.lists.phase_1 && !out.lists.phase_2) return out;
  everyone.forEach(function (id) {
    var m = members[id], mt = memberTermOf_(ctx, id), sup = isSupplementary_(m, term.term_id);
    var kpi = kpiOf_(ctx, id, kpiScopeOf_(ctx, m));
    var table = sup ? 'phase_2' : 'full', place = rankOf(table, id);
    var log = kpi.log.percent, task = kpi.task.percent;
    var cert = place || !sup ? certificateOf_(log, task, !!offsetTops[table][id], rules) : '';
    out.people[id] = {
      id: id, name: m.full_name, dept: mt ? mt.dept_code : '', subTeam: mt ? mt.sub_team || '' : '', className: mt ? mt.class_name || '' : '',
      grade: gradeOf_(mt && mt.class_name), supplementary: sup,
      points: { phase_1: sup ? null : (pts.phase_1 || {})[id] || 0, phase_2: pts.phase_2 ? pts.phase_2[id] || 0 : null, total: sup ? null : total[id] },
      ranks: { phase_1: rankOf('phase_1', id), phase_2: rankOf('phase_2', id), full: rankOf('full', id) },
      top: { phase_1: !!tops.phase_1[id], phase_2: !!tops.phase_2[id], full: !!tops.full[id] },
      kpi: kpi,
      offset: { table: table, needed: needsOffset_(log, task, rules), rank: place ? place.rank : null, of: place ? place.of : null, inTop: !!offsetTops[table][id] },
      certificate: cert
    };
  });
  return out;
}

/* ===================== Chụp kết quả và khoá ===================== */

/**
 * Chụp kết quả một đợt tổng kết vào tab Kết quả giai đoạn (ghi đè lần chụp trước của đợt đó). Bước tải sheet đợt 2 gọi
 * round_1, nút Kết thúc nhiệm kỳ gọi round_2, trước khi mở nhiệm kỳ mới. Gọi trong withLock_. Trả về số dòng đã ghi.
 */
function snapshotRound_(round, termId) {
  var ctx = summaryContext_(termId), term = ctx.term;
  if (!term) throw new Error('Chưa có nhiệm kỳ nào để tổng kết.');
  var phases = round === 'round_1' ? ['phase_1'] : round === 'round_2' ? ['phase_2', 'full_term'] : null;
  if (!phases) throw new Error('Không rõ đợt tổng kết.');
  var s = termSummary_(ctx), now = ctx.now, rows = [];
  var percentCell = function (x) { return x === null || x === undefined ? '' : x; };
  phases.forEach(function (phase) {
    var key = phase === 'full_term' ? 'full' : phase, list = s.lists[key];
    if (!list) return;
    var range = phase === 'full_term' ? null : phaseRangeOf_(ctx, phase);
    list.forEach(function (x) {
      var p = s.people[x.memberId], scope = kpiScopeOf_(ctx, findMember_(ctx, x.memberId));
      var kpi = phase === 'full_term' ? p.kpi : kpiOf_(ctx, x.memberId, { from: scope.from, range: range });
      var certHere = (phase === 'full_term' && !p.supplementary) || (phase === 'phase_2' && p.supplementary);
      rows.push({ term_id: term.term_id, phase: phase, summary_round: round, member_id: x.memberId, total_points: x.points,
        kpi_log: percentCell(kpi.log.percent), kpi_task: percentCell(kpi.task.percent), rank: x.rank, is_top_reward: !!p.top[key],
        certificate: certHere ? p.certificate : '', snapshot_at: now });
    });
  });
  dropRound_(round, term.term_id);
  insertRecords_('phase_results', rows);
  return rows.length;
}

/** Xoá kết quả đã chụp của một đợt (hoàn tác lần tải sheet đợt 2): giai đoạn đó hết khoá. */
function dropRound_(round, termId) {
  readTable_('phase_results').filter(function (r) { return String(r.term_id) === String(termId) && r.summary_round === round; })
    .forEach(function (r) { deleteRecord_('phase_results', { term_id: r.term_id, phase: r.phase, member_id: r.member_id }); });
}

function findMember_(ctx, id) {
  return ctx.data.members.filter(function (m) { return m.member_id === id; })[0];
}

/** Báo lỗi nếu ngày d thuộc giai đoạn đã tổng kết. what: việc định làm, ví dụ "chấm lại task". */
function assertNotLocked_(d, what) {
  var r = lockedAt_(lockedRanges_(readTable_('terms'), readTable_('phase_results')), d);
  if (r) throw new Error((PHASE_LABELS[r.phase] || r.phase) + ' của nhiệm kỳ ' + termLabel_(r.termId) + ' đã tổng kết nên không ' + what + ' được nữa.');
}

/* ===================== Hiện ra trang ===================== */

function ms_(d) { return d ? d.getTime() : null; }

function termView_(ctx) {
  var phase = ctx.term ? phaseAt_(ctx.term, ctx.now) : '';
  return ctx.term ? { id: String(ctx.term.term_id), label: termLabel_(ctx.term.term_id), phase: phase, phaseLabel: PHASE_LABELS[phase] || '' } : null;
}

/** Giai đoạn đã bắt đầu: [{ id, label }]. */
function startedPhases_(ctx) {
  return ['phase_1', 'phase_2'].filter(function (p) { return ctx.term && phaseRange_(ctx.term, p); })
    .map(function (p) { return { id: p, label: PHASE_LABELS[p] }; });
}

function eventNames_(ctx) {
  var m = {};
  ctx.events.forEach(function (e) { m[e.event_id] = e.name; });
  return m;
}

/** KPI chi tiết để hiện: từng task, từng sự kiện. */
function kpiView_(ctx, kpi) {
  var ev = eventNames_(ctx);
  return {
    task: { assigned: kpi.task.assigned, pass: kpi.task.pass, fail: kpi.task.fail, waiting: kpi.task.waiting, open: kpi.task.open,
      percent: kpi.task.percent, needed: kpi.task.needed,
      list: kpi.task.list.map(function (t) {
        return { id: t.taskId, name: t.name, event: ev[t.eventId] || '', deadline: ms_(t.deadline), result: t.result, timing: t.timing, quality: t.quality };
      }).sort(function (a, b) { return (b.deadline || 0) - (a.deadline || 0); }) },
    log: { quota: kpi.log.quota, attended: kpi.log.attended, percent: kpi.log.percent, needed: kpi.log.needed,
      list: kpi.log.list.map(function (e) { return { id: e.eventId, name: e.name, quota: e.quota, attended: e.attended, closed: e.closed }; }) }
  };
}

/** Lịch sử cộng điểm của một người trong một giai đoạn (không có dòng đã huỷ), mới nhất trước. */
function pointHistory_(ctx, memberId, range) {
  if (!range) return [];
  var acts = {}, ev = eventNames_(ctx);
  ctx.activities.forEach(function (a) { acts[a.activity_id] = a.name; });
  return ctx.entries.filter(function (e) { return e.member_id === memberId && !e.is_cancelled && inRange_(e.awarded_at, range); })
    .sort(function (a, b) { return b.awarded_at.getTime() - a.awarded_at.getTime(); })
    .map(function (e) {
      return { at: e.awarded_at.getTime(), activity: acts[e.activity_id] || e.activity_id, event: ev[e.event_id] || '', points: Number(e.points) || 0,
        source: e.source && e.source !== 'manual' ? POINT_SOURCES[e.source] || '' : '' };
    });
}

/** Trang KPI của tôi. */
function myKpi(token) {
  var me = requireUser_(token);
  var ctx = summaryContext_(), out = { term: termView_(ctx), threshold: ctx.rules.threshold, bod: me.user.isBod, counting: false };
  if (me.user.isBod || !ctx.term || !memberTermOf_(ctx, me.memberId)) return out;
  var phase = out.term.phase;
  if (phase !== 'phase_1' && phase !== 'phase_2') return out;
  var m = findMember_(ctx, me.memberId), scope = kpiScopeOf_(ctx, m);
  out.counting = true;
  out.supplementary = isSupplementary_(m, ctx.term.term_id);
  out.from = ms_(scope.from || null);
  var v = kpiView_(ctx, kpiOf_(ctx, me.memberId, scope));
  out.task = v.task; out.log = v.log;
  return out;
}

/** Bảng xếp hạng một giai đoạn kèm đánh dấu top. */
function rankingView_(ctx, s, phase, meId) {
  var list = s.lists[phase] || [], tops = topIds_(list, ctx.rules.topPercent), names = namesById_(ctx.data.members);
  return list.map(function (x) {
    var mt = memberTermOf_(ctx, x.memberId);
    return { id: x.memberId, name: names[x.memberId] || x.memberId, dept: mt ? mt.dept_code : '', subTeam: mt ? mt.sub_team || '' : '',
      points: x.points, rank: x.rank, top: !!tops[x.memberId], me: x.memberId === meId };
  });
}

/** Trang Điểm và xếp hạng. phase: phase_1 | phase_2 (mặc định giai đoạn đang chạy). */
function myRanking(token, phase) {
  var me = requireUser_(token);
  var ctx = summaryContext_(), out = { term: termView_(ctx), phases: startedPhases_(ctx), topPercent: ctx.rules.topPercent, list: [], history: [] };
  if (!out.phases.length) return out;
  var ids = out.phases.map(function (p) { return p.id; });
  out.phase = ids.indexOf(phase) >= 0 ? phase : ids.indexOf(out.term.phase) >= 0 ? out.term.phase : ids[ids.length - 1];
  var s = termSummary_(ctx);
  out.list = rankingView_(ctx, s, out.phase, me.memberId);
  var mine = out.list.filter(function (x) { return x.me; })[0];
  out.me = mine ? { points: mine.points, rank: mine.rank, of: out.list.length, top: mine.top } : null;
  out.bod = me.user.isBod;
  out.history = me.user.isBod ? [] : pointHistory_(ctx, me.memberId, phaseRangeOf_(ctx, out.phase));
  if (!me.user.isBod && !mine) {
    out.notRanked = out.phase === 'phase_1' ? 'GD1 chỉ xếp hạng thành viên chính thức. Bạn có tên trên bảng từ GD2.' : 'Bạn chưa có tên trên bảng xếp hạng nhiệm kỳ này.';
  }
  return out;
}

/** Thứ tự ban theo tab Cơ cấu. */
function deptOrder_() {
  return readTable_('departments').sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).map(function (d) { return d.dept_code; });
}

/** Một dòng trong bảng tổng hợp của BOD. byEvent: { Mã SK: [task đạt, task chưa đạt, task chờ chấm, log giao, log đã đi] } để lọc theo sự kiện. */
function overviewRow_(p) {
  var byEvent = {};
  var at = function (id) { return byEvent[id] || (byEvent[id] = [0, 0, 0, 0, 0]); };
  p.kpi.task.list.forEach(function (t) {
    var r = at(t.eventId);
    if (t.result === 'pass') r[0]++; else if (t.result === 'fail') r[1]++; else if (t.result === 'waiting') r[2]++;
  });
  p.kpi.log.list.forEach(function (e) { var r = at(e.eventId); r[3] += e.quota; r[4] += e.attended; });
  return {
    id: p.id, name: p.name, dept: p.dept, subTeam: p.subTeam, className: p.className, grade: p.grade, supplementary: p.supplementary,
    points: p.points, ranks: p.ranks, top: p.top,
    task: { pass: p.kpi.task.pass, fail: p.kpi.task.fail, waiting: p.kpi.task.waiting, open: p.kpi.task.open, percent: p.kpi.task.percent, needed: p.kpi.task.needed },
    log: { quota: p.kpi.log.quota, attended: p.kpi.log.attended, percent: p.kpi.log.percent, needed: p.kpi.log.needed },
    byEvent: byEvent, certificate: p.certificate, offset: p.offset
  };
}

/** Trang Thành viên (BOD): bảng tổng hợp mọi thành viên trừ BOD trong nhiệm kỳ đang chạy. */
function membersPage(token) {
  requireUser_(token, 'bod');
  var ctx = summaryContext_(), out = { term: termView_(ctx), phases: startedPhases_(ctx), rules: ctx.rules, people: [], events: [], depts: [] };
  if (!ctx.term) return out;
  var s = termSummary_(ctx), order = deptOrder_();
  out.people = Object.keys(s.people).map(function (id) { return overviewRow_(s.people[id]); });
  out.events = ctx.events.filter(function (e) { return String(e.term_id) === String(ctx.term.term_id); }).map(function (e) { return { id: e.event_id, name: e.name }; });
  var seen = {};
  out.people.forEach(function (p) { seen[p.dept] = true; });
  out.depts = order.filter(function (d) { return seen[d]; });
  out.grades = Object.keys(out.people.reduce(function (m, p) { if (p.grade) m[p.grade] = true; return m; }, {})).sort();
  out.rounds = roundsOf_(ctx.phaseResults, ctx.term.term_id);
  return out;
}

/** Lúc chụp từng đợt tổng kết của một nhiệm kỳ (mili giây), hoặc null. */
function roundsOf_(results, termId) {
  var out = { round_1: null, round_2: null };
  results.forEach(function (r) {
    if (String(r.term_id) === String(termId) && r.snapshot_at && out[r.summary_round] === null) out[r.summary_round] = r.snapshot_at.getTime();
  });
  return out;
}

/** Chi tiết một thành viên (BOD bấm vào một dòng): KPI từng task, từng sự kiện, lịch sử điểm cả nhiệm kỳ. */
function memberDetail(token, memberId) {
  requireUser_(token, 'bod');
  var ctx = summaryContext_(), id = String(memberId || '');
  var m = findMember_(ctx, id);
  if (!ctx.term || !m || !memberTermOf_(ctx, id)) throw new Error('Không tìm thấy thành viên này trong nhiệm kỳ hiện tại.');
  var s = termSummary_(ctx), p = s.people[id];
  var v = kpiView_(ctx, p ? p.kpi : kpiOf_(ctx, id, kpiScopeOf_(ctx, m)));
  var history = [];
  startedPhases_(ctx).forEach(function (ph) {
    pointHistory_(ctx, id, phaseRangeOf_(ctx, ph.id)).forEach(function (h) { h.phase = ph.id; history.push(h); });
  });
  history.sort(function (a, b) { return b.at - a.at; });
  return { id: id, name: m.full_name, row: p ? overviewRow_(p) : null, task: v.task, log: v.log, history: history, threshold: ctx.rules.threshold };
}

/* ===================== Tổng kết ===================== */

function birthText_(d) {
  if (!d || !d.getTime) return '';
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  return two(d.getDate()) + '/' + two(d.getMonth() + 1) + '/' + d.getFullYear();
}

/** SĐT để dán vào sheet Đoàn: chỉ giữ chữ số, sheet làm mất số 0 đầu thì thêm lại. */
function phoneText_(v) {
  var s = String(v == null ? '' : v).replace(/\D/g, '');
  return s.length === 9 ? '0' + s : s;
}

/** Các nhiệm kỳ có thể xem tổng kết: nhiệm kỳ đang chạy và các nhiệm kỳ đã chụp kết quả, mới nhất trước. */
function summaryTerms_(terms, results) {
  var have = {};
  results.forEach(function (r) { have[String(r.term_id)] = true; });
  var cur = currentTerm_(terms);
  if (cur) have[String(cur.term_id)] = true;
  return Object.keys(have).sort().reverse().map(function (id) { return { id: id, label: termLabel_(id) }; });
}

/**
 * Tổng kết một nhiệm kỳ (mặc định: nhiệm kỳ đang chạy, hoặc nhiệm kỳ vừa kết thúc nếu đang ở giao thoa).
 * Đợt nào đã chụp thì lấy từ tab Kết quả giai đoạn; chưa chụp thì tạm tính (chỉ được với nhiệm kỳ đang chạy).
 * Trả về { terms, term, rounds, live, rules, rewards: { phase_1, phase_2, full_term }, certificates: [...] }.
 * Người được cấp có thêm ngày sinh và SĐT để copy sang sheet Đoàn.
 */
function summaryView(token, termId) {
  requireUser_(token, 'bod');
  var terms = readTable_('terms'), results = readTable_('phase_results'), cur = currentTerm_(terms);
  var list = summaryTerms_(terms, results);
  if (!termId && cur && !phaseAt_(cur, new Date()).match(/^phase_/) && list.length > 1) termId = list[1].id;
  termId = String(termId || (cur ? cur.term_id : ''));
  if (!list.some(function (t) { return t.id === termId; })) throw new Error('Không có tổng kết của nhiệm kỳ này.');
  var ctx = summaryContext_(termId), data = ctx.data, rules = ctx.rules;
  var info = {};
  data.members.forEach(function (m) { info[m.member_id] = m; });
  var deptOf = {};
  data.member_terms.forEach(function (r) { if (String(r.term_id) === termId) deptOf[r.member_id] = [r.dept_code, r.sub_team].filter(String).join(' '); });
  var rounds = roundsOf_(results, termId), isCurrent = cur && String(cur.term_id) === termId;
  var mine = results.filter(function (r) { return String(r.term_id) === termId; });
  var s = isCurrent ? termSummary_(ctx) : { lists: {}, people: {} };
  var person = function (id) {
    var m = info[id] || {};
    return { id: id, name: m.full_name || id, dept: deptOf[id] || '' };
  };
  var rewards = {}, live = {};
  [['phase_1', 'round_1', 'phase_1'], ['phase_2', 'round_2', 'phase_2'], ['full_term', 'round_2', 'full']].forEach(function (x) {
    var phase = x[0], round = x[1], key = x[2];
    if (rounds[round] !== null) {
      rewards[phase] = mine.filter(function (r) { return r.phase === phase && r.is_top_reward; })
        .sort(function (a, b) { return a.rank - b.rank; })
        .map(function (r) { var p = person(r.member_id); p.points = r.total_points; p.rank = r.rank; return p; });
    } else if (s.lists[key]) {
      live[phase] = true;
      var tops = topIds_(s.lists[key], rules.topPercent);
      rewards[phase] = s.lists[key].filter(function (r) { return tops[r.memberId]; })
        .map(function (r) { var p = person(r.memberId); p.points = r.points; p.rank = r.rank; return p; });
    } else rewards[phase] = null;
  });
  var certs;
  if (rounds.round_2 !== null) {
    certs = mine.filter(function (r) { return r.certificate; }).map(function (r) {
      var p = person(r.member_id);
      p.certificate = r.certificate; p.log = r.kpi_log === '' ? null : r.kpi_log; p.task = r.kpi_task === '' ? null : r.kpi_task;
      p.supplementary = r.phase === 'phase_2';
      p.offsetRank = r.rank; p.offsetOf = mine.filter(function (x) { return x.phase === r.phase; }).length;
      return p;
    });
  } else {
    live.certificates = true;
    certs = Object.keys(s.people).map(function (id) {
      var x = s.people[id], p = person(id);
      p.certificate = x.certificate; p.log = x.kpi.log.percent; p.task = x.kpi.task.percent; p.supplementary = x.supplementary;
      p.offsetRank = x.offset.rank; p.offsetOf = x.offset.of; p.offsetNeeded = x.offset.needed;
      return p;
    }).filter(function (p) { return p.certificate; });
  }
  certs.forEach(function (p) {
    p.offsetNeeded = needsOffset_(p.log, p.task, rules);
    if (p.certificate !== 'none') { p.birth = birthText_(info[p.id] && info[p.id].birth_date); p.phone = phoneText_(info[p.id] && info[p.id].phone); }
  });
  var order = { cert_kpi: 0, cert_offset: 1, none: 2 };
  certs.sort(function (a, b) { return order[a.certificate] - order[b.certificate] || a.name.localeCompare(b.name, 'vi'); });
  return { terms: list, term: { id: termId, label: termLabel_(termId), current: !!isCurrent }, rounds: rounds, live: live, rules: rules,
    rewards: rewards, certificates: certs };
}
