/**
 * Sự kiện (Kế hoạch năm) và log, chỉ BOD. Log đi bốn bước: tạo buổi → đặt chỉ tiêu → điểm danh → chốt.
 * Mọi con số buổi quy ra buổi 90 phút (buổi 180 phút là 2). Sự kiện đã chốt thì không sửa buổi, chỉ tiêu, điểm danh
 * cho tới khi BOD mở chốt. Chốt thì ghi Kết quả log và cộng điểm log vượt; mở chốt thì huỷ các dòng điểm đó.
 */

var SESSION_OUTCOMES = ['held', 'no_work', 'other_reason'];

/* ===================== Kế hoạch năm (sự kiện) ===================== */

function closedEvents_() {
  var m = {};
  readTable_('event_closings').forEach(function (c) { if (c.status === 'closed') m[c.event_id] = c; });
  return m;
}

/** Sự kiện của nhiệm kỳ hiện tại, ngày dự kiến sớm trước. */
function termEvents_(termId) {
  var closed = closedEvents_();
  return readTable_('events').filter(function (e) { return String(e.term_id) === String(termId); }).map(function (e) {
    return { id: e.event_id, name: e.name, plannedDate: e.planned_date ? e.planned_date.getTime() : null, description: e.description || '',
      closed: !!closed[e.event_id] };
  }).sort(function (a, b) { return (a.plannedDate || Infinity) - (b.plannedDate || Infinity); });
}

function requireTerm_() {
  var term = currentTerm_(readTable_('terms'));
  if (!term) throw new Error('Chưa có nhiệm kỳ nào.');
  return term;
}

/** Gọi từ pop-up Kế hoạch năm. */
function eventPlan(token) {
  requireUser_(token, 'bod');
  var term = currentTerm_(readTable_('terms'));
  return { termLabel: term ? termLabel_(term.term_id) : '', events: term ? termEvents_(term.term_id) : [] };
}

/** Tạo hoặc sửa sự kiện. f: { eventId (trống là mới), name, plannedDate (ms), description }. */
function saveEvent(token, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  var name = String(f.name || '').trim();
  if (!name) throw new Error('Bạn chưa nhập tên sự kiện.');
  var d = f.plannedDate ? new Date(Number(f.plannedDate)) : null;
  if (!d || isNaN(d.getTime())) throw new Error('Bạn chưa chọn ngày bắt đầu dự kiến.');
  withLock_(function () {
    var term = requireTerm_();
    var fields = { name: name, planned_date: d, description: String(f.description || '').trim() };
    if (f.eventId) {
      var ev = findRecord_('events', String(f.eventId));
      if (!ev || String(ev.term_id) !== String(term.term_id)) throw new Error('Không tìm thấy sự kiện này trong nhiệm kỳ hiện tại.');
      updateRecord_('events', ev.event_id, fields);
    } else {
      fields.term_id = term.term_id; fields.created_by = me.memberId;
      insertRecords_('events', [fields], { termId: term.term_id });
    }
  });
  return eventPlan(token);
}

/* ===================== Quản lý log ===================== */

/** Người có thể có chỉ tiêu log: đang ở CLB trong nhiệm kỳ, không phải BOD. { Mã TV: dòng Thành viên theo nhiệm kỳ }. */
function logPeople_(memberTerms, termId) {
  var m = {};
  memberTerms.forEach(function (r) {
    if (String(r.term_id) === String(termId) && r.status === 'active' && r.dept_code !== 'BOD') m[r.member_id] = r;
  });
  return m;
}

/** Dữ liệu trang Quản lý log cho một sự kiện (trống thì chọn sự kiện đang mở đầu tiên). */
function logBoardFor_(me, eventId) {
  var term = currentTerm_(readTable_('terms'));
  var out = { now: Date.now(), events: term ? termEvents_(term.term_id) : [], event: null };
  if (!term) return out;
  var ev = out.events.filter(function (e) { return e.id === eventId; })[0] ||
    out.events.filter(function (e) { return !e.closed; })[0] || out.events[0];
  if (!ev) return out;
  var names = namesById_(me.data.members), people = logPeople_(me.data.member_terms, term.term_id);
  var sessions = readTable_('log_sessions').filter(function (s) { return s.event_id === ev.id; });
  var sessionIds = sessions.map(function (s) { return s.session_id; });
  var attendance = readTable_('attendance').filter(function (a) { return sessionIds.indexOf(a.session_id) >= 0; });
  var quotas = readTable_('log_quotas').filter(function (q) { return q.event_id === ev.id; });
  var byS = {};
  attendance.forEach(function (a) { (byS[a.session_id] = byS[a.session_id] || []).push(a.member_id); });
  var units = {};
  sessions.forEach(function (s) { units[s.session_id] = sessionUnits_(s.duration_min); });
  var attended = {};
  attendance.forEach(function (a) { attended[a.member_id] = (attended[a.member_id] || 0) + units[a.session_id]; });
  var sum = { planned: 0, actual: 0, held: 0, cancelled: 0, pending: 0 };
  var list = sessions.map(function (s) {
    var who = byS[s.session_id] || [], outcome = sessionOutcome_(s, who.length);
    if (s.is_counted) {
      sum.planned += units[s.session_id];
      if (outcome === 'held' || outcome === 'other_reason') sum.actual += units[s.session_id];
    }
    if (outcome === 'held') sum.held++; else if (outcome === 'pending') sum.pending++; else sum.cancelled++;
    return { id: s.session_id, name: s.name, duration: Number(s.duration_min) || 90, units: units[s.session_id], counted: !!s.is_counted,
      outcome: outcome, attendees: who };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  var closing = closedEvents_()[ev.id];
  out.event = {
    id: ev.id, name: ev.name, closed: ev.closed, signupUrl: signupUrl_(ev.id),
    closedBy: closing ? names[closing.closed_by] || closing.closed_by : '', closedAt: closing && closing.closed_at ? closing.closed_at.getTime() : null,
    sessions: list, summary: sum,
    quotas: quotas.map(function (q) { return { type: q.scope_type, value: String(q.scope_value), sessions: Number(q.initial_sessions) || 0 }; }),
    members: Object.keys(people).map(function (id) {
      var r = people[id];
      return { id: id, name: names[id] || id, dept: r.dept_code, subTeam: r.sub_team || '', grade: gradeOf_(r.class_name),
        quota: initialQuota_(quotas, ev.id, id, r), attended: attended[id] || 0 };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); }),
    depts: readTable_('departments').filter(function (d) { return d.is_active && d.dept_code !== 'BOD'; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).map(function (d) { return d.dept_code; })
  };
  if (ev.closed) {
    out.event.results = readTable_('log_results').filter(function (r) { return r.event_id === ev.id; }).map(function (r) {
      return { id: r.member_id, name: names[r.member_id] || r.member_id, initial: Number(r.initial_quota) || 0, final: Number(r.final_quota) || 0,
        attended: Number(r.attended) || 0, extra: Number(r.extra_sessions) || 0 };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  }
  return out;
}

/** Gọi từ trang web khi mở Quản lý log hoặc đổi sự kiện. */
function logBoard(token, eventId) {
  return logBoardFor_(requireUser_(token, 'bod'), String(eventId || ''));
}

/** Sự kiện đang mở của nhiệm kỳ hiện tại, hoặc báo lỗi. */
function openEvent_(eventId) {
  var term = requireTerm_();
  var ev = findRecord_('events', String(eventId || ''));
  if (!ev || String(ev.term_id) !== String(term.term_id)) throw new Error('Không tìm thấy sự kiện này trong nhiệm kỳ hiện tại.');
  if (closedEvents_()[ev.event_id]) throw new Error('Sự kiện này đã chốt. Mở chốt trước rồi hãy sửa.');
  return { term: term, event: ev };
}

function sessionOf_(sessionId) {
  var s = findRecord_('log_sessions', String(sessionId || ''));
  if (!s) throw new Error('Không tìm thấy buổi log này.');
  return s;
}

function checkDuration_(minutes) {
  var n = Number(minutes);
  if (n !== 90 && n !== 180) throw new Error('Thời lượng buổi là 90 hoặc 180 phút.');
  return n;
}

/** Tạo hoặc sửa buổi log. f: { sessionId (trống là mới), eventId, name, duration }. */
function saveSession(token, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  var eventId = String(f.eventId || '');
  withLock_(function () {
    var name = String(f.name || '').trim();
    if (!name) throw new Error('Bạn chưa đặt tên buổi.');
    var duration = checkDuration_(f.duration);
    if (f.sessionId) {
      var s = sessionOf_(f.sessionId);
      eventId = s.event_id;
      openEvent_(s.event_id);
      updateRecord_('log_sessions', s.session_id, { name: name, duration_min: duration });
      return;
    }
    var x = openEvent_(eventId), phase = phaseAt_(x.term, new Date());
    if (readTable_('log_sessions').some(function (s) { return s.event_id === eventId && s.name.trim().toLowerCase() === name.toLowerCase(); })) {
      throw new Error('Sự kiện này đã có buổi tên “' + name + '”. Tên buổi cũng là tên cột trong sheet đăng ký nên cần khác nhau.');
    }
    insertRecords_('log_sessions', [{ event_id: eventId, name: name, duration_min: duration, cancelled_other_reason: false, cancelled_no_work: false,
      is_counted: phase === 'phase_1' || phase === 'phase_2' }], { termId: x.term.term_id });
  });
  return logBoardFor_(me, eventId);
}

/** Xoá buổi tạo nhầm. Chỉ khi buổi chưa điểm danh và chưa huỷ. */
function deleteSession(token, sessionId) {
  var me = requireUser_(token, 'bod');
  var eventId = '';
  withLock_(function () {
    var s = sessionOf_(sessionId);
    eventId = s.event_id;
    openEvent_(s.event_id);
    var n = readTable_('attendance').filter(function (a) { return a.session_id === s.session_id; }).length;
    if (sessionOutcome_(s, n) !== 'pending') throw new Error('Buổi này đã điểm danh hoặc đã huỷ nên không xoá được.');
    deleteRecord_('log_sessions', s.session_id);
  });
  return logBoardFor_(me, eventId);
}

/**
 * Lưu kết quả một buổi. f: { outcome: held | no_work | other_reason, memberIds }.
 * held: người được tick là Có mặt. other_reason: người được tick là người đã đăng ký, tính như có mặt (LOG-09).
 * no_work: buổi không diễn ra, không ai được tính. Lưu lại nhiều lần được: thêm người còn sót, bỏ người tick nhầm.
 * Thêm hay bỏ người đều ghi Nhật ký.
 */
function saveAttendance(token, sessionId, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  var eventId = '';
  withLock_(function () {
    var s = sessionOf_(sessionId);
    eventId = s.event_id;
    var x = openEvent_(s.event_id);
    if (SESSION_OUTCOMES.indexOf(f.outcome) < 0) throw new Error('Bạn chọn buổi này diễn ra hay bị huỷ nhé.');
    var people = logPeople_(peopleData_().member_terms, x.term.term_id), ids = [];
    if (f.outcome !== 'no_work') (f.memberIds || []).forEach(function (id) { if (ids.indexOf(String(id)) < 0) ids.push(String(id)); });
    ids.forEach(function (id) { if (!people[id]) throw new Error('Có người được chọn không còn ở CLB hoặc là BOD. Bạn tải lại trang nhé.'); });
    if (f.outcome === 'held' && !ids.length) throw new Error('Buổi diễn ra thì cần tick ít nhất một người có mặt. Không ai đến thì chọn Huỷ: hết việc.');
    var countedAs = f.outcome === 'other_reason' ? 'registered_cancelled' : 'present';
    updateRecord_('log_sessions', s.session_id, { cancelled_other_reason: f.outcome === 'other_reason', cancelled_no_work: f.outcome === 'no_work' });
    var current = readTable_('attendance').filter(function (a) { return a.session_id === s.session_id; });
    var audit = { actorId: me.memberId, action: 'mark_attendance' };
    current.forEach(function (a) {
      if (ids.indexOf(a.member_id) < 0) deleteRecord_('attendance', { session_id: a.session_id, member_id: a.member_id }, audit);
    });
    var have = current.map(function (a) { return a.member_id; }), now = new Date();
    updateRecords_('attendance', current.filter(function (a) { return ids.indexOf(a.member_id) >= 0 && a.counted_as !== countedAs; })
      .map(function (a) { return { key: { session_id: a.session_id, member_id: a.member_id }, patch: { counted_as: countedAs } }; }), audit);
    var added = insertRecords_('attendance', ids.filter(function (id) { return have.indexOf(id) < 0; }).map(function (id) {
      return { session_id: s.session_id, member_id: id, counted_as: countedAs, marked_by: me.memberId, marked_at: now };
    }));
    writeAuditMany_(me.memberId, 'mark_attendance', 'attendance', added.map(function (a) {
      return { rowId: a.session_id + ' / ' + a.member_id, changes: [{ column: 'counted_as', oldValue: '', newValue: a.counted_as }] };
    }));
  });
  return logBoardFor_(me, eventId);
}

/**
 * Đặt chỉ tiêu ban đầu cho sự kiện, ghi đè cả bộ. rows: [{ type: dept | grade | member, value, sessions }] (số buổi 90 phút).
 * Ô trống hoặc 0 thì bỏ dòng đó. Thứ tự ưu tiên khi tính: riêng từng người → khối → ban.
 */
function saveQuotas(token, eventId, rows) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    openEvent_(eventId);
    var want = {}, kinds = ENUMS['log_quotas.scope_type'];
    (rows || []).forEach(function (r) {
      var type = String(r.type || ''), value = String(r.value || '').trim(), n = Number(r.sessions);
      if (!Object.prototype.hasOwnProperty.call(kinds, type) || !value) throw new Error('Có dòng chỉ tiêu thiếu ban, khối hoặc người.');
      if (r.sessions === '' || r.sessions === null || r.sessions === undefined || n === 0) return;
      if (!(n > 0) || Math.round(n * 2) !== n * 2) throw new Error('Chỉ tiêu là số buổi 90 phút, ví dụ 2 hoặc 1,5.');
      want[type + '\u0001' + value] = { event_id: String(eventId), scope_type: type, scope_value: value, initial_sessions: n };
    });
    var current = readTable_('log_quotas').filter(function (q) { return q.event_id === String(eventId); });
    current.forEach(function (q) {
      var k = q.scope_type + '\u0001' + q.scope_value;
      if (!want[k]) deleteRecord_('log_quotas', { event_id: q.event_id, scope_type: q.scope_type, scope_value: q.scope_value });
    });
    var keep = {};
    current.forEach(function (q) { keep[q.scope_type + '\u0001' + q.scope_value] = q; });
    updateRecords_('log_quotas', Object.keys(want).filter(function (k) { return keep[k] && Number(keep[k].initial_sessions) !== want[k].initial_sessions; })
      .map(function (k) { return { key: { event_id: want[k].event_id, scope_type: want[k].scope_type, scope_value: want[k].scope_value }, patch: { initial_sessions: want[k].initial_sessions } }; }));
    insertRecords_('log_quotas', Object.keys(want).filter(function (k) { return !keep[k]; }).map(function (k) { return want[k]; }));
  });
  return logBoardFor_(me, String(eventId));
}

/** Những gì còn thiếu trước khi chốt: buổi chưa điểm danh hoặc chưa huỷ, task chưa chấm. */
function closeBlockers_(eventId, now) {
  var out = [];
  var att = {};
  readTable_('attendance').forEach(function (a) { att[a.session_id] = (att[a.session_id] || 0) + 1; });
  readTable_('log_sessions').forEach(function (s) {
    if (s.event_id === eventId && sessionOutcome_(s, att[s.session_id]) === 'pending') out.push('Buổi “' + s.name + '” chưa điểm danh hoặc chưa huỷ');
  });
  var notDone = getNumberSetting_('not_done_after_hours', 24), tasks = {};
  readTable_('tasks').forEach(function (t) { if (t.event_id === eventId && !t.is_cancelled) tasks[t.task_id] = t; });
  var waiting = {};
  readTable_('task_assignments').forEach(function (a) {
    var t = tasks[a.task_id];
    if (!t) return;
    var r = taskResult_(taskTiming_(t, a, now, notDone), a.quality);
    if (r === 'waiting' || r === '') waiting[t.task_id] = (waiting[t.task_id] || 0) + 1;
  });
  Object.keys(waiting).forEach(function (id) { out.push('Task “' + tasks[id].name + '” còn ' + waiting[id] + ' người chưa có kết quả'); });
  return out;
}

/** Huỷ các dòng điểm log vượt của một sự kiện (khi mở chốt). */
function cancelLogExtraPoints_(eventId, actorId, now) {
  var rows = readTable_('point_entries').filter(function (e) { return e.source === 'log_extra' && e.source_id === eventId && !e.is_cancelled; });
  updateRecords_('point_entries', rows.map(function (e) {
    return { key: e.entry_id, patch: { is_cancelled: true, cancelled_by: actorId, cancelled_at: now } };
  }), { actorId: actorId, action: 'cancel_points' });
}

/**
 * Chốt sự kiện: tính Kết quả log (ghi đè lần chốt trước), cộng điểm log vượt, ghi Chốt sự kiện và Nhật ký.
 * Còn buổi chưa điểm danh hoặc task chưa có kết quả thì báo danh sách còn thiếu.
 */
function closeEvent(token, eventId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var x = openEvent_(eventId), now = new Date(), id = x.event.event_id;
    var missing = closeBlockers_(id, now);
    if (missing.length) throw new Error('Chưa chốt được vì: ' + missing.join('; ') + '.');
    var sessions = readTable_('log_sessions'), mine = {};
    sessions.forEach(function (s) { if (s.event_id === id) mine[s.session_id] = true; });
    var calc = logResults_(id, sessions, readTable_('attendance').filter(function (a) { return mine[a.session_id]; }),
      readTable_('log_quotas'), logPeople_(peopleData_().member_terms, x.term.term_id));
    var old = readTable_('log_results').filter(function (r) { return r.event_id === id; });
    old.forEach(function (r) { deleteRecord_('log_results', { event_id: id, member_id: r.member_id }); });
    insertRecords_('log_results', calc.rows.map(function (r) {
      return { event_id: id, member_id: r.member_id, initial_quota: r.initial_quota, final_quota: r.final_quota, attended: r.attended, extra_sessions: r.extra_sessions };
    }));
    var extra = calc.rows.filter(function (r) { return r.extra_sessions > 0; });
    if (extra.length) {
      var act = findRecord_('activities', String(getSetting_('log_extra_activity_id', '')));
      if (!act) throw new Error('Thang điểm chưa có hoạt động log vượt (Cài đặt log_extra_activity_id). Bạn kiểm tra tab Hoạt động nhé.');
      var added = insertRecords_('point_entries', extra.map(function (r) {
        return { member_id: r.member_id, activity_id: act.activity_id, points: Number(act.points) * r.extra_sessions, event_id: id, source: 'log_extra',
          source_id: id, awarded_at: now, awarded_by: me.memberId, is_cancelled: false };
      }), { termId: x.term.term_id });
      writeAuditMany_(me.memberId, 'add_points', 'point_entries', added.map(function (e) {
        return { rowId: e.entry_id, changes: [{ column: 'points', oldValue: '', newValue: e.points }] };
      }));
    }
    var closing = { status: 'closed', planned_sessions: calc.planned, actual_sessions: calc.actual, closed_by: me.memberId, closed_at: now };
    if (findRecord_('event_closings', id)) updateRecord_('event_closings', id, closing, { actorId: me.memberId, action: 'close_event' });
    else {
      closing.event_id = id;
      insertRecords_('event_closings', [closing]);
      writeAudit_({ actorId: me.memberId, action: 'close_event', table: 'event_closings', rowId: id }, [{ column: 'status', oldValue: '', newValue: 'closed' }]);
    }
  });
  return logBoardFor_(me, String(eventId));
}

/** Mở chốt để sửa: về Đang mở, huỷ điểm log vượt của lần chốt trước (chốt lại sẽ tính lại). Ghi Nhật ký. */
function reopenEvent(token, eventId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var c = findRecord_('event_closings', String(eventId || ''));
    if (!c || c.status !== 'closed') throw new Error('Sự kiện này đang mở rồi.');
    assertNotLocked_(c.closed_at, 'mở chốt sự kiện này');
    updateRecord_('event_closings', c.event_id, { status: 'open' }, { actorId: me.memberId, action: 'reopen_event' });
    cancelLogExtraPoints_(c.event_id, me.memberId, new Date());
  });
  return logBoardFor_(me, String(eventId));
}
