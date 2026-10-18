/**
 * Góp ý: thành viên gửi có tên hoặc ẩn danh, chỉ BOD đọc.
 * Ẩn danh thì không lưu gì về người gửi (không mã thành viên, chỉ ghi ngày, không ghi giờ).
 * BOD chỉ có một việc: đánh dấu góp ý có tên là đã áp dụng, app cộng +10 (tối đa 2 lần mỗi giai đoạn mỗi người).
 * Một BOD mở trang Góp ý là các góp ý chưa đọc chuyển sang đã đọc.
 */

var FEEDBACK_MAX_LENGTH = 2000;
var FEEDBACK_PER_MINUTE = 20;
var FEEDBACK_APPLY_LIMIT = 2;

/** Kiểm tra nội dung góp ý. Trả về câu báo lỗi, hoặc '' nếu được. */
function feedbackError_(content) {
  var s = String(content == null ? '' : content).trim();
  if (!s) return 'Bạn chưa viết góp ý.';
  if (s.length > FEEDBACK_MAX_LENGTH) return 'Góp ý dài quá ' + FEEDBACK_MAX_LENGTH + ' ký tự, bạn rút gọn giúp nhé.';
  return '';
}

/** Ngày hôm nay, 0 giờ (góp ý chỉ ghi ngày). */
function todayDate_() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Số lần góp ý của một người đã được áp dụng (còn hiệu lực) trong giai đoạn. */
function appliedFeedbackCount_(entries, memberId, range) {
  return entries.filter(function (e) {
    if (e.source !== 'feedback' || e.member_id !== memberId || e.is_cancelled || !e.awarded_at) return false;
    var ms = e.awarded_at.getTime();
    return ms >= range.from.getTime() && (!range.to || ms < range.to.getTime());
  }).length;
}

/** Trang Góp ý của người gửi: các góp ý có tên của mình (ẩn danh thì app không biết của ai nên không hiện). */
function myFeedbackFor_(me) {
  var term = currentTerm_(readTable_('terms'));
  return {
    isBod: false,
    limit: FEEDBACK_APPLY_LIMIT,
    mine: readTable_('feedback').filter(function (f) { return f.member_id === me.memberId; }).map(function (f) {
      return { id: f.feedback_id, content: f.content, date: f.sent_date ? f.sent_date.getTime() : null, read: !!f.is_read, applied: !!f.is_applied };
    }).reverse(),
    canEarn: !!term && ['phase_1', 'phase_2'].indexOf(phaseAt_(term, new Date())) >= 0
  };
}

/** Hộp góp ý của BOD. newIds: những góp ý chưa đọc lúc mở trang (vẫn hiện chữ Mới lần xem này). */
function feedbackInboxFor_(me, newIds) {
  var names = namesById_(me.data.members), term = currentTerm_(readTable_('terms'));
  var phase = phaseAt_(term, new Date()), range = phaseRange_(term, phase), entries = readTable_('point_entries');
  var activity = findRecord_('activities', String(getSetting_('feedback_activity_id', '')));
  var people = term ? pointPeople_(me.data, term.term_id) : {};
  return {
    isBod: true,
    limit: FEEDBACK_APPLY_LIMIT,
    points: activity ? Number(activity.points) || 0 : 0,
    canApply: !!range && !!activity,
    phaseLabel: PHASE_LABELS[phase] || '',
    items: readTable_('feedback').map(function (f) {
      var id = f.member_id || '';
      return {
        id: f.feedback_id, content: f.content, date: f.sent_date ? f.sent_date.getTime() : null,
        isNew: newIds.indexOf(f.feedback_id) >= 0 || !f.is_read,
        name: id ? names[id] || id : '', applied: !!f.is_applied, markedBy: f.marked_by ? names[f.marked_by] || f.marked_by : '',
        inClub: !!people[id], used: id && range ? appliedFeedbackCount_(entries, id, range) : 0
      };
    }).reverse()
  };
}

/** Gọi từ trang web khi mở Góp ý. BOD: hộp góp ý (đánh dấu đã đọc hết); người khác: chỗ gửi góp ý. */
function feedbackPage(token) {
  var me = requireUser_(token);
  if (!me.user.isBod) return myFeedbackFor_(me);
  var unread = [];
  withLock_(function () {
    var rows = readTable_('feedback').filter(function (f) { return !f.is_read; });
    unread = rows.map(function (f) { return f.feedback_id; });
    if (rows.length) updateRecords_('feedback', rows.map(function (f) { return { key: f.feedback_id, patch: { is_read: true } }; }));
  });
  return feedbackInboxFor_(me, unread);
}

/** Gửi góp ý. f: { content, named }. BOD không gửi góp ý ở đây (BOD là người đọc). */
function sendFeedback(token, f) {
  var me = requireUser_(token);
  if (me.user.isBod) throw new Error('BOD đọc góp ý ở trang này, không gửi góp ý.');
  f = f || {};
  var err = feedbackError_(f.content);
  if (err) throw new Error(err);
  var cache = CacheService.getScriptCache(), count = Number(cache.get('feedback_minute') || 0);
  if (count >= FEEDBACK_PER_MINUTE) throw new Error('Đang có nhiều góp ý gửi cùng lúc, bạn thử lại sau một phút nhé.');
  cache.put('feedback_minute', String(count + 1), 60);
  var term = requireTerm_();
  insertRecords_('feedback', [{
    content: String(f.content).trim(), is_anonymous: !f.named, member_id: f.named ? me.memberId : '',
    sent_date: todayDate_(), is_read: false, is_applied: false, marked_by: ''
  }], { termId: term.term_id });
  return myFeedbackFor_(me);
}

/** BOD đánh dấu góp ý có tên là đã áp dụng: cộng điểm cho người gửi. */
function applyFeedback(token, feedbackId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var f = findRecord_('feedback', String(feedbackId || ''));
    if (!f) throw new Error('Không tìm thấy góp ý này.');
    if (!f.member_id) throw new Error('Góp ý ẩn danh chỉ để đọc, không đánh dấu được.');
    if (f.is_applied) throw new Error('Góp ý này đã được đánh dấu áp dụng.');
    var now = new Date(), term = currentTerm_(readTable_('terms')), phase = phaseAt_(term, now), range = phaseRange_(term, phase);
    if (!range) throw new Error('Đang ở giai đoạn giao thoa nên chưa cộng điểm góp ý được.');
    var act = findRecord_('activities', String(getSetting_('feedback_activity_id', '')));
    if (!act) throw new Error('Thang điểm chưa có hoạt động góp ý. Kiểm tra dòng feedback_activity_id ở tab Cài đặt.');
    if (!pointPeople_(peopleData_(), term.term_id)[f.member_id]) throw new Error('Người gửi góp ý này không còn ở CLB nên không cộng điểm được.');
    var used = appliedFeedbackCount_(readTable_('point_entries'), f.member_id, range);
    if (used >= FEEDBACK_APPLY_LIMIT) {
      throw new Error('Người này đã có ' + FEEDBACK_APPLY_LIMIT + ' góp ý được áp dụng trong ' + PHASE_LABELS[phase] + ', theo quy chế không cộng thêm.');
    }
    var entry = insertRecords_('point_entries', [{ member_id: f.member_id, activity_id: act.activity_id, points: Number(act.points), event_id: '',
      source: 'feedback', source_id: f.feedback_id, awarded_at: now, awarded_by: me.memberId, is_cancelled: false }], { termId: term.term_id })[0];
    writeAudit_({ actorId: me.memberId, action: 'add_points', table: 'point_entries', rowId: entry.entry_id },
      [{ column: 'points', oldValue: '', newValue: entry.points }]);
    updateRecord_('feedback', f.feedback_id, { is_applied: true, marked_by: me.memberId, is_read: true }, { actorId: me.memberId, action: 'apply_feedback' });
  });
  return feedbackInboxFor_(me, []);
}

/** Bỏ đánh dấu áp dụng (bấm nhầm): huỷ dòng điểm đã cộng. */
function unapplyFeedback(token, feedbackId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var f = findRecord_('feedback', String(feedbackId || ''));
    if (!f || !f.is_applied) throw new Error('Góp ý này chưa được đánh dấu áp dụng.');
    var now = new Date();
    var rows = readTable_('point_entries').filter(function (e) { return e.source === 'feedback' && e.source_id === f.feedback_id && !e.is_cancelled; });
    updateRecords_('point_entries', rows.map(function (e) {
      return { key: e.entry_id, patch: { is_cancelled: true, cancelled_by: me.memberId, cancelled_at: now } };
    }), { actorId: me.memberId, action: 'cancel_points' });
    updateRecord_('feedback', f.feedback_id, { is_applied: false, marked_by: '' }, { actorId: me.memberId, action: 'apply_feedback' });
  });
  return feedbackInboxFor_(me, []);
}
