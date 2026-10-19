/**
 * Cài đặt > Tài khoản và phân quyền > Tải danh sách thành viên, và nút Kết thúc nhiệm kỳ.
 * BOD dán link sheet thành viên, chọn loại đợt (Oday, Đợt 1, Đợt 2, Cập nhật), xem trước rồi tải. Tải đợt 1 mở GD1, tải đợt 2
 * đóng GD1 (chụp kết quả) và mở GD2; Kết thúc nhiệm kỳ đóng GD2 và mở nhiệm kỳ mới ở giai đoạn giao thoa.
 * App nhận ra người cũ theo Họ và tên, trùng tên thì so Ngày sinh; tên gần giống thì hỏi BOD. Không xoá ai: người không còn
 * trong sheet thành Đã rời. Bản sheet được chép sang Drive, kèm tab _undo ghi trạng thái trước khi tải để hoàn tác.
 */

var ROSTER_FOLDER = 'Bản sao sheet đã tải';
var ROSTER_UNDO_DAYS = 7;
var ROSTER_BATCH = { oday: 'OD', batch_1: 'D1', batch_2: 'D2' };
var ROSTER_HEADERS = {
  name: ['hovaten', 'hoten', 'ten'], birth: ['ngaysinh'], email: ['email', 'gmail', 'diachiemail'], phone: ['sodienthoai', 'sdt', 'dienthoai'],
  fbName: ['tenfacebook', 'facebook', 'tenfb'], fbUrl: ['linkfacebook', 'linkfb'], dept: ['ban'], sub: ['mang'], cls: ['lop'], position: ['chucvu']
};
var ROSTER_FIELDS = { birth: 'birth_date', email: 'email', phone: 'phone', fbName: 'facebook_name', fbUrl: 'facebook_url' };

/* ---------- Đọc sheet (không đụng tới Google) ---------- */

/** Tên để so khớp chính xác: viết thường, gộp khoảng trắng, giữ dấu. */
function exactName_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/** Ngày sinh trong ô: ô ngày, hoặc chữ dd/mm/yyyy. Không đọc được thì null. */
function cellDate_(v) {
  if (v && typeof v.getTime === 'function') return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(String(v || '').trim());
  if (!m) return null;
  var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}

function sameDay_(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/**
 * Đọc bảng thành viên: dòng tiêu đề (trong 15 dòng đầu) phải có Họ và tên và Ban. Cột thiếu thì giữ giá trị cũ trong app.
 * Trả về { people: [{ row, name, birth, email, ... }], cols: { tên: số cột }, errors: [câu báo lỗi] }.
 */
function readRoster_(values) {
  var head = -1, cols = {};
  for (var r = 0; r < Math.min(values.length, 15) && head < 0; r++) {
    var c = {};
    (values[r] || []).forEach(function (v, i) {
      var k = headerKey_(v);
      Object.keys(ROSTER_HEADERS).forEach(function (f) { if (c[f] === undefined && ROSTER_HEADERS[f].indexOf(k) >= 0) c[f] = i; });
    });
    if (c.name !== undefined && c.dept !== undefined) { head = r; cols = c; }
  }
  if (head < 0) return { people: [], cols: {}, errors: ['Không thấy dòng tiêu đề có cột Họ và tên và cột Ban.'] };
  var people = [], errors = [], seen = {}, emails = {};
  var cell = function (line, f) { return cols[f] === undefined ? undefined : line[cols[f]]; };
  var text = function (line, f) { var v = cell(line, f); return v === undefined ? undefined : String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); };
  for (r = head + 1; r < values.length; r++) {
    var line = values[r] || [], name = text(line, 'name');
    if (!name) continue;
    var p = { row: r + 1, name: name, dept: String(text(line, 'dept') || '').toUpperCase() };
    ['email', 'phone', 'fbName', 'fbUrl', 'sub', 'cls', 'position'].forEach(function (f) { p[f] = text(line, f); });
    if (p.email !== undefined) p.email = p.email.toLowerCase();
    if (p.sub !== undefined) p.sub = p.sub.toUpperCase();
    var b = cell(line, 'birth');
    p.birth = b === undefined ? undefined : b === '' || b === null ? null : cellDate_(b);
    if (b !== undefined && b !== '' && b !== null && !p.birth) errors.push('Dòng ' + p.row + ' (' + name + '): ngày sinh "' + b + '" không đọc được, ghi dạng ngày/tháng/năm.');
    if (!p.dept) errors.push('Dòng ' + p.row + ' (' + name + '): chưa có ban.');
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) errors.push('Dòng ' + p.row + ' (' + name + '): email "' + p.email + '" không hợp lệ.');
    if (p.email && emails[p.email]) errors.push('Email ' + p.email + ' bị trùng (dòng ' + emails[p.email] + ' và ' + p.row + ').');
    if (p.email) emails[p.email] = p.row;
    var k = exactName_(name) + '|' + (p.birth ? p.birth.getTime() : '');
    if (seen[k]) errors.push('Dòng ' + p.row + ': ' + name + ' bị lặp với dòng ' + seen[k] + '. Hai người trùng tên thì ghi ngày sinh để phân biệt.');
    seen[k] = p.row;
    people.push(p);
  }
  if (!people.length && !errors.length) errors.push('Sheet không có ai.');
  return { people: people, cols: cols, errors: errors };
}

/** Số bước sửa chữ để đi từ a tới b (Levenshtein), dừng sớm khi vượt max. */
function editDistance_(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  var prev = [], cur, i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    var best = i;
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Nhận ra từng người trong sheet là ai trong app. decisions: { số dòng: Mã TV hoặc 'new' } BOD đã chọn cho các dòng cần hỏi.
 * Trả về [{ person, memberId (rỗng là người mới), ask: [{ id, name, birth }] }]; ask khác rỗng là cần BOD chọn.
 */
function matchRoster_(people, members, decisions) {
  decisions = decisions || {};
  var taken = {}, byExact = {};
  members.forEach(function (m) { (byExact[exactName_(m.full_name)] = byExact[exactName_(m.full_name)] || []).push(m); });
  var view = function (m) { return { id: m.member_id, name: m.full_name, birth: m.birth_date ? m.birth_date.getTime() : null }; };
  var out = people.map(function (p) {
    var d = decisions[p.row];
    if (d === 'new') return { person: p, memberId: '', ask: [] };
    if (d && members.some(function (m) { return m.member_id === d; })) { taken[d] = true; return { person: p, memberId: d, ask: [], decided: true }; }
    return { person: p };
  });
  // Khớp chắc trước (đúng tên, và đúng ngày sinh khi có nhiều người trùng tên), rồi mới tới người gần giống.
  out.forEach(function (x) {
    if (x.memberId !== undefined) return;
    var same = (byExact[exactName_(x.person.name)] || []).filter(function (m) { return !taken[m.member_id]; });
    if (same.length > 1 && x.person.birth) same = same.filter(function (m) { return sameDay_(m.birth_date, x.person.birth); });
    if (same.length === 1 && (!x.person.birth || !same[0].birth_date || sameDay_(same[0].birth_date, x.person.birth))) {
      x.memberId = same[0].member_id; x.ask = []; taken[x.memberId] = true;
    } else if (same.length) {
      x.ask = same.map(view);
    }
  });
  out.forEach(function (x) {
    if (x.memberId !== undefined || x.ask) return;
    var f = foldText_(x.person.name);
    var near = members.filter(function (m) {
      if (taken[m.member_id]) return false;
      var g = foldText_(m.full_name);
      return g === f || (f.length >= 6 && editDistance_(f, g, 2) <= 2);
    });
    x.ask = near.map(view);
    if (!near.length) x.memberId = '';
  });
  out.forEach(function (x) { if (x.memberId === undefined) x.memberId = null; x.ask = x.ask || []; });
  return out;
}

/* ---------- Nhiệm kỳ, giai đoạn ---------- */

/** Nhiệm kỳ kế tiếp: 2627 → 2728. */
function nextTermId_(termId) {
  var s = String(termId), a = Number(s.slice(2, 4)), two = function (n) { return (n < 10 ? '0' : '') + n; };
  return two(a) + two((a + 1) % 100);
}

/** Nhiệm kỳ liền trước nhiệm kỳ termId (có trong danh sách), hoặc ''. */
function previousTermId_(terms, termId) {
  var best = '';
  terms.forEach(function (t) { var id = String(t.term_id); if (id < String(termId) && id > best) best = id; });
  return best;
}

/** Loại đợt có tải được lúc này không. Trả về '' hoặc câu báo lỗi. */
function batchBlock_(kind, term) {
  var phase = term ? phaseAt_(term, new Date()) : '';
  if (kind === 'oday') return term && term.phase1_start_at ? 'Oday chỉ tải sau khi bấm Kết thúc nhiệm kỳ cũ (nhiệm kỳ này đã sang ' + PHASE_LABELS[phase] + ').' : '';
  if (kind === 'batch_1') return term && term.phase1_start_at ? 'Nhiệm kỳ này đã tải đợt 1 rồi. Muốn sửa danh sách thì chọn Cập nhật.' : '';
  if (kind === 'batch_2') {
    if (!term || !term.phase1_start_at) return 'Chưa tải đợt 1 nên chưa tải đợt 2 được.';
    return term.phase2_start_at ? 'Nhiệm kỳ này đã tải đợt 2 rồi. Muốn sửa danh sách thì chọn Cập nhật.' : '';
  }
  if (kind === 'update') return term ? '' : 'Chưa có nhiệm kỳ nào. Lần đầu thì tải Oday hoặc đợt 1.';
  return 'Loại đợt không hợp lệ.';
}

/**
 * Những việc còn sót của một giai đoạn, phải xong trước khi đóng nó (tải đợt 2, Kết thúc nhiệm kỳ): task chưa có kết quả,
 * sự kiện chưa chốt, bài seeding chưa ghi nhận. Trả về danh sách câu.
 */
function phaseBlockers_(term, phase, now) {
  var range = phaseRange_(term, phase), out = [];
  if (!range) return out;
  var termId = String(term.term_id), events = {}, closings = {};
  readTable_('event_closings').forEach(function (c) { closings[c.event_id] = c; });
  readTable_('events').forEach(function (e) {
    if (String(e.term_id) !== termId) return;
    events[e.event_id] = e;
    if (inRange_(eventDate_(e, closings[e.event_id]), range) && !(closings[e.event_id] && closings[e.event_id].status === 'closed')) {
      out.push('Sự kiện “' + e.name + '” chưa chốt');
    }
  });
  var notDone = getNumberSetting_('not_done_after_hours', 24), tasks = {}, waiting = {};
  readTable_('tasks').forEach(function (t) { if (events[t.event_id] && !t.is_cancelled && t.is_counted && inRange_(taskDate_(t), range)) tasks[t.task_id] = t; });
  readTable_('task_assignments').forEach(function (a) {
    var t = tasks[a.task_id];
    if (!t) return;
    var r = taskResult_(taskTiming_(t, a, now, notDone), a.quality);
    if (r === 'waiting' || r === '') waiting[t.task_id] = (waiting[t.task_id] || 0) + 1;
  });
  Object.keys(waiting).forEach(function (id) { out.push('Task “' + tasks[id].name + '” còn ' + waiting[id] + ' người chưa có kết quả'); });
  readTable_('seeding_posts').forEach(function (p) {
    if (p.status !== 'recorded' && String(p.post_id).indexOf('-' + termId + '-') > 0 && inRange_(p.created_at, range)) out.push('Bài seeding ' + p.post_url + ' chưa ghi nhận');
  });
  return out;
}

/** Top của giai đoạn sắp đóng, để BOD xem lại trước khi bấm. */
function closingTop_(term, phase) {
  var range = phaseRange_(term, phase);
  if (!range) return [];
  var data = peopleData_(), names = namesById_(data.members);
  var list = rankList_(rankedMembers_(data.members, data.member_terms, term.term_id, phase), pointsBetween_(readTable_('point_entries'), range.from, range.to));
  var top = topIds_(list, getNumberSetting_('top_reward_percent', 15));
  return list.filter(function (x) { return top[x.memberId]; }).map(function (x) { return { name: names[x.memberId], points: x.points, rank: x.rank }; });
}

/* ---------- Xem trước và tải ---------- */

function rosterSource_(link, tab) {
  var id = idFromUrl_(link), ss;
  if (!id) throw new Error('Bạn dán link Google Sheets của danh sách thành viên nhé.');
  try { ss = SpreadsheetApp.openById(id); } catch (e) { throw new Error('Không mở được sheet. Kiểm tra link và chia sẻ sheet cho tài khoản Google của CLB.'); }
  var sh = tab ? ss.getSheetByName(String(tab).trim()) : ss.getSheets()[0];
  if (!sh) throw new Error('Không thấy tab "' + tab + '" trong sheet.');
  return { ss: ss, sh: sh };
}

/**
 * Tính mọi thay đổi của một lần tải, chưa ghi gì. req: { kind, link, tab, decisions }.
 * Trả về kế hoạch kèm phần hiện cho BOD (view).
 */
function rosterPlan_(me, req, now) {
  var kind = String(req.kind || ''), terms = readTable_('terms'), term = currentTerm_(terms);
  var block = batchBlock_(kind, term);
  if (block) throw new Error(block);
  var src = rosterSource_(req.link, req.tab), read = readRoster_(src.sh.getDataRange().getValues());
  var data = peopleData_(), termId = term ? String(term.term_id) : '';
  if (!termId) { // lần tải đầu tiên: nhiệm kỳ của BOD đầu tiên
    var mine = latestTermRow_(data.member_terms, me.memberId);
    termId = mine ? String(mine.term_id) : termIdForDate_(now);
  }
  var view = { kind: kind, termId: termId, termLabel: termLabel_(termId), errors: read.errors.slice(), deptProblems: [], ask: [], blockers: [], top: [],
    added: [], stayed: 0, left: [], moved: [], edited: 0, noEmail: [], phaseText: '' };
  // Ban trong sheet phải có trong Cơ cấu và đang dùng
  var depts = {}, count = {};
  readTable_('departments').forEach(function (d) { depts[d.dept_code] = d; });
  read.people.forEach(function (p) { if (p.dept && (!depts[p.dept] || !depts[p.dept].is_active)) count[p.dept] = (count[p.dept] || 0) + 1; });
  view.deptProblems = Object.keys(count).map(function (c) { return { code: c, people: count[c], inactive: !!depts[c] }; });
  var matched = matchRoster_(read.people, data.members, req.decisions);
  view.ask = matched.filter(function (x) { return x.memberId === null; }).map(function (x) {
    return { row: x.person.row, name: x.person.name, birth: x.person.birth ? x.person.birth.getTime() : null, choices: x.ask };
  });
  if (kind === 'batch_2') { view.blockers = phaseBlockers_(term, 'phase_1', now); view.top = closingTop_(term, 'phase_1'); }
  view.phaseText = kind === 'batch_1' ? 'Mở GD1 của nhiệm kỳ ' + view.termLabel + ': từ lúc này bắt đầu tính điểm và KPI.'
    : kind === 'batch_2' ? 'Đóng GD1 (app chụp lại kết quả, sau đó không sửa được điểm, KPI của GD1) và mở GD2 của nhiệm kỳ ' + view.termLabel + '.'
    : kind === 'oday' ? 'Vẫn ở giai đoạn giao thoa. Ai không có trong sheet thì mất tài khoản ngay, riêng BOD cũ giữ tới lúc tải đợt 1.'
    : 'Không đổi giai đoạn.';
  var plan = { kind: kind, term: term, termId: termId, src: src, read: read, matched: matched, view: view, data: data };
  if (view.errors.length || view.deptProblems.length || view.ask.length || view.blockers.length) { view.ready = false; return plan; }
  buildRosterChanges_(plan, me, now);
  view.ready = !view.errors.length;
  return plan;
}

/** Các dòng sẽ thêm, sửa của một lần tải (đã khớp xong người). Ghi vào plan.changes và phần hiện. */
function buildRosterChanges_(plan, me, now) {
  var data = plan.data, termId = plan.termId, view = plan.view, kind = plan.kind;
  var byId = {}, rowOf = {}, ids = data.members.map(function (m) { return m.member_id; });
  data.members.forEach(function (m) { byId[m.member_id] = m; });
  data.member_terms.forEach(function (r) { if (String(r.term_id) === termId) rowOf[r.member_id] = r; });
  var phase = plan.term ? phaseAt_(plan.term, now) : '';
  var batch = ROSTER_BATCH[kind] || (phase === 'phase_2' ? 'D2' : phase === 'phase_1' ? 'D1' : 'OD');
  var ch = { members: [], memberEdits: [], accounts: [], termAdds: [], termEdits: [], leaves: [] }, inSheet = {};
  plan.matched.forEach(function (x) {
    var p = x.person, id = x.memberId;
    if (!id) {
      id = formatMemberId_(termId, batch, nextMemberSeq_(termId, batch, ids));
      ids.push(id);
      var rec = { member_id: id, full_name: p.name, join_batch: batch, join_term_id: termId };
      Object.keys(ROSTER_FIELDS).forEach(function (f) { if (p[f]) rec[ROSTER_FIELDS[f]] = p[f]; });
      ch.members.push(rec);
      ch.accounts.push({ member_id: id, theme: 'system', notify_zalo: true, notify_app: false, self_remind: false });
      view.added.push(p.name);
    } else {
      var m = byId[id], patch = {};
      if (m.full_name !== p.name) patch.full_name = p.name;
      Object.keys(ROSTER_FIELDS).forEach(function (f) {
        var v = p[f], col = ROSTER_FIELDS[f], old = m[col];
        if (v === undefined || v === null || v === '') return; // ô trống hoặc thiếu cột: giữ giá trị cũ
        if (f === 'birth' ? !sameDay_(old, v) : String(old || '') !== String(v)) patch[col] = v;
      });
      if (Object.keys(patch).length) ch.memberEdits.push({ key: id, patch: patch });
      if (!data.accounts.some(function (a) { return a.member_id === id; })) ch.accounts.push({ member_id: id, theme: 'system', notify_zalo: true, notify_app: false, self_remind: false });
    }
    inSheet[id] = true;
    var email = p.email || (byId[id] && byId[id].email);
    if (!email) view.noEmail.push(p.name);
    var row = { dept_code: p.dept, status: 'active', left_date: '' };
    if (p.sub !== undefined) row.sub_team = p.sub;
    if (p.cls !== undefined) row.class_name = p.cls;
    if (p.position !== undefined) row.position = p.position;
    var had = rowOf[id];
    if (!had) { row.member_id = id; row.term_id = termId; ch.termAdds.push(row); view.stayed += byId[id] ? 1 : 0; }
    else {
      var tp = {};
      Object.keys(row).forEach(function (k) { if (String(had[k] == null ? '' : had[k]) !== String(row[k])) tp[k] = row[k]; });
      if (had.dept_code !== p.dept && had.status === 'active') view.moved.push(p.name + ': ' + had.dept_code + ' → ' + p.dept);
      if (Object.keys(tp).length) ch.termEdits.push({ key: { member_id: id, term_id: termId }, patch: tp });
      view.stayed++;
    }
  });
  view.edited = ch.memberEdits.length;
  var names = namesById_(data.members);
  // Người đang ở nhiệm kỳ này mà không còn trong sheet: Đã rời
  Object.keys(rowOf).forEach(function (id) {
    if (inSheet[id] || rowOf[id].status !== 'active') return;
    ch.termEdits.push({ key: { member_id: id, term_id: termId }, patch: { status: 'left', left_date: now } });
    ch.leaves.push(id); view.left.push(names[id]);
  });
  // Người của nhiệm kỳ trước không có trong sheet Oday, đợt 1: thêm dòng Đã rời ở nhiệm kỳ này để mất tài khoản (BOD cũ giữ tới đợt 1)
  if (kind === 'oday' || kind === 'batch_1') {
    var prev = previousTermId_(readTable_('terms'), termId);
    data.member_terms.forEach(function (r) {
      if (String(r.term_id) !== prev || r.status !== 'active' || inSheet[r.member_id] || rowOf[r.member_id]) return;
      if (kind === 'oday' && r.dept_code === 'BOD') return;
      ch.termAdds.push({ member_id: r.member_id, term_id: termId, dept_code: r.dept_code, class_name: r.class_name, status: 'left', left_date: now });
      ch.leaves.push(r.member_id); view.left.push(names[r.member_id]);
    });
  }
  // Người đang tải phải còn là BOD sau khi tải, không thì không ai vào Cài đặt được nữa
  var meRow = plan.matched.filter(function (x) { return x.memberId === me.memberId; })[0];
  var meOld = rowOf[me.memberId];
  if ((!meRow || meRow.person.dept !== 'BOD') && !(kind === 'oday' && !meRow && !meOld)) {
    view.errors.push('Sheet không có bạn (' + me.user.name + ') ở ban BOD, nên sau khi tải bạn sẽ mất quyền vào Cài đặt. Kiểm tra lại tên và ban của bạn trong sheet.');
  }
  plan.changes = ch;
}

/** BOD xem trước một lần tải. req: { kind, link, tab, decisions }. */
function previewRoster(token, req) {
  var me = requireUser_(token, 'bod');
  return rosterPlan_(me, req || {}, new Date()).view;
}

/** Thư mục chép sheet đã tải. */
function rosterFolder_() {
  var it = DriveApp.getFoldersByName(ROSTER_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROSTER_FOLDER);
}

/** Bản ghi thành chữ (ngày giữ được) và ngược lại, để cất trạng thái trước khi tải vào tab _undo. */
function packRecords_(x) {
  return JSON.stringify(x, function (k, v) { var o = this[k]; return o && typeof o.getTime === 'function' ? { $d: o.getTime() } : v; });
}
function unpackRecords_(s) {
  return JSON.parse(s, function (k, v) { return v && typeof v === 'object' && typeof v.$d === 'number' && Object.keys(v).length === 1 ? new Date(v.$d) : v; });
}

/** Ghi trạng thái trước khi tải vào tab _undo của bản chép (mỗi ô tối đa 50.000 ký tự). */
function writeUndo_(copy, undo) {
  var sh = copy.insertSheet('_undo'), chunks = evidenceChunks_(packRecords_(undo), EVIDENCE_CELL_MAX);
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks.map(function (c) { return [c]; }));
}
function readUndo_(copy) {
  var sh = copy.getSheetByName('_undo');
  if (!sh) throw new Error('Bản chép không có dữ liệu để hoàn tác.');
  return unpackRecords_(sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).join(''));
}

/** Tải danh sách thành viên. Trả về { summary, notes, view } cho hộp tải. */
function applyRoster(token, req) {
  var me = requireUser_(token, 'bod');
  req = req || {};
  var out = withLock_(function () {
    var now = new Date(), plan = rosterPlan_(me, req, now), v = plan.view, ch = plan.changes;
    if (!v.ready) throw new Error('Chưa tải được. Bấm Xem trước để xem còn gì cần sửa.');
    var termRow = plan.term ? findRecord_('terms', plan.termId) : null;
    // Trạng thái trước khi tải, để hoàn tác
    var memberIds = ch.memberEdits.map(function (e) { return e.key; });
    var termKeys = ch.termEdits.map(function (e) { return e.key.member_id; });
    var undo = {
      members: plan.data.members.filter(function (m) { return memberIds.indexOf(m.member_id) >= 0; }),
      memberTerms: plan.data.member_terms.filter(function (r) { return String(r.term_id) === plan.termId && termKeys.indexOf(r.member_id) >= 0; }),
      addedMembers: ch.members.map(function (m) { return m.member_id; }), addedAccounts: ch.accounts.map(function (a) { return a.member_id; }),
      addedTerms: ch.termAdds.map(function (r) { return r.member_id; }), term: termRow, termCreated: !termRow
    };
    var copy = SpreadsheetApp.openById(DriveApp.getFileById(plan.src.ss.getId()).makeCopy('[ECO] Bản sao danh sách ' + plan.termId + ' ' + plan.kind, rosterFolder_()).getId());
    writeUndo_(copy, undo);
    if (ch.members.length) insertRecords_('members', ch.members);
    if (ch.memberEdits.length) updateRecords_('members', ch.memberEdits, { actorId: me.memberId, action: 'edit_member' });
    if (ch.accounts.length) insertRecords_('accounts', ch.accounts);
    if (ch.termEdits.length) updateRecords_('member_terms', ch.termEdits);
    if (ch.termAdds.length) insertRecords_('member_terms', ch.termAdds);
    if (!termRow) insertRecords_('terms', [{ term_id: plan.termId, prep_start_at: plan.kind === 'oday' ? now : '', phase1_start_at: plan.kind === 'batch_1' ? now : '' }]);
    else if (plan.kind === 'batch_1') updateRecord_('terms', plan.termId, { phase1_start_at: now });
    else if (plan.kind === 'batch_2') { snapshotRound_('round_1', plan.termId); updateRecord_('terms', plan.termId, { phase2_start_at: now }); }
    var summary = v.added.length + ' mới, ' + v.stayed + ' ở lại, ' + v.left.length + ' rời';
    var up = insertRecords_('roster_uploads', [{ term_id: plan.termId, sheet_type: 'members', batch_type: plan.kind, uploaded_at: now, uploaded_by: me.memberId,
      copy_url: copy.getUrl(), summary: summary, status: 'applied' }], { termId: plan.termId })[0];
    writeAudit_({ actorId: me.memberId, action: 'upload_sheet', table: 'roster_uploads', rowId: up.upload_id }, [{ column: 'summary', oldValue: '', newValue: summary }]);
    var link = String(req.link || '').trim();
    if (link !== String(getSetting_('roster_sheet_url', '') || '')) setSetting_('roster_sheet_url', link, me.memberId, 'Link sheet danh sách thành viên tải gần nhất');
    return { summary: summary, view: v };
  });
  var notes = [];
  try { var sync = syncBirthdayCalendar_(); if (sync) notes.push('Lịch sinh nhật: thêm ' + sync.added + ', bỏ ' + sync.removed + ', giữ ' + sync.kept + '.'); }
  catch (e) { notes.push('Chưa đồng bộ được lịch sinh nhật: ' + e.message); }
  out.notes = notes;
  out.page = rosterPageFor_();
  return out;
}

/* ---------- Hoàn tác, kết thúc nhiệm kỳ ---------- */

/** Hoàn tác lần tải danh sách thành viên mới nhất (trong ROSTER_UNDO_DAYS ngày), dựa vào tab _undo của bản chép. */
function undoRoster(token, uploadId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var ups = readTable_('roster_uploads').filter(function (u) { return u.sheet_type === 'members' && u.status === 'applied'; })
      .sort(function (a, b) { return b.uploaded_at.getTime() - a.uploaded_at.getTime(); });
    var up = ups[0];
    if (!up || up.upload_id !== uploadId) throw new Error('Chỉ hoàn tác được lần tải danh sách thành viên mới nhất.');
    if (Date.now() - up.uploaded_at.getTime() > ROSTER_UNDO_DAYS * 864e5) throw new Error('Lần tải này đã quá ' + ROSTER_UNDO_DAYS + ' ngày nên không hoàn tác được nữa.');
    var term = findRecord_('terms', String(up.term_id));
    if (term && term.prep_start_at && currentTerm_(readTable_('terms')).term_id !== term.term_id) throw new Error('Nhiệm kỳ này đã kết thúc nên không hoàn tác được.');
    var undo = readUndo_(SpreadsheetApp.openById(idFromUrl_(up.copy_url)));
    // Người mới thêm mà đã có hoạt động thì không xoá được
    var busy = {};
    [['task_assignments', 'member_id'], ['attendance', 'member_id'], ['point_entries', 'member_id'], ['member_labels', 'member_id']].forEach(function (t) {
      readTable_(t[0]).forEach(function (r) { if (undo.addedMembers.indexOf(r[t[1]]) >= 0) busy[r[t[1]]] = true; });
    });
    var names = namesById_(readTable_('members'));
    if (Object.keys(busy).length) throw new Error('Không hoàn tác được vì người mới đã có task, điểm danh, điểm hoặc nhãn: ' + Object.keys(busy).map(function (id) { return names[id]; }).join(', ') + '. Sửa sheet rồi tải Cập nhật thay vì hoàn tác.');
    var termId = String(up.term_id);
    undo.addedTerms.forEach(function (id) { deleteRecord_('member_terms', { member_id: id, term_id: termId }); });
    undo.addedAccounts.forEach(function (id) { deleteRecord_('accounts', id); });
    undo.addedMembers.forEach(function (id) { deleteRecord_('members', id); });
    var strip = function (rec, keys) { var p = {}; Object.keys(rec).forEach(function (k) { if (keys.indexOf(k) < 0) p[k] = rec[k]; }); return p; };
    if (undo.members.length) updateRecords_('members', undo.members.map(function (m) { return { key: m.member_id, patch: strip(m, ['member_id']) }; }), { actorId: me.memberId, action: 'edit_member' });
    if (undo.memberTerms.length) updateRecords_('member_terms', undo.memberTerms.map(function (r) { return { key: { member_id: r.member_id, term_id: r.term_id }, patch: strip(r, ['member_id', 'term_id']) }; }));
    if (undo.termCreated) deleteRecord_('terms', termId);
    else if (undo.term) {
      if (up.batch_type === 'batch_2') dropRound_('round_1', termId);
      updateRecord_('terms', termId, strip(undo.term, ['term_id']));
    }
    updateRecord_('roster_uploads', up.upload_id, { status: 'undone' }, { actorId: me.memberId, action: 'undo_upload' });
  });
  return rosterPageFor_();
}

/**
 * Kết thúc nhiệm kỳ (sau bonding farewell): chặn khi GD2 còn việc chưa xong, chụp kết quả GD2 và cả nhiệm kỳ, chuyển file bằng
 * chứng seeding của nhiệm kỳ vào thùng rác, mở nhiệm kỳ mới ở giai đoạn giao thoa. Mọi người vẫn vào app tới lần tải Oday.
 */
function endTerm(token) {
  var me = requireUser_(token, 'bod');
  var term = withLock_(function () {
    var now = new Date(), t = currentTerm_(readTable_('terms'));
    if (!t || !t.phase2_start_at) throw new Error('Chỉ kết thúc nhiệm kỳ được khi đang ở GD2.');
    var blockers = phaseBlockers_(t, 'phase_2', now);
    if (blockers.length) throw new Error('Còn việc chưa xong của GD2:\n• ' + blockers.join('\n• '));
    snapshotRound_('round_2', t.term_id);
    var next = nextTermId_(t.term_id);
    insertRecords_('terms', [{ term_id: next, prep_start_at: now }]);
    writeAudit_({ actorId: me.memberId, action: 'upload_sheet', table: 'terms', rowId: next }, [{ column: 'prep_start_at', oldValue: '', newValue: now }]);
    return t;
  });
  var props = PropertiesService.getScriptProperties(), fileId = props.getProperty(SEEDING_FILE_PROP + term.term_id);
  if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); props.deleteProperty(SEEDING_FILE_PROP + term.term_id); } catch (e) { /* đã bị xoá tay */ } }
  return rosterPageFor_();
}

/* ---------- Trang tải ---------- */

function rosterPageFor_() {
  var now = new Date(), terms = readTable_('terms'), term = currentTerm_(terms), phase = term ? phaseAt_(term, now) : '';
  var names = namesById_(readTable_('members')), uploads = readTable_('roster_uploads');
  var latest = uploads.filter(function (u) { return u.sheet_type === 'members' && u.status === 'applied'; })
    .sort(function (a, b) { return b.uploaded_at.getTime() - a.uploaded_at.getTime(); })[0];
  var kinds = ['oday', 'batch_1', 'batch_2', 'update'].map(function (k) { return { kind: k, block: batchBlock_(k, term) }; });
  var endBlock = !term || !term.phase2_start_at ? 'Chỉ kết thúc nhiệm kỳ được khi đang ở GD2.' : '';
  return {
    term: term ? { id: String(term.term_id), label: termLabel_(term.term_id), phase: phase, phaseLabel: PHASE_LABELS[phase] || '' } : null,
    nextStep: nextStep_(term, phase, uploads), kinds: kinds, undoDays: ROSTER_UNDO_DAYS,
    endBlock: endBlock, endBlockers: endBlock ? [] : phaseBlockers_(term, 'phase_2', now), endTop: endBlock ? [] : closingTop_(term, 'phase_2'),
    link: String(getSetting_('roster_sheet_url', '') || ''),
    uploads: uploads.slice().sort(function (a, b) { return b.uploaded_at.getTime() - a.uploaded_at.getTime(); }).slice(0, 10).map(function (u) {
      return { id: u.upload_id, type: u.sheet_type, kind: u.batch_type, at: u.uploaded_at.getTime(), by: names[u.uploaded_by] || u.uploaded_by, summary: u.summary,
        status: u.status, url: u.copy_url, canUndo: !!latest && u.upload_id === latest.upload_id && now.getTime() - u.uploaded_at.getTime() <= ROSTER_UNDO_DAYS * 864e5 };
    })
  };
}

function rosterPage(token) {
  requireUser_(token, 'bod');
  return rosterPageFor_();
}
