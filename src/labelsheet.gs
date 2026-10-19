/**
 * Cài đặt > Tài khoản và phân quyền > Core team và UCV: tải sheet Core team hoặc sheet UCV để gắn nhãn (CK-08).
 * Mỗi lần là danh sách đầy đủ hiện tại: người mới xuất hiện được gắn nhãn, người không còn thì nhãn có Đến ngày (vẫn là
 * thành viên bình thường; rời UCV thì mất hộp thư). Người trong sheet nối với thành viên bằng Email, và Họ và tên phải khớp.
 * Như sheet thành viên: xem trước, chép bản sheet sang Drive kèm tab _undo, hoàn tác lần mới nhất trong 7 ngày.
 */

var LABEL_SHEETS = {
  core_team: { name: 'Core team', how: true },
  ucv: { name: 'UCV', how: false }
};
var LABEL_HEADERS = { name: ['hovaten', 'hoten', 'ten'], email: ['email', 'gmail', 'diachiemail'], how: ['cachvaocoreteam', 'cachvao'] };

/** Đọc sheet Core team hoặc UCV. Trả về { people: [{ row, name, email, how }], errors }. */
function readLabelSheet_(values, type) {
  var head = -1, cols = {};
  for (var r = 0; r < Math.min(values.length, 15) && head < 0; r++) {
    var c = {};
    (values[r] || []).forEach(function (v, i) {
      var k = headerKey_(v);
      Object.keys(LABEL_HEADERS).forEach(function (f) { if (c[f] === undefined && LABEL_HEADERS[f].indexOf(k) >= 0) c[f] = i; });
    });
    if (c.name !== undefined && c.email !== undefined) { head = r; cols = c; }
  }
  if (head < 0) return { people: [], errors: ['Không thấy dòng tiêu đề có cột Họ và tên và cột Email.'] };
  var people = [], errors = [], seen = {};
  for (r = head + 1; r < values.length; r++) {
    var line = values[r] || [], cell = function (f) { return cols[f] === undefined ? '' : String(line[cols[f]] == null ? '' : line[cols[f]]).replace(/\s+/g, ' ').trim(); };
    var p = { row: r + 1, name: cell('name'), email: cell('email').toLowerCase(), how: LABEL_SHEETS[type].how ? cell('how') : '' };
    if (!p.name && !p.email) continue;
    if (!p.name || !p.email) { errors.push('Dòng ' + p.row + ': thiếu ' + (p.name ? 'email' : 'họ và tên') + '.'); continue; }
    if (seen[p.email]) { errors.push('Email ' + p.email + ' bị lặp (dòng ' + seen[p.email] + ' và ' + p.row + ').'); continue; }
    seen[p.email] = p.row;
    people.push(p);
  }
  return { people: people, errors: errors };
}

/** Kế hoạch một lần tải sheet Core team hoặc UCV, chưa ghi gì. req: { type, link, tab }. */
function labelSheetPlan_(req, now) {
  var type = String(req.type || '');
  if (!LABEL_SHEETS[type]) throw new Error('Chọn sheet Core team hoặc UCV.');
  var term = currentTerm_(readTable_('terms'));
  if (!term) throw new Error('Chưa có nhiệm kỳ nào. Tải danh sách thành viên trước đã.');
  var termId = String(term.term_id), src = rosterSource_(req.link, req.tab), read = readLabelSheet_(src.sh.getDataRange().getValues(), type);
  var data = peopleData_(), active = {}, byEmail = {}, names = namesById_(data.members);
  data.member_terms.forEach(function (r) { if (String(r.term_id) === termId && r.status === 'active') active[r.member_id] = true; });
  data.members.forEach(function (m) { if (m.email && active[m.member_id]) byEmail[String(m.email).toLowerCase()] = m; });
  var view = { type: type, typeName: LABEL_SHEETS[type].name, termLabel: termLabel_(termId), errors: read.errors.slice(), added: [], left: [], kept: 0, changed: [] };
  var inSheet = {}, how = {};
  read.people.forEach(function (p) {
    var m = byEmail[p.email];
    if (!m) return view.errors.push('Dòng ' + p.row + ' (' + p.name + '): không có thành viên đang ở CLB với email ' + p.email + '.');
    if (exactName_(m.full_name) !== exactName_(p.name) && foldText_(m.full_name) !== foldText_(p.name)) {
      return view.errors.push('Dòng ' + p.row + ': email ' + p.email + ' là của ' + m.full_name + ' trong app, nhưng sheet ghi ' + p.name + '.');
    }
    if (LABEL_SHEETS[type].how && !p.how) return view.errors.push('Dòng ' + p.row + ' (' + p.name + '): chưa ghi Cách vào core team.');
    inSheet[m.member_id] = true; how[m.member_id] = p.how;
  });
  var current = {}, ch = { adds: [], ends: [], edits: [] };
  data.member_labels.forEach(function (l) {
    if (l.label_type !== type || String(l.term_id) !== termId || !activeLabels_([l], l.member_id, termId, now).length) return;
    current[l.member_id] = l;
    if (!inSheet[l.member_id]) { ch.ends.push(l.label_id); view.left.push(names[l.member_id]); }
    else if (String(l.detail || '') !== how[l.member_id]) { ch.edits.push({ key: l.label_id, patch: { detail: how[l.member_id] }, old: l.detail || '' }); view.changed.push(names[l.member_id] + ': ' + how[l.member_id]); }
    else view.kept++;
  });
  Object.keys(inSheet).forEach(function (id) {
    if (current[id]) return;
    ch.adds.push({ member_id: id, term_id: termId, label_type: type, detail: how[id], start_date: now });
    view.added.push(names[id]);
  });
  if (view.changed.length) view.kept += view.changed.length;
  view.ready = !view.errors.length && (ch.adds.length + ch.ends.length + ch.edits.length > 0);
  if (!view.errors.length && !view.ready) view.noChange = true;
  return { type: type, termId: termId, src: src, view: view, changes: ch };
}

/** BOD xem trước sheet Core team hoặc UCV. */
function previewLabelSheet(token, req) {
  requireUser_(token, 'bod');
  return labelSheetPlan_(req || {}, new Date()).view;
}

/** Tải sheet Core team hoặc UCV. Trả về { summary, page }. */
function applyLabelSheet(token, req) {
  var me = requireUser_(token, 'bod');
  req = req || {};
  var summary = withLock_(function () {
    var now = new Date(), plan = labelSheetPlan_(req, now), v = plan.view, ch = plan.changes;
    if (!v.ready) throw new Error(v.noChange ? 'Sheet giống hệt danh sách đang có, không có gì để tải.' : 'Chưa tải được. Bấm Xem trước để xem còn gì cần sửa.');
    var copy = SpreadsheetApp.openById(DriveApp.getFileById(plan.src.ss.getId()).makeCopy('[APP] Bản sao ' + v.typeName + ' ' + plan.termId, rosterFolder_()).getId());
    var added = ch.adds.length ? insertRecords_('member_labels', ch.adds, { termId: plan.termId }) : [];
    writeUndo_(copy, { labels: { added: added.map(function (l) { return l.label_id; }), ended: ch.ends, edits: ch.edits.map(function (e) { return { id: e.key, detail: e.old }; }) } });
    if (ch.ends.length) updateRecords_('member_labels', ch.ends.map(function (id) { return { key: id, patch: { end_date: new Date(now.getTime() - 1) } }; }), { actorId: me.memberId, action: 'upload_sheet' });
    if (ch.edits.length) updateRecords_('member_labels', ch.edits.map(function (e) { return { key: e.key, patch: e.patch }; }), { actorId: me.memberId, action: 'upload_sheet' });
    var text = v.added.length + ' mới vào, ' + v.left.length + ' rời ' + v.typeName + ', ' + v.kept + ' giữ nguyên';
    var up = insertRecords_('roster_uploads', [{ term_id: plan.termId, sheet_type: plan.type, batch_type: '', uploaded_at: now, uploaded_by: me.memberId,
      copy_url: copy.getUrl(), summary: text, status: 'applied' }], { termId: plan.termId })[0];
    writeAudit_({ actorId: me.memberId, action: 'upload_sheet', table: 'roster_uploads', rowId: up.upload_id }, [{ column: 'summary', oldValue: '', newValue: text }]);
    return text;
  });
  return { summary: summary, page: rosterPageFor_() };
}

/** Hoàn tác một lần tải sheet Core team hoặc UCV (gọi từ undoRoster, trong khoá). */
function undoLabelSheet_(undo, me) {
  var l = undo.labels;
  l.added.forEach(function (id) { deleteRecord_('member_labels', id, { actorId: me.memberId, action: 'undo_upload' }); });
  if (l.ended.length) updateRecords_('member_labels', l.ended.map(function (id) { return { key: id, patch: { end_date: '' } }; }), { actorId: me.memberId, action: 'undo_upload' });
  if (l.edits.length) updateRecords_('member_labels', l.edits.map(function (e) { return { key: e.id, patch: { detail: e.detail } }; }), { actorId: me.memberId, action: 'undo_upload' });
}
