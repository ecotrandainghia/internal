/**
 * Cộng điểm (chỉ BOD): chọn hoạt động trong thang điểm, tick người được cộng, app chép mức điểm vào từng dòng.
 * Chỉ cộng, không trừ: cộng nhầm thì huỷ dòng đó (ghi Nhật ký). Hoạt động chỉ có một lần thì chọn "Hoạt động khác",
 * app tạo dòng Hoạt động mới đang tắt để không làm chật danh sách chọn.
 * React, comment (seeding), góp ý và log vượt do app tự cộng ở chỗ khác nên không chọn tay được ở đây.
 */

var AUTO_ACTIVITIES = ['react', 'comment', 'feedback', 'log_extra'];
var AUTO_LABELS = {
  react: ['React bài đăng', 'Seeding, mỗi bài một lần'],
  comment: ['Comment bài đăng', 'Seeding, mỗi bài một lần'],
  feedback: ['Góp ý được áp dụng', 'Khi BOD áp dụng góp ý'],
  log_extra: ['Mỗi buổi log vượt', 'Khi chốt sự kiện, buổi 90 phút']
};
var POINT_SOURCES = { manual: 'Cộng tay', seeding: 'Seeding', log_extra: 'Log vượt', feedback: 'Góp ý' };

/** Mã các hoạt động app tự cộng. */
function autoActivityIds_() {
  return AUTO_ACTIVITIES.map(function (a) { return String(getSetting_(a + '_activity_id', '')); }).filter(String);
}

/** Người được cộng điểm: đang ở CLB trong nhiệm kỳ, không phải BOD. { Mã TV: { name, dept, subTeam } }. */
function pointPeople_(data, termId) {
  var people = activePeople_(data, termId);
  Object.keys(people).forEach(function (id) { if (people[id].dept === 'BOD') delete people[id]; });
  return people;
}

/** Các lần cộng gần đây, gom theo lần bấm: cùng lúc, cùng hoạt động, cùng người cộng, cùng sự kiện. */
function pointBatches_(entries, c, limit) {
  var groups = {}, order = [];
  entries.forEach(function (e) {
    if (!e.awarded_at) return;
    var k = [e.awarded_at.getTime(), e.activity_id, e.awarded_by, e.event_id, e.source].join('|');
    if (!groups[k]) {
      var act = c.activities[e.activity_id];
      groups[k] = { key: k, at: e.awarded_at.getTime(), activity: act ? act.name : e.activity_id, points: Number(e.points) || 0,
        event: c.events[e.event_id] || '', by: c.names[e.awarded_by] || e.awarded_by || '', source: POINT_SOURCES[e.source] || '', entries: [] };
      order.push(groups[k]);
    }
    groups[k].entries.push({ id: e.entry_id, name: c.names[e.member_id] || e.member_id, points: Number(e.points) || 0, cancelled: !!e.is_cancelled });
  });
  order.sort(function (a, b) { return b.at - a.at; });
  return order.slice(0, limit).map(function (g) {
    g.entries.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
    g.active = g.entries.filter(function (x) { return !x.cancelled; }).length;
    return g;
  });
}

function pointsPageFor_(me) {
  var now = new Date(), term = currentTerm_(readTable_('terms'));
  var termId = term ? String(term.term_id) : '', phase = phaseAt_(term, now);
  var events = readTable_('events').filter(function (e) { return String(e.term_id) === termId; });
  var activities = readTable_('activities'), auto = autoActivityIds_();
  var c = { names: namesById_(me.data.members), events: {}, activities: {} };
  events.forEach(function (e) { c.events[e.event_id] = e.name; });
  activities.forEach(function (a) { c.activities[a.activity_id] = a; });
  var people = pointPeople_(me.data, termId), entries = readTable_('point_entries');
  var range = phaseRange_(term, phase), sums = range ? pointsBetween_(entries, range.from, range.to) : {};
  var depts = {};
  Object.keys(people).forEach(function (id) { depts[people[id].dept] = true; });
  var order = readTable_('departments').sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).map(function (d) { return d.dept_code; });
  return {
    now: now.getTime(),
    term: term ? { label: termLabel_(termId), phase: phase, phaseLabel: PHASE_LABELS[phase] || '' } : null,
    canAdd: phase === 'phase_1' || phase === 'phase_2',
    activities: activities.filter(function (a) { return a.is_active && auto.indexOf(a.activity_id) < 0; }).map(function (a) {
      return { id: a.activity_id, name: a.name, points: Number(a.points) || 0, limit: a.limit_note || '' };
    }),
    autoActivities: AUTO_ACTIVITIES.map(function (k) {
      var a = c.activities[String(getSetting_(k + '_activity_id', ''))];
      return { key: k, name: AUTO_LABELS[k][0], hint: AUTO_LABELS[k][1], points: a ? Number(a.points) || 0 : 0 };
    }),
    events: events.map(function (e) { return { id: e.event_id, name: e.name }; }),
    depts: order.filter(function (d) { return depts[d]; }),
    members: Object.keys(people).map(function (id) {
      var p = people[id];
      return { id: id, name: p.name, dept: p.dept, subTeam: p.subTeam, points: sums[id] || 0 };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); }),
    recent: pointBatches_(entries.filter(function (e) {
      return !termId || String(e.entry_id).indexOf('-' + termId + '-') > 0;
    }), c, 15)
  };
}

/** Gọi từ trang web khi mở Cộng điểm. */
function pointsPage(token) {
  return pointsPageFor_(requireUser_(token, 'bod'));
}

/**
 * Cộng điểm. f: { activityId, other: { name, points } (khi chọn Hoạt động khác), eventId (không bắt buộc), memberIds }.
 * Trả về dữ liệu trang mới.
 */
function addPoints(token, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  withLock_(function () {
    var now = new Date(), term = currentTerm_(readTable_('terms'));
    var phase = phaseAt_(term, now);
    if (phase !== 'phase_1' && phase !== 'phase_2') throw new Error('Đang ở giai đoạn giao thoa nên chưa cộng điểm được.');
    var act;
    if (f.other) {
      var name = String(f.other.name || '').trim(), pts = Number(f.other.points);
      if (!name) throw new Error('Bạn chưa nhập tên hoạt động.');
      if (!(pts > 0) || Math.round(pts) !== pts) throw new Error('Số điểm phải là số nguyên lớn hơn 0.');
      act = insertRecords_('activities', [{ name: name, points: pts, limit_note: 'Hoạt động khác, chỉ có một lần', added_date: now, is_active: false }])[0];
    } else {
      act = findRecord_('activities', String(f.activityId || ''));
      if (!act || !act.is_active) throw new Error('Bạn chọn một hoạt động trong thang điểm nhé.');
      if (autoActivityIds_().indexOf(act.activity_id) >= 0) throw new Error('Hoạt động này app tự cộng, không cộng tay ở đây.');
    }
    var eventId = String(f.eventId || '');
    if (eventId) {
      var ev = findRecord_('events', eventId);
      if (!ev || String(ev.term_id) !== String(term.term_id)) throw new Error('Sự kiện này không thuộc nhiệm kỳ hiện tại.');
    }
    var people = pointPeople_(peopleData_(), term.term_id), ids = [];
    (f.memberIds || []).forEach(function (id) { if (ids.indexOf(String(id)) < 0) ids.push(String(id)); });
    if (!ids.length) throw new Error('Bạn chưa chọn người được cộng điểm.');
    ids.forEach(function (id) { if (!people[id]) throw new Error('Có người được chọn không còn ở CLB hoặc là BOD. Bạn tải lại trang nhé.'); });
    var added = insertRecords_('point_entries', ids.map(function (id) {
      return { member_id: id, activity_id: act.activity_id, points: Number(act.points), event_id: eventId, source: 'manual',
        awarded_at: now, awarded_by: me.memberId, is_cancelled: false };
    }), { termId: term.term_id });
    writeAuditMany_(me.memberId, 'add_points', 'point_entries', added.map(function (e) {
      return { rowId: e.entry_id, changes: [{ column: 'points', oldValue: '', newValue: e.points }] };
    }));
  });
  return pointsPageFor_(me);
}

/** Huỷ một hoặc nhiều dòng cộng điểm (cộng nhầm). Dòng vẫn còn trong sheet, đánh dấu Đã huỷ, ghi Nhật ký. */
function cancelPoints(token, entryIds) {
  var me = requireUser_(token, 'bod');
  var ids = (entryIds || []).map(String);
  if (!ids.length) throw new Error('Bạn chưa chọn dòng điểm nào.');
  withLock_(function () {
    var now = new Date();
    var rows = readTable_('point_entries').filter(function (e) { return ids.indexOf(e.entry_id) >= 0 && !e.is_cancelled; });
    rows.forEach(function (e) { assertNotLocked_(e.awarded_at, 'huỷ điểm đã cộng'); });
    updateRecords_('point_entries', rows.map(function (e) {
      return { key: e.entry_id, patch: { is_cancelled: true, cancelled_by: me.memberId, cancelled_at: now } };
    }), { actorId: me.memberId, action: 'cancel_points' });
  });
  return pointsPageFor_(me);
}

/** Thêm hoạt động vào thang điểm (phải công bố mức điểm trước khi hoạt động diễn ra). */
function addActivity(token, f) {
  var me = requireUser_(token, 'bod');
  f = f || {};
  var name = String(f.name || '').trim(), pts = Number(f.points);
  if (!name) throw new Error('Bạn chưa nhập tên hoạt động.');
  if (!(pts > 0) || Math.round(pts) !== pts) throw new Error('Số điểm phải là số nguyên lớn hơn 0.');
  withLock_(function () {
    var same = readTable_('activities').filter(function (a) { return a.is_active && a.name.trim().toLowerCase() === name.toLowerCase(); });
    if (same.length) throw new Error('Thang điểm đã có hoạt động này.');
    insertRecords_('activities', [{ name: name, points: pts, limit_note: String(f.limitNote || '').trim(), added_date: new Date(), is_active: true }]);
  });
  return pointsPageFor_(me);
}

/** Sửa số điểm của hoạt động app tự cộng (react, comment, góp ý, log vượt). Điểm đã cộng trước đó giữ nguyên. */
function setAutoPoints(token, key, points) {
  var me = requireUser_(token, 'bod'), pts = Number(points);
  if (AUTO_ACTIVITIES.indexOf(key) < 0) throw new Error('Không có mục điểm này.');
  if (!(pts > 0) || Math.round(pts) !== pts) throw new Error('Số điểm phải là số nguyên lớn hơn 0.');
  withLock_(function () {
    linkAutoActivities_();
    updateRecord_('activities', String(getSetting_(key + '_activity_id', '')), { points: pts }, { actorId: me.memberId, action: 'set_auto_points' });
  });
  return pointsPageFor_(me);
}

/** Ẩn hoạt động khỏi danh sách chọn (dòng cũ và điểm đã cộng vẫn giữ). Hoạt động app tự cộng thì không ẩn được. */
function hideActivity(token, activityId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var a = findRecord_('activities', String(activityId || ''));
    if (!a) throw new Error('Không tìm thấy hoạt động này.');
    if (autoActivityIds_().indexOf(a.activity_id) >= 0) throw new Error('Hoạt động này app tự cộng nên không ẩn được.');
    updateRecord_('activities', a.activity_id, { is_active: false });
  });
  return pointsPageFor_(me);
}
