/**
 * Seeding (DIEM-01), người phụ trách seeding làm; BOD vào từ Cài đặt khi chưa có ai phụ trách.
 * (1) Dán link bài đăng, chọn lúc nhắc, bấm Đặt nhắc hẹn (hoặc bấm Điền ngay để dán luôn, không nhắc). (2) Đến giờ, app nhắc người đặt qua Zalo hoặc app.
 * (3) Dán nguyên đoạn copy react và comment. (4) App dò tên Facebook của thành viên và fanpage họ đăng ký (HS-04),
 * cộng +1 cho react, +2 cho comment (theo thang điểm), mỗi người một lần mỗi bài. (5) Tên nằm trong tên khác hoặc trùng tên
 * thì hiện ra để người nhập tick xác nhận. Đoạn đã dán được chép nguyên văn sang file bằng chứng của nhiệm kỳ.
 */

var SEEDING_FILE = '[APP] Bằng chứng seeding ';
var SEEDING_FILE_PROP = 'SEEDING_EVIDENCE_';
var SEEDING_REMIND_HANDLER = 'runSeedingReminders';
var SEEDING_REMIND_PROP = 'SEEDING_REMIND_UNTIL';
var EVIDENCE_CELL_MAX = 50000;
var SEEDING_PASTE_MAX = 500000;
var SEEDING_RECENT = 30;

/* ---------- Dò tên (không đụng tới Google) ---------- */

/** Tên để so: bỏ dấu, viết thường, chỉ giữ chữ và số, gộp khoảng trắng. */
function nameKey_(s) {
  return foldText_(s).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Link bài để so trùng: bỏ giao thức, www/m/web, dấu / cuối, phần # và tham số (trừ link .php cần tham số). */
function postKey_(url) {
  var s = String(url || '').trim().toLowerCase().replace(/#.*$/, '').replace(/^https?:\/\//, '').replace(/^(www|m|web|mbasic)\./, '');
  var q = s.indexOf('?');
  if (q >= 0 && s.slice(0, q).indexOf('.php') < 0) s = s.slice(0, q);
  return s.replace(/\/+$/, '');
}

function postUrlValid_(url) {
  return /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.watch)\/\S+$/i.test(String(url || '').trim());
}

/**
 * Các tên để dò: tên Facebook của thành viên (chưa có thì họ tên) và fanpage. people: { Mã TV: { name, facebook } }; pages: dòng tab Fanpage.
 * Trả về [{ key, label, ids: [Mã TV] }], tên dài trước.
 */
function seedingNames_(people, pages) {
  var byKey = {};
  var add = function (label, id) {
    var k = nameKey_(label);
    if (!k) return;
    var x = byKey[k] = byKey[k] || { key: k, label: String(label).trim(), ids: [] };
    if (x.ids.indexOf(id) < 0) x.ids.push(id);
  };
  Object.keys(people).forEach(function (id) { add(people[id].facebook || people[id].name, id); }); // chưa có tên Facebook thì dò theo họ tên
  pages.forEach(function (p) { if (people[p.member_id]) add(p.page_name, p.member_id); });
  return Object.keys(byKey).map(function (k) { return byKey[k]; }).sort(function (a, b) { return b.key.length - a.key.length || (a.key < b.key ? -1 : 1); });
}

/**
 * Dò tên trong đoạn đã dán. Tên dài được dò trước và "che" lại, nên "Minh Anh" chỉ nằm trong "Đỗ Minh Anh Lê" thì không tính là
 * khớp chắc. Tên một chữ chỉ khớp khi đứng riêng một dòng (để chữ trong nội dung comment không bị nhầm là tên).
 * Trả về { sure: [{ id, label }], unsure: [{ ids, label, why }] }: unsure là trùng tên giữa nhiều người hoặc chỉ nằm trong tên khác.
 */
function matchSeeding_(text, names) {
  var lines = String(text || '').split(/\r?\n/).map(function (l) { return ' ' + nameKey_(l) + ' '; }).filter(function (l) { return l.trim(); });
  var clean = {}, inside = {};
  lines.forEach(function (line) {
    var work = line;
    names.forEach(function (n) {
      var needle = ' ' + n.key + ' ', single = n.key.indexOf(' ') < 0;
      if (single ? work.trim() === n.key : work.indexOf(needle) >= 0) {
        clean[n.key] = true;
        work = work.split(needle).join(' # ');
      } else if (!single && line.indexOf(needle) >= 0) {
        inside[n.key] = true;
      }
    });
  });
  var out = { sure: [], unsure: [] };
  names.forEach(function (n) {
    if (clean[n.key] && n.ids.length === 1) out.sure.push({ id: n.ids[0], label: n.label });
    else if (clean[n.key]) out.unsure.push({ ids: n.ids.slice(), label: n.label, why: 'same_name' });
    else if (inside[n.key]) {
      var longer = names.filter(function (m) { return clean[m.key] && m.key.length > n.key.length && (' ' + m.key + ' ').indexOf(' ' + n.key + ' ') >= 0; })
        .map(function (m) { return m.label; });
      out.unsure.push({ ids: n.ids.slice(), label: n.label, why: 'inside', inside: longer });
    }
  });
  return out;
}

/** Cắt đoạn dán thành các ô không quá max ký tự (Google Sheets giới hạn 50.000 ký tự mỗi ô). */
function evidenceChunks_(text, max) {
  var s = String(text || ''), out = [];
  for (var i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out.length ? out : [''];
}

/* ---------- Quyền, dữ liệu trang ---------- */

function requireSeeder_(token) {
  var me = requireUser_(token);
  if (!me.user.isBod && me.user.labels.indexOf('seeding_lead') < 0) throw new Error('Chỉ người phụ trách seeding (hoặc BOD) mới ghi nhận seeding.');
  return me;
}

/** Người được cộng điểm seeding (không có BOD) kèm tên Facebook. */
function seedingPeople_(data, termId) {
  var people = pointPeople_(data, termId), fb = {};
  data.members.forEach(function (m) { fb[m.member_id] = m.facebook_name || ''; });
  Object.keys(people).forEach(function (id) { people[id].facebook = fb[id]; });
  return people;
}

function seedingActivity_(kind) {
  var id = String(getSetting_(kind + '_activity_id', ''));
  var a = id ? findRecord_('activities', id) : null;
  return a ? { id: a.activity_id, name: a.name, points: Number(a.points) || 0 } : null;
}

function seedingPageFor_(me) {
  var now = new Date(), term = currentTerm_(readTable_('terms')), termId = term ? String(term.term_id) : '';
  var phase = phaseAt_(term, now), names = namesById_(me.data.members);
  var entries = readTable_('point_entries').filter(function (e) { return e.source === 'seeding' && !e.is_cancelled; });
  var counts = {};
  entries.forEach(function (e) { counts[e.source_id] = (counts[e.source_id] || 0) + 1; });
  var posts = readTable_('seeding_posts').filter(function (p) { return !termId || String(p.post_id).indexOf('-' + termId + '-') > 0; })
    .sort(function (a, b) { return (b.created_at ? b.created_at.getTime() : 0) - (a.created_at ? a.created_at.getTime() : 0); });
  var view = function (p) {
    return { id: p.post_id, url: p.post_url, by: names[p.created_by] || p.created_by, mine: p.created_by === me.memberId,
      createdAt: p.created_at ? p.created_at.getTime() : null, remindAt: p.remind_at ? p.remind_at.getTime() : null,
      recordedAt: p.recorded_at ? p.recorded_at.getTime() : null, entries: counts[p.post_id] || 0 };
  };
  var people = term ? seedingPeople_(me.data, termId) : {};
  return {
    now: now.getTime(), isBod: me.user.isBod, canRecord: phase === 'phase_1' || phase === 'phase_2',
    react: seedingActivity_('react'), comment: seedingActivity_('comment'),
    noFacebook: Object.keys(people).filter(function (id) { return !nameKey_(people[id].facebook); }).length,
    waiting: posts.filter(function (p) { return p.status !== 'recorded'; }).map(view),
    recorded: posts.filter(function (p) { return p.status === 'recorded'; }).slice(0, SEEDING_RECENT).map(view)
  };
}

/** Trang Seeding. */
function seedingPage(token) {
  return seedingPageFor_(requireSeeder_(token));
}

/* ---------- Đặt nhắc hẹn ---------- */

/**
 * Dán link bài và chọn lúc nhắc (NS seeding tự chọn, không có mức mặc định). remindAt: mili giây.
 * f.now: điền ngay, không đặt nhắc (người nhập tự nhớ, dán react và comment luôn). Trả về trang kèm added là mã bài mới.
 */
function addSeedingPost(token, f) {
  var me = requireSeeder_(token);
  f = f || {};
  var url = String(f.url || '').trim(), now = !!f.now, at = now ? '' : new Date(Number(f.remindAt));
  if (!postUrlValid_(url)) throw new Error('Bạn dán link bài đăng Facebook (bắt đầu bằng https://).');
  if (!now) {
    if (isNaN(at.getTime())) throw new Error('Bạn chọn lúc nhắc nhé.');
    if (at.getTime() < Date.now() - 60e3) throw new Error('Lúc nhắc đã qua rồi. Chọn một lúc sau bây giờ.');
    if (at.getTime() > Date.now() + 14 * 864e5) throw new Error('Lúc nhắc chỉ trong vòng 14 ngày tới.');
  }
  var added = withLock_(function () {
    var term = requireTerm_(), key = postKey_(url);
    if (now) {
      var phase = phaseAt_(term, new Date());
      if (phase !== 'phase_1' && phase !== 'phase_2') throw new Error('Đang ở giai đoạn giao thoa nên chưa cộng điểm được. Bạn đặt nhắc hẹn nhé.');
    }
    var same = readTable_('seeding_posts').filter(function (p) { return postKey_(p.post_url) === key; })[0];
    if (same) throw new Error('Bài này đã có trong danh sách (' + same.post_id + ').');
    return insertRecords_('seeding_posts', [{ post_url: url, created_by: me.memberId, created_at: new Date(), remind_at: at, status: 'waiting' }], { termId: term.term_id })[0];
  });
  if (!now) ensureSeedingTrigger_();
  var page = seedingPageFor_(me);
  page.added = added.post_id;
  return page;
}

/** Đổi lúc nhắc của bài đang chờ. */
function setSeedingRemind(token, postId, remindAt) {
  var me = requireSeeder_(token), at = new Date(Number(remindAt));
  if (isNaN(at.getTime()) || at.getTime() < Date.now() - 60e3) throw new Error('Chọn một lúc sau bây giờ.');
  withLock_(function () {
    var p = findRecord_('seeding_posts', String(postId));
    if (!p || p.status === 'recorded') throw new Error('Bài này không còn chờ dán.');
    updateRecord_('seeding_posts', p.post_id, { remind_at: at });
  });
  return seedingPageFor_(me);
}

/** Xoá bài đang chờ (dán nhầm link). Bài đã ghi nhận thì huỷ ghi nhận trước. */
function deleteSeedingPost(token, postId) {
  var me = requireSeeder_(token);
  withLock_(function () {
    var p = findRecord_('seeding_posts', String(postId));
    if (!p) throw new Error('Không tìm thấy bài này.');
    if (p.status === 'recorded') throw new Error('Bài này đã ghi nhận. Huỷ ghi nhận trước rồi mới xoá được.');
    deleteRecord_('seeding_posts', p.post_id);
  });
  return seedingPageFor_(me);
}

/* ---------- Dán react, comment ---------- */

function seedingMatch_(reacts, comments) {
  if (String(reacts || '').length + String(comments || '').length > SEEDING_PASTE_MAX) throw new Error('Đoạn dán quá dài. Bạn chia bài thành hai lần dán nhé.');
  var term = requireTerm_(), data = peopleData_(), people = seedingPeople_(data, term.term_id);
  var names = seedingNames_(people, readTable_('fanpages'));
  var view = function (m) {
    var seen = {}, sure = [];
    m.sure.forEach(function (s) {
      if (seen[s.id]) return;
      seen[s.id] = true;
      sure.push({ id: s.id, name: people[s.id].name, dept: people[s.id].dept, via: s.label });
    });
    // người đã khớp chắc (ví dụ qua fanpage) thì không hỏi lại
    var unsure = m.unsure.map(function (u) {
      return { label: u.label, why: u.why, inside: u.inside || [],
        people: u.ids.filter(function (id) { return !seen[id]; }).map(function (id) { return { id: id, name: people[id].name, dept: people[id].dept }; }) };
    }).filter(function (u) { return u.people.length; });
    return { sure: sure.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); }), unsure: unsure };
  };
  return { react: view(matchSeeding_(reacts, names)), comment: view(matchSeeding_(comments, names)) };
}

/** Xem trước: ai khớp chắc, ai cần xác nhận. Chưa ghi gì. */
function previewSeeding(token, postId, reacts, comments) {
  requireSeeder_(token);
  var p = findRecord_('seeding_posts', String(postId));
  if (!p) throw new Error('Không tìm thấy bài này.');
  if (!String(reacts || '').trim() && !String(comments || '').trim()) throw new Error('Bạn chưa dán react hay comment nào.');
  var m = seedingMatch_(reacts, comments);
  m.react.points = (seedingActivity_('react') || {}).points || 0;
  m.comment.points = (seedingActivity_('comment') || {}).points || 0;
  return m;
}

/** Thư mục và file bằng chứng của nhiệm kỳ (chưa có thì tạo): "[APP] Bằng chứng seeding 2627", hai tab phase_1, phase_2. */
function evidenceFile_(termId) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(SEEDING_FILE_PROP + termId);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* file bị xoá thì tạo lại */ } }
  var ss = SpreadsheetApp.create(SEEDING_FILE + termId);
  DriveApp.getFileById(ss.getId()).moveTo(appFolder_('seeding'));
  var first = ss.getSheets()[0].setName('phase_1');
  [first, ss.insertSheet('phase_2')].forEach(function (sh) { sh.getRange(1, 1, 1, 3).setValues([['post_id', 'reacts', 'comments']]); sh.setFrozenRows(1); });
  props.setProperty(SEEDING_FILE_PROP + termId, ss.getId());
  return ss;
}

/** Chép nguyên văn đoạn dán sang file bằng chứng: mỗi bài một hàng, ô dài quá thì nối xuống hàng dưới cùng mã bài. */
function writeEvidence_(post, term, reacts, comments) {
  var phase = term.phase2_start_at && post.created_at && post.created_at.getTime() >= term.phase2_start_at.getTime() ? 'phase_2' : 'phase_1';
  var sh = evidenceFile_(String(term.term_id)).getSheetByName(phase);
  var r = evidenceChunks_(reacts, EVIDENCE_CELL_MAX), c = evidenceChunks_(comments, EVIDENCE_CELL_MAX), rows = [];
  for (var i = 0; i < Math.max(r.length, c.length); i++) rows.push([post.post_id, r[i] || '', c[i] || '']);
  var start = sh.getLastRow() + 1;
  if (sh.getMaxRows() < start + rows.length - 1) sh.insertRowsAfter(sh.getMaxRows(), start + rows.length - 1 - sh.getMaxRows());
  sh.getRange(start, 1, rows.length, 3).setValues(rows);
}

/**
 * Ghi nhận: cộng điểm cho người khớp chắc và người được tick xác nhận. chosen: { react: [Mã TV], comment: [Mã TV] } là danh sách
 * cuối cùng người nhập để tick (máy chủ chỉ nhận người có trong kết quả dò). Trả về trang kèm số người được cộng.
 */
function recordSeeding(token, postId, reacts, comments, chosen) {
  var me = requireSeeder_(token);
  chosen = chosen || {};
  var result = withLock_(function () {
    var now = new Date(), term = currentTerm_(readTable_('terms')), phase = phaseAt_(term, now);
    if (phase !== 'phase_1' && phase !== 'phase_2') throw new Error('Đang ở giai đoạn giao thoa nên chưa cộng điểm được.');
    var p = findRecord_('seeding_posts', String(postId));
    if (!p) throw new Error('Không tìm thấy bài này.');
    if (p.status === 'recorded') throw new Error('Bài này đã ghi nhận rồi. Muốn sửa thì Huỷ ghi nhận rồi dán lại.');
    var m = seedingMatch_(reacts, comments), rows = [];
    ['react', 'comment'].forEach(function (kind) {
      var allowed = {};
      m[kind].sure.forEach(function (s) { allowed[s.id] = true; });
      m[kind].unsure.forEach(function (u) { u.people.forEach(function (x) { allowed[x.id] = true; }); });
      var ids = [];
      (chosen[kind] || []).forEach(function (id) { id = String(id); if (allowed[id] && ids.indexOf(id) < 0) ids.push(id); });
      if (!ids.length) return;
      var act = seedingActivity_(kind);
      if (!act) throw new Error('Chưa có hoạt động dùng cho ' + kind + ' trong thang điểm. BOD kiểm tra Cài đặt, Quy tắc CLB, Thang điểm.');
      ids.forEach(function (id) {
        rows.push({ member_id: id, activity_id: act.id, points: act.points, event_id: '', source: 'seeding', source_id: p.post_id,
          awarded_at: now, awarded_by: me.memberId, is_cancelled: false });
      });
    });
    if (rows.length) insertRecords_('point_entries', rows, { termId: term.term_id });
    updateRecord_('seeding_posts', p.post_id, { status: 'recorded', recorded_at: now });
    var warn = '';
    try { writeEvidence_(p, term, reacts, comments); } catch (e) { warn = 'Chưa chép được bằng chứng sang Drive: ' + e.message; }
    var people = {};
    rows.forEach(function (r) { people[r.member_id] = true; });
    return { post: p, people: Object.keys(people).length, entries: rows.length, warn: warn };
  });
  alertBod_('seeding', 'Seeding vừa ghi nhận', me.user.name + ' vừa ghi nhận bài ' + result.post.post_url + ', cộng điểm cho ' + result.people + ' người.');
  var out = seedingPageFor_(me);
  out.done = { people: result.people, entries: result.entries, warn: result.warn };
  return out;
}

/** Huỷ ghi nhận (BOD hoặc người đã ghi nhận): huỷ các dòng điểm của bài, bài về lại Chờ dán để dán lại. */
function cancelSeeding(token, postId) {
  var me = requireSeeder_(token);
  withLock_(function () {
    var p = findRecord_('seeding_posts', String(postId));
    if (!p || p.status !== 'recorded') throw new Error('Bài này chưa ghi nhận.');
    var rows = readTable_('point_entries').filter(function (e) { return e.source === 'seeding' && e.source_id === p.post_id && !e.is_cancelled; });
    if (!me.user.isBod && rows.some(function (e) { return e.awarded_by !== me.memberId; })) throw new Error('Bạn chỉ huỷ được bài mình ghi nhận. Nhờ BOD huỷ giúp.');
    rows.forEach(function (e) { assertNotLocked_(e.awarded_at, 'huỷ điểm seeding'); });
    var now = new Date();
    if (rows.length) {
      updateRecords_('point_entries', rows.map(function (e) { return { key: e.entry_id, patch: { is_cancelled: true, cancelled_by: me.memberId, cancelled_at: now } }; }),
        { actorId: me.memberId, action: 'cancel_points' });
    }
    updateRecord_('seeding_posts', p.post_id, { status: 'waiting', recorded_at: '' });
  });
  return seedingPageFor_(me);
}

/* ---------- Nhắc hẹn ---------- */

function ensureSeedingTrigger_() {
  try {
    var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === SEEDING_REMIND_HANDLER; });
    if (!has) ScriptApp.newTrigger(SEEDING_REMIND_HANDLER).timeBased().everyMinutes(15).create();
  } catch (e) { /* lần đặt nhắc sau cài lại */ }
}

/** Tin nhắc các bài đến giờ trong khoảng (from, to]: mỗi người đặt nhắc một tin. */
function seedingReminderMessages_(from, to) {
  var due = {};
  readTable_('seeding_posts').forEach(function (p) {
    if (p.status === 'recorded' || !p.remind_at) return;
    var t = p.remind_at.getTime();
    if (t > from && t <= to) (due[p.created_by] = due[p.created_by] || []).push(p);
  });
  return Object.keys(due).map(function (id) {
    return { memberId: id, title: 'Đến giờ ghi nhận seeding',
      body: 'Mở bài, copy toàn bộ react và comment rồi dán vào app, trang Seeding:\n' + due[id].map(function (p) { return '• ' + p.post_url; }).join('\n') };
  });
}

/** Chạy tự động mỗi 15 phút: nhắc người đặt nhắc khi tới giờ. Nhớ mốc đã nhắc tới đâu để không nhắc lại. */
function runSeedingReminders(e) {
  if (!fromOwnTrigger_(e)) return null;
  return trackJob_('seeding', function () {
    var props = PropertiesService.getScriptProperties(), now = Date.now();
    var from = Number(props.getProperty(SEEDING_REMIND_PROP)) || now - 15 * 60e3;
    var items = seedingReminderMessages_(from, now);
    props.setProperty(SEEDING_REMIND_PROP, String(now));
    return items.length ? notifyMembers_(items) : null;
  });
}

/* ---------- Fanpage để seeding (HS-04) ---------- */

function myFanpagesFor_(me) {
  return readTable_('fanpages').filter(function (p) { return p.member_id === me.memberId; })
    .map(function (p) { return { name: p.page_name, url: p.page_url || '' }; });
}

/** Cài đặt > Tài khoản của tôi > Fanpage để seeding. BOD không được cộng điểm nên không cần. */
function myFanpages(token) {
  var me = requireUser_(token);
  var m = me.data.members.filter(function (x) { return x.member_id === me.memberId; })[0];
  return { pages: myFanpagesFor_(me), facebook: m.facebook_name || '', isBod: me.user.isBod };
}

function addFanpage(token, f) {
  var me = requireUser_(token);
  if (me.user.isBod) throw new Error('BOD không được cộng điểm seeding nên không cần thêm fanpage.');
  f = f || {};
  var name = String(f.name || '').trim().slice(0, 100), url = String(f.url || '').trim();
  if (!nameKey_(name)) throw new Error('Bạn nhập tên fanpage đúng như khi nó react, comment.');
  if (url && !/^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com)\/\S+$/i.test(url)) throw new Error('Link fanpage phải là link Facebook (https://facebook.com/...).');
  withLock_(function () {
    var key = nameKey_(name);
    var pages = readTable_('fanpages').filter(function (p) { return nameKey_(p.page_name) === key; })[0];
    if (pages) throw new Error(pages.member_id === me.memberId ? 'Bạn đã thêm fanpage này rồi.' : 'Tên này đã có người khác đăng ký. Tên fanpage không được trùng.');
    var other = me.data.members.filter(function (m) { return m.member_id !== me.memberId && nameKey_(m.facebook_name) === key; })[0];
    if (other) throw new Error('Tên này trùng tên Facebook của một thành viên khác.');
    insertRecords_('fanpages', [{ member_id: me.memberId, page_name: name, page_url: url, added_date: todayDate_() }]);
  });
  return myFanpages(token);
}

function removeFanpage(token, name) {
  var me = requireUser_(token);
  withLock_(function () {
    var p = findRecord_('fanpages', String(name));
    if (!p || p.member_id !== me.memberId) throw new Error('Không tìm thấy fanpage này.');
    deleteRecord_('fanpages', p.page_name);
  });
  return myFanpages(token);
}
