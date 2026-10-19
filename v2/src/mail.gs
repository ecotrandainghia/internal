/**
 * Hộp thư CLB (tài khoản Gmail của CLB, chính là tài khoản triển khai app). Mọi thư gửi đi đứng tên CLB.
 * - UCV xem toàn bộ hộp thư trong app. Mọi thao tác làm thay đổi hộp thư (soạn, trả lời, chuyển tiếp, lưu trữ, xoá, gắn nhãn...)
 *   thành một yêu cầu ở tab Yêu cầu mail, chờ BOD duyệt rồi app mới làm trên Gmail.
 * - BOD không xem hộp thư trong app (bấm link mở thẳng Gmail CLB). BOD duyệt, trả lại sửa, từ chối, hoặc sửa trực tiếp rồi duyệt.
 * Tên UCV soạn chỉ lưu trong app, người nhận không thấy.
 */

var MAIL_FOLDERS = [
  { id: 'inbox', name: 'Hộp thư đến', query: 'in:inbox' },
  { id: 'sent', name: 'Đã gửi', query: 'in:sent' },
  { id: 'archive', name: 'Lưu trữ', query: '-in:inbox -in:sent -in:trash -in:spam -in:drafts' },
  { id: 'spam', name: 'Thư rác', query: 'in:spam' },
  { id: 'trash', name: 'Thùng rác', query: 'in:trash' }
];
var MAIL_PAGE_SIZE = 30;
var MAIL_FILE_MB = 10;
var MAIL_TOTAL_MB = 20;
var MAIL_IMAGE_MB = 2;
var MAIL_ATTACH_FOLDER = 'ECO - Đính kèm mail';
var MAIL_SEND_ACTIONS = ['compose', 'reply', 'reply_all', 'forward'];
var MAIL_THREAD_ACTIONS = ['archive', 'move_to_inbox', 'trash', 'report_spam', 'add_label', 'remove_label'];
var MAIL_EDITABLE = ['draft', 'needs_changes'];
var MAIL_DELETABLE = ['draft', 'needs_changes', 'rejected'];

/* ---------- Phần không đụng tới Google ---------- */

function emailValid_(e) {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(String(e || '').trim());
}

/** Tách chuỗi nhiều email (phẩy, chấm phẩy, xuống dòng, khoảng trắng, dạng "Tên <email>"). Trả về { list, bad }, bỏ trùng. */
function splitEmails_(text) {
  var list = [], bad = [], seen = {};
  String(text || '').split(/[,;\n]+/).forEach(function (part) {
    var m = /<([^>]+)>/.exec(part);
    (m ? [m[1]] : part.split(/\s+/)).forEach(function (x) {
      var e = x.trim().replace(/^mailto:/i, '');
      if (!e) return;
      if (!emailValid_(e)) { bad.push(e); return; }
      if (!seen[e.toLowerCase()]) { seen[e.toLowerCase()] = true; list.push(e); }
    });
  });
  return { list: list, bad: bad };
}

/** Bỏ thẻ HTML, lấy chữ (bản chữ của thư và để kiểm tra thư trống). */
function htmlToText_(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Thư HTML có gì không (chữ hoặc ảnh). */
function htmlHasContent_(html) {
  return !!htmlToText_(html) || /<img/i.test(String(html || ''));
}

/** Lọc HTML người dùng soạn: bỏ thẻ chạy được, thuộc tính on..., link javascript:. Giao diện đã lọc một lần, đây là lớp thứ hai. */
function cleanHtml_(html) {
  return String(html || '')
    .replace(/<(script|style|iframe|object|embed|form|textarea|select|button|meta|link|base|frame|frameset|applet|noscript)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|meta|link|base|frame|frameset|applet|noscript)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data(?!:image\/)):[^"']*\2/gi, '$1=$2#$2');
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Ảnh dán vào thư (data:image/...) → [{ mime, base64 }], thay src bằng chỗ đánh dấu {{img0}}, {{img1}}... */
function takeDataImages_(html) {
  var images = [];
  var out = String(html || '').replace(/src\s*=\s*("|')data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+\/=\s]+)\1/gi, function (_, q, mime, b64) {
    images.push({ mime: mime.toLowerCase(), base64: b64.replace(/\s+/g, '') });
    return 'src=' + q + '{{img' + (images.length - 1) + '}}' + q;
  });
  return { html: out, images: images };
}

/** Kiểm tra yêu cầu trước khi gửi BOD duyệt. Trả về câu báo lỗi, hoặc ''. */
function mailRequestError_(r) {
  r = r || {};
  var a = r.action;
  if (MAIL_SEND_ACTIONS.indexOf(a) < 0 && MAIL_THREAD_ACTIONS.indexOf(a) < 0) return 'Thao tác không hợp lệ.';
  if (a !== 'compose' && !r.threadId) return 'Thiếu thư cần thao tác.';
  if (a === 'compose' || a === 'forward') {
    var to = splitEmails_(r.to);
    if (to.bad.length) return 'Email chưa đúng: ' + to.bad.join(', ');
    if (!to.list.length) return 'Bạn chưa nhập người nhận.';
  }
  var cc = splitEmails_(r.cc), bcc = splitEmails_(r.bcc);
  if (cc.bad.length || bcc.bad.length) return 'Email chưa đúng: ' + cc.bad.concat(bcc.bad).join(', ');
  if (a === 'compose' && !String(r.subject || '').trim()) return 'Bạn chưa nhập tiêu đề.';
  if ((a === 'compose' || a === 'reply' || a === 'reply_all') && !htmlHasContent_(r.body)) return 'Bạn chưa nhập nội dung.';
  if ((a === 'add_label' || a === 'remove_label') && !String(r.label || '').trim()) return 'Bạn chưa chọn nhãn.';
  if (String(r.subject || '').length > 250) return 'Tiêu đề dài quá 250 ký tự.';
  if (String(r.body || '').length > 45000) return 'Nội dung dài quá. Nếu bạn dán từ nơi khác, thử dán lại không kèm định dạng (Ctrl+Shift+V).';
  return '';
}

function parseJson_(s, fallback) {
  try { var v = JSON.parse(String(s || '')); return v == null ? fallback : v; } catch (e) { return fallback; }
}

/* ---------- Quyền ---------- */

/** UCV (nhãn UCV đang hiệu lực). */
function requireUcv_(token) {
  var me = requireUser_(token);
  if (me.user.labels.indexOf('ucv') < 0) throw new Error('Chỉ UCV mới dùng được hộp thư trong app.');
  return me;
}

/** UCV hoặc BOD (đọc thư, tải tệp khi duyệt). */
function requireMailReader_(token) {
  var me = requireUser_(token);
  if (!me.user.isBod && me.user.labels.indexOf('ucv') < 0) throw new Error('Bạn không có quyền xem hộp thư CLB.');
  return me;
}

/* ---------- Gmail, Drive ---------- */

function clubEmail_() {
  return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
}

/** Link mở Gmail của tài khoản CLB (BOD đăng nhập sẵn tài khoản này). */
function gmailLink_(suffix) {
  return 'https://mail.google.com/mail/u/?authuser=' + encodeURIComponent(clubEmail_()) + (suffix || '');
}

/** Thư mục Drive giữ tệp UCV tải lên (chưa có thì tạo). */
function mailAttachFolder_() {
  var it = DriveApp.getFoldersByName(MAIL_ATTACH_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(MAIL_ATTACH_FOLDER);
}

/** Chữ ký mặc định trong cài đặt Gmail CLB: { html, error }. Nhớ tạm 6 tiếng khi đọc được. */
function gmailSignature_(refresh) {
  var cache = CacheService.getScriptCache(), key = 'gmail_signature';
  if (!refresh) { var hit = cache.get(key); if (hit !== null) return { html: hit, error: '' }; }
  var html = '', error = '';
  try {
    var list = Gmail.Users.Settings.SendAs.list('me').sendAs || [];
    var main = list.filter(function (s) { return s.isDefault; })[0] || list.filter(function (s) { return s.isPrimary; })[0];
    html = main && main.signature ? String(main.signature) : '';
  } catch (e) { error = 'Không đọc được chữ ký từ Gmail: ' + String(e.message || e).slice(0, 300); }
  if (!error) { try { cache.put(key, html, 21600); } catch (e) { /* chữ ký dài quá để nhớ tạm thì thôi */ } }
  return { html: html, error: error };
}

/** Chữ ký sẽ thêm vào thư UCV: { on, html, error }. */
function mailSignature_(refresh) {
  var s = gmailSignature_(refresh);
  return { on: String(getSetting_('mail_signature', '1')) !== '0', html: s.html, error: s.error };
}

function threadSummary_(t) {
  var msgs = t.getMessages(), last = msgs[msgs.length - 1];
  return {
    id: t.getId(), subject: t.getFirstMessageSubject() || '(không có tiêu đề)', from: String(last.getFrom()),
    at: t.getLastMessageDate().getTime(), count: msgs.length, unread: t.isUnread(),
    labels: t.getLabels().map(function (l) { return l.getName(); }), snippet: String(last.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 120)
  };
}

function threadById_(id) {
  var t = null;
  try { t = GmailApp.getThreadById(String(id || '')); } catch (e) { t = null; }
  if (!t) throw new Error('Không tìm thấy thư, có thể đã bị xoá hẳn.');
  return t;
}

function threadDetail_(t) {
  return {
    id: t.getId(), subject: t.getFirstMessageSubject() || '(không có tiêu đề)',
    labels: t.getLabels().map(function (l) { return l.getName(); }),
    inInbox: t.isInInbox(), inTrash: t.isInTrash(), inSpam: t.isInSpam(),
    messages: t.getMessages().map(function (m) {
      return {
        id: m.getId(), from: String(m.getFrom()), to: String(m.getTo()), cc: String(m.getCc() || ''), at: m.getDate().getTime(),
        html: String(m.getBody() || '').replace(/<script[\s\S]*?<\/script>/gi, ''),
        files: m.getAttachments({ includeInlineImages: false }).map(function (a) { return { name: a.getName(), size: a.getSize() }; })
      };
    })
  };
}

/** Ảnh trong thư lưu ở Drive (src="drive:<mã>") → data URI để xem trong app. */
function imagesForView_(html) {
  return String(html || '').replace(/src=("|')drive:([a-zA-Z0-9_-]+)\1/g, function (all, q, id) {
    try { var b = DriveApp.getFileById(id).getBlob(); return 'src=' + q + 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) + q; }
    catch (e) { return all; }
  });
}

/* ---------- Yêu cầu mail ---------- */

function requestView_(r, names) {
  return {
    id: r.request_id, at: r.created_at ? r.created_at.getTime() : null, by: names[r.drafted_by] || r.drafted_by, byId: r.drafted_by,
    action: r.action, threadId: r.gmail_thread_id || '', threadSubject: r.thread_subject || '',
    to: r.to || '', cc: r.cc || '', bcc: r.bcc || '', subject: r.subject || '', label: r.label || '', quote: r.quote_original !== false,
    files: parseJson_(r.attachments, []), status: r.status, note: r.review_note || '',
    reviewedBy: r.reviewed_by ? names[r.reviewed_by] || r.reviewed_by : '', reviewedAt: r.reviewed_at ? r.reviewed_at.getTime() : null
  };
}

/** Yêu cầu nào đã được BOD sửa trực tiếp (theo Nhật ký). */
function editedByBod_() {
  var out = {};
  readTable_('audit_log').forEach(function (a) {
    if (a.action === 'approve_mail' && a.table_name === 'mail_requests' && ['to', 'cc', 'bcc', 'subject', 'body'].indexOf(a.column_name) >= 0) out[a.row_id] = true;
  });
  return out;
}

function requestOf_(id) {
  var r = findRecord_('mail_requests', String(id || ''));
  if (!r) throw new Error('Không tìm thấy yêu cầu này.');
  return r;
}

/**
 * Lưu tệp và ảnh của yêu cầu. keep: tệp cũ giữ lại; files: [{ name, type, base64 }] tải từ máy; drive: [{ id }] chọn từ Drive.
 * Trả về { attachments, body } (ảnh dán trong thư lưu vào Drive, src thành drive:<mã>).
 */
function storeMailFiles_(old, f, body) {
  var keep = (f.keep || []).map(String);
  var list = old.filter(function (x) { return keep.indexOf(String(x.id)) >= 0; });
  var total = list.reduce(function (s, x) { return s + (Number(x.size) || 0); }, 0);
  var add = function (size, name) {
    if (size > MAIL_FILE_MB * 1048576) throw new Error('Tệp "' + name + '" lớn hơn ' + MAIL_FILE_MB + ' MB.');
    total += size;
    if (total > MAIL_TOTAL_MB * 1048576) throw new Error('Tổng tệp đính kèm lớn hơn ' + MAIL_TOTAL_MB + ' MB.');
  };
  (f.drive || []).forEach(function (d) {
    var file;
    try { file = DriveApp.getFileById(idFromUrl_(d.id || d.url) || String(d.id)); file.getName(); } catch (e) { throw new Error('Không mở được tệp trên Drive. Chia sẻ tệp cho tài khoản Google của CLB rồi thử lại.'); }
    add(file.getSize(), file.getName());
    list.push({ id: file.getId(), name: file.getName(), size: file.getSize(), drive: true });
  });
  var uploads = f.files || [];
  var taken = takeDataImages_(body);
  var folder = uploads.length || taken.images.length ? mailAttachFolder_() : null;
  uploads.forEach(function (u) {
    var size = Math.floor(String(u.base64 || '').length * 3 / 4), name = String(u.name || 'tep').slice(0, 200);
    add(size, name);
    var blob = Utilities.newBlob(Utilities.base64Decode(String(u.base64 || '')), String(u.type || 'application/octet-stream'), name);
    list.push({ id: folder.createFile(blob).getId(), name: name, size: size });
  });
  var html = taken.html;
  taken.images.forEach(function (img, i) {
    var size = Math.floor(img.base64.length * 3 / 4);
    if (size > MAIL_IMAGE_MB * 1048576) throw new Error('Ảnh chèn trong thư lớn hơn ' + MAIL_IMAGE_MB + ' MB. Bạn đính kèm ảnh thành tệp nhé.');
    var id = folder.createFile(Utilities.newBlob(Utilities.base64Decode(img.base64), img.mime, 'anh-' + (i + 1))).getId();
    html = html.replace('{{img' + i + '}}', 'drive:' + id);
  });
  return { attachments: list, body: html };
}

/* ---------- Gọi từ trang web: UCV ---------- */

/** Danh sách thư một thư mục hoặc nhãn. folder: mã thư mục (inbox...) hoặc "label:<tên nhãn>". */
function mailbox(token, folder, query, start) {
  requireUcv_(token);
  var labels = GmailApp.getUserLabels().map(function (l) { return l.getName(); }).sort();
  folder = String(folder || 'inbox');
  var f = MAIL_FOLDERS.filter(function (x) { return x.id === folder; })[0], q;
  if (f) q = f.query;
  else if (folder.indexOf('label:') === 0 && labels.indexOf(folder.slice(6)) >= 0) q = 'label:"' + folder.slice(6).replace(/"/g, '') + '"';
  else { folder = 'inbox'; q = MAIL_FOLDERS[0].query; }
  if (query) q += ' ' + String(query).slice(0, 200);
  start = Math.max(0, Number(start) || 0);
  var threads = GmailApp.search(q, start, MAIL_PAGE_SIZE + 1);
  return {
    folder: folder, folders: MAIL_FOLDERS.map(function (x) { return { id: x.id, name: x.name }; }), labels: labels,
    threads: threads.slice(0, MAIL_PAGE_SIZE).map(threadSummary_), more: threads.length > MAIL_PAGE_SIZE
  };
}

/** Toàn bộ một luồng thư (UCV đọc, BOD xem khi duyệt). */
function mailThread(token, threadId) {
  requireMailReader_(token);
  return threadDetail_(threadById_(threadId));
}

/** Tải một tệp đính kèm của thư (tối đa 8 MB qua app). */
function mailAttachment(token, threadId, messageId, index) {
  requireMailReader_(token);
  var m = null;
  try { m = GmailApp.getMessageById(String(messageId)); } catch (e) { m = null; }
  if (!m || m.getThread().getId() !== String(threadId)) throw new Error('Không tìm thấy tệp.');
  var a = m.getAttachments({ includeInlineImages: false })[Number(index)];
  if (!a) throw new Error('Không tìm thấy tệp.');
  if (a.getSize() > 8 * 1048576) throw new Error('Tệp lớn hơn 8 MB, không tải qua app được. Nhờ BOD mở trong Gmail.');
  return { name: a.getName(), type: a.getContentType(), base64: Utilities.base64Encode(a.getBytes()) };
}

/** Dữ liệu cho khung soạn thư: danh bạ (thành viên theo ban và Danh bạ), chữ ký sẽ thêm, giới hạn tệp. */
function composeSetup(token) {
  var me = requireUcv_(token);
  var term = currentTerm_(readTable_('terms')), people = term ? activePeople_(me.data, term.term_id) : {};
  var emails = {};
  me.data.members.forEach(function (m) { emails[m.member_id] = m.email; });
  var list = Object.keys(people).filter(function (id) { return emailValid_(emails[id]); }).map(function (id) {
    return { group: 'Thành viên · ' + people[id].dept, name: people[id].name, email: String(emails[id]).trim() };
  }).sort(function (a, b) { return a.group.localeCompare(b.group) || a.name.localeCompare(b.name, 'vi'); });
  readTable_('contacts').forEach(function (c) {
    if (emailValid_(c.email)) list.push({ group: c.group_name || 'Danh bạ', name: c.name || c.email, email: String(c.email).trim() });
  });
  var sig = mailSignature_();
  return { contacts: list, signature: sig.on ? sig.html : '', fileMb: MAIL_FILE_MB, totalMb: MAIL_TOTAL_MB, imageMb: MAIL_IMAGE_MB };
}

/** Lấy email từ một Google Sheet (cột có chữ "email" ở dòng tiêu đề, không có thì mọi ô là email). Tối đa 2000 dòng. */
function recipientsFromSheet(token, url) {
  requireUcv_(token);
  var ss = openSheetByUrl_(url, 'sheet');
  var values = ss.getSheets()[0].getDataRange().getValues().slice(0, 2001);
  var head = (values[0] || []).map(headerKey_), cols = [];
  head.forEach(function (k, i) { if (k.indexOf('email') >= 0 || k === 'mail' || k === 'thudientu') cols.push(i); });
  var cells = [];
  values.forEach(function (line, r) {
    line.forEach(function (v, c) { if ((cols.length ? cols.indexOf(c) >= 0 && r > 0 : true) && emailValid_(v)) cells.push(String(v).trim()); });
  });
  var emails = splitEmails_(cells.join(',')).list;
  if (!emails.length) throw new Error('Không thấy email nào trong tab đầu của sheet.');
  return { emails: emails, sheet: ss.getName ? ss.getName() : '' };
}

/** Kiểm tra một tệp trên Drive để đính kèm: { id, name, size }. */
function driveFileInfo(token, url) {
  requireUcv_(token);
  var id = idFromUrl_(url), f;
  try { f = DriveApp.getFileById(id); f.getName(); } catch (e) { throw new Error('Không mở được tệp. Kiểm tra link và chia sẻ tệp cho tài khoản Google của CLB.'); }
  if (f.getSize() > MAIL_FILE_MB * 1048576) throw new Error('Tệp lớn hơn ' + MAIL_FILE_MB + ' MB.');
  return { id: f.getId(), name: f.getName(), size: f.getSize() };
}

/** Các yêu cầu của tôi (mới nhất trước). */
function myMailRequests(token) {
  var me = requireUcv_(token);
  var names = namesById_(me.data.members), edited = editedByBod_();
  return readTable_('mail_requests').filter(function (r) { return r.drafted_by === me.memberId; }).map(function (r) {
    var v = requestView_(r, names);
    v.editedByBod = !!edited[r.request_id];
    return v;
  }).reverse().slice(0, 300);
}

/** Chi tiết một yêu cầu, kèm nội dung (ảnh trong thư đổi sang dạng xem được). UCV chỉ xem yêu cầu của mình. */
function mailRequest(token, id) {
  var me = requireMailReader_(token), r = requestOf_(id);
  if (!me.user.isBod && r.drafted_by !== me.memberId) throw new Error('Không tìm thấy yêu cầu này.');
  if (me.user.isBod && r.status === 'draft') throw new Error('Yêu cầu này còn là nháp của UCV.');
  var v = requestView_(r, namesById_(me.data.members));
  v.body = imagesForView_(r.body);
  v.editedByBod = !!editedByBod_()[r.request_id];
  v.gmailLink = r.gmail_thread_id ? gmailLink_('#all/' + r.gmail_thread_id) : '';
  return v;
}

/**
 * UCV lưu nháp (submit false) hoặc gửi BOD duyệt (submit true). id: yêu cầu đang sửa (trống là yêu cầu mới).
 * f: { action, threadId, to, cc, bcc, subject, body (HTML), quote, label, keep[], files[], drive[] }.
 */
function saveMailRequest(token, f, submit, id) {
  var me = requireUcv_(token);
  f = f || {};
  var body = cleanHtml_(f.body);
  if (!htmlHasContent_(body)) body = '';
  f.body = body;
  if (submit) { var err = mailRequestError_(f); if (err) throw new Error(err); }
  else if (MAIL_SEND_ACTIONS.indexOf(f.action) < 0 && MAIL_THREAD_ACTIONS.indexOf(f.action) < 0) throw new Error('Thao tác không hợp lệ.');
  var old = null;
  if (id) {
    old = requestOf_(id);
    if (old.drafted_by !== me.memberId) throw new Error('Không tìm thấy yêu cầu này.');
    if (MAIL_EDITABLE.indexOf(old.status) < 0) throw new Error('Yêu cầu này đang chờ duyệt hoặc đã xử lý, không sửa được nữa.');
  }
  var subjectOfThread = '';
  if (f.threadId) subjectOfThread = threadById_(f.threadId).getFirstMessageSubject() || '';
  var stored = storeMailFiles_(old ? parseJson_(old.attachments, []) : [], f, body);
  var rec = {
    action: f.action, gmail_thread_id: String(f.threadId || ''), thread_subject: subjectOfThread,
    to: splitEmails_(f.to).list.join(', '), cc: splitEmails_(f.cc).list.join(', '), bcc: splitEmails_(f.bcc).list.join(', '),
    subject: String(f.subject || '').trim().slice(0, 250), body: stored.body, is_html: true, quote_original: f.quote !== false,
    label: String(f.label || '').trim().slice(0, 100), attachments: JSON.stringify(stored.attachments), status: submit ? 'pending' : 'draft'
  };
  var saved;
  if (old) saved = updateRecord_('mail_requests', old.request_id, rec);
  else {
    rec.created_at = new Date(); rec.drafted_by = me.memberId;
    saved = insertRecords_('mail_requests', [rec], { termId: requireTerm_().term_id })[0];
  }
  return { id: saved.request_id, files: stored.attachments, status: saved.status };
}

/** UCV xoá yêu cầu nháp, cần sửa lại hoặc bị từ chối của mình. */
function deleteMailRequest(token, id) {
  var me = requireUcv_(token), r = requestOf_(id);
  if (r.drafted_by !== me.memberId) throw new Error('Không tìm thấy yêu cầu này.');
  if (MAIL_DELETABLE.indexOf(r.status) < 0) throw new Error('Chỉ xoá được yêu cầu nháp, cần sửa lại hoặc bị từ chối.');
  deleteRecord_('mail_requests', r.request_id);
  return myMailRequests(token);
}

/* ---------- Gọi từ trang web: BOD ---------- */

/** Các yêu cầu BOD duyệt (không gồm nháp của UCV): chờ duyệt trước, rồi mới nhất. */
function mailReview(token) {
  var me = requireUser_(token, 'bod');
  var names = namesById_(me.data.members), edited = editedByBod_();
  var list = readTable_('mail_requests').filter(function (r) { return r.status !== 'draft'; }).map(function (r) {
    var v = requestView_(r, names);
    v.editedByBod = !!edited[r.request_id];
    return v;
  }).reverse();
  list.sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1); });
  return { gmail: gmailLink_(''), requests: list.slice(0, 300), pending: list.filter(function (v) { return v.status === 'pending'; }).length };
}

/** Thư gốc để trả lời: thư cuối cùng không do CLB gửi. */
function replyTarget_(t) {
  var msgs = t.getMessages(), me = clubEmail_();
  for (var i = msgs.length - 1; i >= 0; i--) if (String(msgs[i].getFrom()).toLowerCase().indexOf(me) < 0) return msgs[i];
  return msgs[msgs.length - 1];
}

function formatMailDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

/** Thân thư cuối cùng: nội dung (ảnh Drive thành ảnh nhúng cid), chữ ký CLB nếu bật. Trả về { html, inline }. */
function mailBodyForSend_(r) {
  var inline = {}, n = 0;
  var body = String(r.body || '').replace(/src=("|')drive:([a-zA-Z0-9_-]+)\1/g, function (all, q, id) {
    var key = 'img' + (n++);
    inline[key] = DriveApp.getFileById(id).getBlob();
    return 'src=' + q + 'cid:' + key + q;
  });
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + body + '</div>';
  var sig = mailSignature_();
  if (sig.on && sig.html) html += '<br><div>--</div>' + sig.html;
  return { html: html, inline: inline };
}

/** Làm yêu cầu đã duyệt trên Gmail CLB. Trả về mã luồng thư. */
function executeMailRequest_(r) {
  var a = r.action;
  if (MAIL_SEND_ACTIONS.indexOf(a) >= 0) {
    var b = mailBodyForSend_(r), text = htmlToText_(b.html);
    var opts = { htmlBody: b.html };
    if (Object.keys(b.inline).length) opts.inlineImages = b.inline;
    if (r.cc) opts.cc = r.cc;
    if (r.bcc) opts.bcc = r.bcc;
    var files = parseJson_(r.attachments, []);
    if (files.length) opts.attachments = files.map(function (f) { return DriveApp.getFileById(f.id).getBlob().setName(f.name); });
    if (a === 'compose') return GmailApp.createDraft(r.to, r.subject, text, opts).send().getThread().getId();
    var t = threadById_(r.gmail_thread_id);
    if (a === 'reply' || a === 'reply_all') {
      var orig = replyTarget_(t);
      if (r.quote_original !== false) {
        opts.htmlBody = b.html + '<br><div class="gmail_quote"><div class="gmail_attr">Vào ' + formatMailDate_(orig.getDate()) + ', ' + escHtml_(orig.getFrom()) + ' đã viết:<br></div>' +
          '<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">' + orig.getBody() + '</blockquote></div>';
      }
      (a === 'reply' ? orig.createDraftReply(text, opts) : orig.createDraftReplyAll(text, opts)).send();
      return t.getId();
    }
    var msgs = t.getMessages(), last = msgs[msgs.length - 1];
    var head = '<br><br>---------- Thư được chuyển tiếp ----------<br>Từ: ' + escHtml_(last.getFrom()) + '<br>Ngày: ' + formatMailDate_(last.getDate()) +
      '<br>Tiêu đề: ' + escHtml_(last.getSubject()) + '<br>Tới: ' + escHtml_(last.getTo()) + '<br><br>';
    opts.htmlBody = (htmlHasContent_(r.body) ? b.html : '') + head + last.getBody();
    opts.attachments = last.getAttachments().concat(opts.attachments || []);
    opts.subject = r.subject || ('Fwd: ' + last.getSubject());
    last.forward(r.to, opts);
    return t.getId();
  }
  var th = threadById_(r.gmail_thread_id);
  if (a === 'archive') th.moveToArchive();
  else if (a === 'move_to_inbox') th.moveToInbox();
  else if (a === 'trash') th.moveToTrash();
  else if (a === 'report_spam') th.moveToSpam();
  else if (a === 'add_label') (GmailApp.getUserLabelByName(r.label) || GmailApp.createLabel(r.label)).addToThread(th);
  else if (a === 'remove_label') { var l = GmailApp.getUserLabelByName(r.label); if (l) l.removeFromThread(th); }
  else throw new Error('Thao tác không hợp lệ.');
  return th.getId();
}

/**
 * BOD quyết định một yêu cầu đang chờ duyệt. decision: approved (làm ngay trên Gmail), needs_changes, rejected (cần ghi chú).
 * edits: { to, cc, bcc, subject, body } khi BOD sửa trực tiếp rồi duyệt; mỗi chỗ sửa ghi Nhật ký để UCV thấy.
 */
function decideMailRequest(token, id, decision, note, edits) {
  var me = requireUser_(token, 'bod');
  if (['approved', 'needs_changes', 'rejected'].indexOf(decision) < 0) throw new Error('Quyết định không hợp lệ.');
  note = String(note || '').trim().slice(0, 2000);
  if (decision !== 'approved' && !note) throw new Error('Bạn ghi vài chữ cho UCV biết cần sửa gì hoặc vì sao từ chối nhé.');
  var failed = '';
  withLock_(function () {
    var r = requestOf_(id);
    if (r.status !== 'pending') throw new Error('Yêu cầu này đã được xử lý rồi.');
    if (edits && decision === 'approved') {
      var patch = {};
      if (edits.to !== undefined) patch.to = splitEmails_(edits.to).list.join(', ');
      if (edits.cc !== undefined) patch.cc = splitEmails_(edits.cc).list.join(', ');
      if (edits.bcc !== undefined) patch.bcc = splitEmails_(edits.bcc).list.join(', ');
      if (edits.subject !== undefined) patch.subject = String(edits.subject || '').trim().slice(0, 250);
      if (edits.body !== undefined) patch.body = storeMailFiles_([], {}, cleanHtml_(edits.body)).body;
      Object.keys(patch).forEach(function (k) { if (String(patch[k]) === String(r[k] || '')) delete patch[k]; });
      var check = mailRequestError_({ action: r.action, threadId: r.gmail_thread_id, to: patch.to !== undefined ? patch.to : r.to,
        cc: patch.cc !== undefined ? patch.cc : r.cc, bcc: patch.bcc !== undefined ? patch.bcc : r.bcc,
        subject: patch.subject !== undefined ? patch.subject : r.subject, body: patch.body !== undefined ? patch.body : r.body, label: r.label });
      if (check) throw new Error(check);
      if (Object.keys(patch).length) r = updateRecord_('mail_requests', r.request_id, patch, { actorId: me.memberId, action: 'approve_mail' });
    }
    var status = decision, threadId = r.gmail_thread_id || '';
    if (decision === 'approved') {
      try { threadId = executeMailRequest_(r) || threadId; }
      catch (e) { status = 'error'; failed = String(e.message || e); note = (note ? note + '\n' : '') + 'Lỗi: ' + failed; }
    }
    updateRecord_('mail_requests', r.request_id, { status: status, review_note: note, reviewed_by: me.memberId, reviewed_at: new Date(), gmail_thread_id: threadId },
      { actorId: me.memberId, action: 'approve_mail' });
  });
  if (failed) throw new Error('Gmail báo lỗi nên chưa làm được: ' + failed + '. Yêu cầu chuyển sang Lỗi.');
  return mailReview(token);
}

/** Cài đặt > Hộp thư > Chữ ký: { on, html, error, editLink }. refresh: đọc lại từ Gmail. */
function signatureSettings(token, refresh) {
  requireUser_(token, 'bod');
  var s = mailSignature_(!!refresh);
  s.editLink = gmailLink_('#settings/general');
  return s;
}

function saveSignatureSetting(token, on) {
  var me = requireUser_(token, 'bod');
  setSetting_('mail_signature', on ? '1' : '0', me.memberId);
  return signatureSettings(token, false);
}
