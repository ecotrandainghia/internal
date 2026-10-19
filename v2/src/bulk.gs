/**
 * Gửi hàng loạt, hẹn giờ, Lịch gửi và Danh bạ (chỉ BOD). Chuyển từ phần thư nháp và lịch gửi của app cũ (src/Mail.gs, src/Logic.gs).
 * BOD soạn thư nháp trong Gmail CLB (có chỗ điền như {Tên}), rồi trong app chọn thư nháp, chọn người nhận, gửi ngay hoặc hẹn giờ.
 * Thư hẹn giờ đến giờ mới đọc thư nháp, nên sửa thư nháp trong Gmail trước giờ gửi vẫn kịp.
 * Gmail thường chỉ gửi được khoảng 100 người nhận mỗi ngày: app hiện số còn lại, chặn khi vượt và cho chia đợt sang các ngày sau.
 */

var MAIL_DRAFT_LIMIT = 60;
var MAIL_DAILY_QUOTA = 100;
var MAIL_SHEET_ROWS = 2000;
var MAIL_SPLIT_HOUR = 7;
var MERGE_RE = /\{\{([^{}\n]{1,60})\}\}|\{([^{}\n]{1,60})\}/g;
var MEMBER_FIELDS = ['Họ và tên', 'Tên', 'Ban', 'Lớp', 'Chức vụ', 'Email', 'Ngày sinh'];
var CONTACT_FIELDS = ['Tên', 'Email', 'Nhóm', 'Ghi chú'];
var DRAFT_AS_IS = 'Người nhận ghi trong thư nháp';

/* ---------- Phần không đụng tới Google ---------- */

/** Các chỗ điền {Tên cột} hoặc {{Tên cột}} có trong chữ, theo thứ tự, không trùng. */
function mergeFields_(text) {
  var out = [], re = new RegExp(MERGE_RE.source, 'g'), m;
  while ((m = re.exec(String(text || '')))) {
    var name = (m[1] || m[2]).trim();
    if (name && out.indexOf(name) < 0) out.push(name);
  }
  return out;
}

/** Thay chỗ điền bằng dữ liệu của một người nhận (so tên cột không phân biệt dấu, hoa thường, khoảng trắng). escape: cho nội dung HTML. */
function fillMerge_(text, data, escape) {
  var byKey = {};
  Object.keys(data || {}).forEach(function (k) { byKey[headerKey_(k)] = data[k]; });
  var missing = [];
  var out = String(text || '').replace(new RegExp(MERGE_RE.source, 'g'), function (all, a, b) {
    var name = (a || b).trim(), k = headerKey_(name);
    if (Object.prototype.hasOwnProperty.call(byKey, k)) { var v = String(byKey[k] == null ? '' : byKey[k]); return escape ? escHtml_(v) : v; }
    if (missing.indexOf(name) < 0) missing.push(name);
    return all;
  });
  return { text: out, missing: missing };
}

/** Bảng từ một tab sheet: dòng tiêu đề là dòng có chữ đầu tiên (trong 10 dòng đầu). Trả về { columns, rows, emailColumn }. */
function tableFromValues_(values, tz) {
  var v = values || [], h = 0;
  var filled = function (line) { return line.some(function (c) { return String(c).trim(); }); };
  while (h < v.length && h < 10 && !filled(v[h])) h++;
  if (h >= v.length || h >= 10) return { columns: [], rows: [], emailColumn: '' };
  var columns = v[h].map(function (c, i) { return String(c).trim() || 'Cột ' + (i + 1); });
  var rows = [];
  for (var r = h + 1; r < v.length && rows.length < MAIL_SHEET_ROWS; r++) {
    if (!filled(v[r])) continue;
    var o = {};
    columns.forEach(function (c, i) {
      var x = v[r][i];
      o[c] = x instanceof Date ? Utilities.formatDate(x, tz || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : String(x == null ? '' : x).trim();
    });
    rows.push(o);
  }
  var emailColumn = columns.filter(function (c) { return /e-?mail|^mail$/.test(foldText_(c)); })[0] || '';
  if (!emailColumn) {
    var best = 0;
    columns.forEach(function (c) {
      var n = rows.filter(function (o) { return emailValid_(o[c]); }).length;
      if (n > best) { best = n; emailColumn = c; }
    });
  }
  return { columns: columns, rows: rows, emailColumn: emailColumn };
}

/**
 * Kiểm tra trước khi gửi (MAIL-11). tpl: { subject, html }; recipients: [{ email, data }]; fields: các trường nguồn người nhận có.
 * Trả về { list[{ email, subject, html }], used, unknown[], empty[{ field, emails[] }], invalid[], error }.
 * Trường không có trong nguồn thì chặn; người nhận trống ô ở trường đang dùng thì chỉ cảnh báo.
 */
function prepareBulk_(tpl, recipients, fields) {
  var res = { list: [], used: [], unknown: [], empty: [], invalid: [], error: '' };
  if (!String(tpl.subject || '').trim()) { res.error = 'Thư nháp chưa có tiêu đề. Mở Gmail, thêm tiêu đề cho thư nháp rồi thử lại.'; return res; }
  if (!htmlHasContent_(tpl.html)) { res.error = 'Thư nháp chưa có nội dung.'; return res; }
  res.used = mergeFields_(tpl.subject + ' ' + tpl.html);
  var have = (fields || []).map(headerKey_);
  res.unknown = res.used.filter(function (f) { return have.indexOf(headerKey_(f)) < 0; });
  var emptyBy = {}, seen = {};
  (recipients || []).forEach(function (n) {
    var e = String(n.email || '').trim();
    if (!emailValid_(e)) { res.invalid.push(e || '(trống)'); return; }
    if (seen[e.toLowerCase()]) return;
    seen[e.toLowerCase()] = true;
    var data = n.data || {}, byKey = {};
    Object.keys(data).forEach(function (k) { byKey[headerKey_(k)] = data[k]; });
    res.used.forEach(function (f) {
      if (res.unknown.indexOf(f) >= 0) return;
      if (!String(byKey[headerKey_(f)] == null ? '' : byKey[headerKey_(f)]).trim()) (emptyBy[f] = emptyBy[f] || []).push(e);
    });
    res.list.push({ email: e, subject: fillMerge_(tpl.subject, data, false).text, html: fillMerge_(tpl.html, data, true).text });
  });
  res.empty = Object.keys(emptyBy).map(function (f) { return { field: f, emails: emailsShort_(emptyBy[f]) }; });
  if (res.unknown.length) res.error = 'Thư dùng ' + res.unknown.map(function (f) { return '{' + f + '}'; }).join(', ') + ' nhưng nguồn người nhận không có cột này. Sửa thư nháp hoặc chọn nguồn khác.';
  else if (res.invalid.length) res.error = 'Có ' + res.invalid.length + ' email chưa đúng: ' + res.invalid.slice(0, 5).join(', ') + (res.invalid.length > 5 ? '…' : '');
  else if (!res.list.length) res.error = 'Chưa có người nhận nào.';
  return res;
}
function emailsShort_(list) { return list.slice(0, 50); }

/**
 * Chia danh sách thành các đợt theo hạn mức (MAIL-10). start: lúc gửi đợt đầu; firstCap: số còn gửi được ở đợt đầu.
 * Đợt sau gửi lúc MAIL_SPLIT_HOUR giờ các ngày kế tiếp (gửi ngay) hoặc cùng giờ các ngày kế tiếp (hẹn giờ), mỗi đợt MAIL_DAILY_QUOTA người.
 */
function splitBatches_(count, start, firstCap, scheduled) {
  var out = [], left = count, at = new Date(start.getTime()), cap = Math.max(0, firstCap);
  var day = 0;
  while (left > 0) {
    if (cap > 0) { var n = Math.min(cap, left); out.push({ at: new Date(at.getTime()), count: n, first: day === 0 }); left -= n; }
    day++;
    at = new Date(start.getTime());
    at.setDate(at.getDate() + day);
    if (!scheduled) at.setHours(MAIL_SPLIT_HOUR, 0, 0, 0);
    cap = MAIL_DAILY_QUOTA;
  }
  return out;
}

/* ---------- Gmail ---------- */

function draftById_(id) {
  var d = null;
  try { d = GmailApp.getDraft(String(id || '')); } catch (e) { d = null; }
  if (!d) throw new Error('Không tìm thấy thư nháp này trong Gmail của CLB, có thể đã bị xoá hoặc đã gửi.');
  return d;
}

function draftSummary_(d) {
  var m = d.getMessage(), html = String(m.getBody() || ''), subject = String(m.getSubject() || '');
  return {
    id: d.getId(), subject: subject, to: [m.getTo(), m.getCc(), m.getBcc()].filter(String).join(', '), at: m.getDate().getTime(),
    snippet: htmlToText_(html).replace(/\s+/g, ' ').slice(0, 160), fields: mergeFields_(subject + ' ' + htmlToText_(html)),
    files: m.getAttachments({ includeInlineImages: false }).map(function (a) { return a.getName(); }),
    link: gmailLink_('#drafts?compose=' + m.getId())
  };
}

/** Nội dung thư nháp để gửi: tiêu đề, HTML, tệp đính kèm, ảnh chèn trong thư (ghép cid theo tên ảnh như hướng dẫn mail merge của Google). */
function draftTemplate_(id) {
  var m = draftById_(id).getMessage(), html = String(m.getBody() || '');
  var byName = {};
  m.getAttachments({ includeInlineImages: true, includeAttachments: false }).forEach(function (a) { byName[a.getName()] = a; });
  var inline = {}, re = /<img[^>]*?src="cid:([^"]+)"[^>]*?alt="([^"]*)"[^>]*>/gi, x;
  while ((x = re.exec(html))) if (byName[x[2]]) inline[x[1]] = byName[x[2]];
  return { subject: String(m.getSubject() || ''), html: html, files: m.getAttachments({ includeInlineImages: false }), images: inline, to: [m.getTo(), m.getCc(), m.getBcc()].filter(String).join(',') };
}

function remainingQuota_() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return MAIL_DAILY_QUOTA; }
}

/** Gửi từng thư đã điền. Trả về { sent, errors[] }. */
function sendMerged_(list, tpl) {
  var sent = 0, errors = [];
  list.forEach(function (t) {
    try {
      var o = { htmlBody: t.html }; // tên người gửi là tên tài khoản Google CLB
      if (tpl.files.length) o.attachments = tpl.files;
      if (Object.keys(tpl.images).length) o.inlineImages = tpl.images;
      GmailApp.sendEmail(t.email, t.subject, htmlToText_(t.html), o);
      sent++;
    } catch (e) { errors.push(t.email + ': ' + String(e.message || e)); }
  });
  return { sent: sent, errors: errors };
}

function resultText_(sent, total, errors) {
  return 'Đã gửi ' + sent + '/' + total + ' thư' + (errors.length ? '. Lỗi: ' + errors.slice(0, 5).join('; ') : '');
}

function installSendTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runScheduledSends'; });
  if (!has) ScriptApp.newTrigger('runScheduledSends').timeBased().everyMinutes(10).create();
}

/* ---------- Nguồn người nhận ---------- */

/** Thành viên đang hoạt động có email, kèm các trường điền được (đặt tên tiếng Việt như cột của sheet thành viên). */
function memberRecipients_(data) {
  var term = currentTerm_(readTable_('terms'));
  if (!term) return [];
  var tz = Session.getScriptTimeZone(), byId = {};
  data.members.forEach(function (m) { byId[m.member_id] = m; });
  return data.member_terms.filter(function (r) { return String(r.term_id) === String(term.term_id) && r.status === 'active' && byId[r.member_id] && emailValid_(byId[r.member_id].email); })
    .map(function (r) {
      var m = byId[r.member_id], name = String(m.full_name || '');
      return { id: m.member_id, dept: r.dept_code, email: String(m.email).trim(), data: {
        'Họ và tên': name, 'Tên': name.trim().split(/\s+/).pop() || '', 'Ban': r.dept_code || '', 'Lớp': r.class_name || '', 'Chức vụ': r.position || '',
        'Email': String(m.email).trim(), 'Ngày sinh': m.birth_date instanceof Date ? Utilities.formatDate(m.birth_date, tz, 'dd/MM/yyyy') : ''
      } };
    }).sort(function (a, b) { return a.dept.localeCompare(b.dept) || a.data['Họ và tên'].localeCompare(b.data['Họ và tên'], 'vi'); });
}

function contactView_(c) {
  return { id: c.contact_id, group: c.group_name || 'Khác', name: c.name || '', email: c.email || '', note: c.note || '' };
}

/* ---------- Gọi từ trang web (BOD) ---------- */

/** Thư nháp trong Gmail CLB (60 thư mới sửa nhất) và các link mở Gmail. */
function mailDrafts(token) {
  requireUser_(token, 'bod');
  var list = GmailApp.getDrafts().slice(0, MAIL_DRAFT_LIMIT).map(draftSummary_);
  list.sort(function (a, b) { return b.at - a.at; });
  return { drafts: list, draftsLink: gmailLink_('#drafts'), newLink: gmailLink_('#drafts?compose=new'), quota: remainingQuota_() };
}

/** Xem nội dung một thư nháp. */
function mailDraft(token, id) {
  requireUser_(token, 'bod');
  var d = draftById_(id), v = draftSummary_(d);
  v.html = String(d.getMessage().getBody() || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  return v;
}

/** Nguồn người nhận: thành viên CLB, Danh bạ; cùng các trường điền được và số lượt gửi còn lại hôm nay. */
function bulkSources(token) {
  var me = requireUser_(token, 'bod');
  return {
    members: memberRecipients_(me.data), memberFields: MEMBER_FIELDS,
    contacts: readTable_('contacts').filter(function (c) { return emailValid_(c.email); }).map(contactView_), contactFields: CONTACT_FIELDS,
    quota: remainingQuota_(), dailyQuota: MAIL_DAILY_QUOTA
  };
}

/** Đọc một tab của Google Sheet (tài khoản CLB phải mở được), tối đa 2000 dòng. */
function readSendSheet(token, url, tab) {
  requireUser_(token, 'bod');
  var ss = openSheetByUrl_(url, 'sheet');
  var tabs = ss.getSheets().map(function (s) { return s.getName(); });
  var sh = tab ? ss.getSheetByName(String(tab)) : ss.getSheets()[0];
  if (!sh) throw new Error('Sheet không có tab "' + tab + '".');
  var t = tableFromValues_(sh.getDataRange().getValues().slice(0, MAIL_SHEET_ROWS + 11), Session.getScriptTimeZone());
  if (!t.columns.length) throw new Error('Tab này trống.');
  t.tabs = tabs; t.tab = sh.getName(); t.file = ss.getName ? ss.getName() : '';
  return t;
}

/**
 * Kiểm tra một lần gửi hàng loạt. req: { draftId, recipients[{ email, data }], fields[] }.
 * Trả về kết quả kiểm tra (không kèm từng thư), số còn gửi được hôm nay và thư mẫu điền cho người đầu tiên.
 */
function checkBulk(token, req) {
  requireUser_(token, 'bod');
  req = req || {};
  var tpl = draftTemplate_(req.draftId), r = prepareBulk_(tpl, req.recipients, req.fields);
  return {
    count: r.list.length, used: r.used, unknown: r.unknown, empty: r.empty, invalid: r.invalid.slice(0, 20), error: r.error,
    quota: remainingQuota_(), dailyQuota: MAIL_DAILY_QUOTA, files: tpl.files.map(function (f) { return f.getName(); }),
    preview: r.list[0] ? { to: r.list[0].email, subject: r.list[0].subject, html: r.list[0].html.replace(/<script[\s\S]*?<\/script>/gi, '') } : null
  };
}

/**
 * Gửi hàng loạt ngay hoặc hẹn giờ. req: { draftId, recipients, fields, source, sendAt (ms, trống là gửi ngay), split }.
 * Vượt hạn mức mà không chọn chia đợt thì báo lỗi; chia đợt thì mỗi đợt là một dòng ở Lịch gửi.
 */
function sendBulk(token, req) {
  var me = requireUser_(token, 'bod');
  req = req || {};
  var tpl = draftTemplate_(req.draftId), r = prepareBulk_(tpl, req.recipients, req.fields);
  if (r.error) throw new Error(r.error);
  var now = new Date(), sendAt = req.sendAt ? new Date(Number(req.sendAt)) : null;
  if (sendAt && !(sendAt.getTime() > now.getTime() + 60000)) throw new Error('Giờ hẹn phải sau bây giờ ít nhất 1 phút.');
  var quota = sendAt ? MAIL_DAILY_QUOTA : remainingQuota_();
  var batches = splitBatches_(r.list.length, sendAt || now, quota, !!sendAt);
  if (batches.length > 1 && !req.split) {
    throw new Error(sendAt ? 'Mỗi ngày Gmail CLB chỉ gửi được khoảng ' + MAIL_DAILY_QUOTA + ' người. Chọn chia đợt để gửi ' + r.list.length + ' người trong ' + batches.length + ' ngày.'
      : 'Hôm nay Gmail CLB chỉ còn gửi được ' + quota + ' người, bạn đang gửi ' + r.list.length + '. Chọn chia đợt, bớt người nhận hoặc hẹn giờ sang ngày mai.');
  }
  var source = String(req.source || '').slice(0, 200), term = requireTerm_().term_id, recips = (req.recipients || []);
  var byEmail = {};
  recips.forEach(function (n) { var e = String(n.email || '').trim().toLowerCase(); if (!byEmail[e]) byEmail[e] = { email: String(n.email).trim(), data: n.data || {} }; });
  var ordered = r.list.map(function (t) { return byEmail[t.email.toLowerCase()]; });
  var out = { sent: 0, errors: [], scheduled: 0, batches: batches.length };
  var offset = 0;
  batches.forEach(function (b, i) {
    var part = ordered.slice(offset, offset + b.count), merged = r.list.slice(offset, offset + b.count);
    offset += b.count;
    var label = batches.length > 1 ? source + ' (đợt ' + (i + 1) + '/' + batches.length + ')' : source;
    if (!sendAt && b.first) {
      var g = sendMerged_(merged, tpl);
      out.sent = g.sent; out.errors = g.errors;
      insertRecords_('mail_sends', [{ created_at: now, send_at: now, gmail_draft_id: '', subject: tpl.subject, recipients: JSON.stringify(part.map(function (p) { return { email: p.email }; })).slice(0, 45000),
        recipient_source: label, created_by: me.memberId, status: g.sent ? 'sent' : 'error', result: resultText_(g.sent, merged.length, g.errors) }], { termId: term });
      return;
    }
    var json = JSON.stringify(part);
    if (json.length > 45000) throw new Error('Danh sách người nhận quá lớn để hẹn giờ. Bớt cột trong sheet hoặc chia thành nhiều lần gửi nhỏ hơn.');
    insertRecords_('mail_sends', [{ created_at: now, send_at: b.at, gmail_draft_id: String(req.draftId), subject: tpl.subject, recipients: json,
      recipient_source: label, created_by: me.memberId, status: 'scheduled', result: '' }], { termId: term });
    out.scheduled++;
  });
  if (out.scheduled) installSendTrigger_();
  return out;
}

/** Hẹn giờ gửi một thư nháp như đang soạn (người nhận ghi trong thư nháp), không trộn thư. */
function scheduleDraft(token, draftId, sendAt) {
  var me = requireUser_(token, 'bod');
  var tpl = draftTemplate_(draftId), at = new Date(Number(sendAt));
  if (!splitEmails_(tpl.to).list.length) throw new Error('Thư nháp chưa có người nhận. Thêm người nhận trong Gmail, hoặc dùng Gửi hàng loạt.');
  if (!String(tpl.subject).trim()) throw new Error('Thư nháp chưa có tiêu đề.');
  if (!(at.getTime() > Date.now() + 60000)) throw new Error('Giờ hẹn phải sau bây giờ ít nhất 1 phút.');
  insertRecords_('mail_sends', [{ created_at: new Date(), send_at: at, gmail_draft_id: String(draftId), subject: tpl.subject, recipients: '',
    recipient_source: DRAFT_AS_IS, created_by: me.memberId, status: 'scheduled', result: '' }], { termId: requireTerm_().term_id });
  installSendTrigger_();
  return sendSchedule(token);
}

/** Lịch gửi: thư đã lên lịch (kể cả từ nhiệm kỳ trước) và lịch sử gửi, mới nhất trước. */
function sendSchedule(token) {
  var me = requireUser_(token, 'bod');
  var names = namesById_(me.data.members);
  var list = readTable_('mail_sends').map(function (s) {
    var n = s.recipients ? parseJson_(s.recipients, []).length : 0;
    return {
      id: s.send_id, createdAt: s.created_at ? s.created_at.getTime() : null, sendAt: s.send_at ? s.send_at.getTime() : null, subject: s.subject || '',
      count: n, source: s.recipient_source || '', by: names[s.created_by] || s.created_by || '', status: s.status, result: s.result || '',
      draftLink: s.status === 'scheduled' && s.gmail_draft_id ? gmailLink_('#drafts') : ''
    };
  });
  list.sort(function (a, b) { return (a.status === 'scheduled' ? 0 : 1) - (b.status === 'scheduled' ? 0 : 1) || (a.status === 'scheduled' ? a.sendAt - b.sendAt : b.sendAt - a.sendAt); });
  return { items: list.slice(0, 200), quota: remainingQuota_(), dailyQuota: MAIL_DAILY_QUOTA };
}

function scheduledSend_(id) {
  var s = findRecord_('mail_sends', String(id || ''));
  if (!s) throw new Error('Không tìm thấy thư đã lên lịch.');
  if (s.status !== 'scheduled') throw new Error('Thư này đã gửi hoặc đã huỷ, không sửa được nữa.');
  return s;
}

function rescheduleSend(token, id, sendAt) {
  requireUser_(token, 'bod');
  var at = new Date(Number(sendAt));
  if (!(at.getTime() > Date.now() + 60000)) throw new Error('Giờ hẹn phải sau bây giờ ít nhất 1 phút.');
  withLock_(function () { updateRecord_('mail_sends', scheduledSend_(id).send_id, { send_at: at }); });
  return sendSchedule(token);
}

function cancelSend(token, id) {
  requireUser_(token, 'bod');
  withLock_(function () { updateRecord_('mail_sends', scheduledSend_(id).send_id, { status: 'cancelled' }); });
  return sendSchedule(token);
}

/**
 * Chạy tự động mỗi 10 phút: gửi các thư đã đến giờ hẹn.
 * Chỉ khoá lúc đánh dấu Đang gửi và lúc ghi kết quả. Hết hạn mức thì dời đợt đó sang 7 giờ sáng hôm sau.
 */
function runScheduledSends() {
  var due = withLock_(function () {
    var now = Date.now();
    return readTable_('mail_sends').filter(function (s) { return s.status === 'scheduled' && s.send_at && s.send_at.getTime() <= now; })
      .map(function (s) { return updateRecord_('mail_sends', s.send_id, { status: 'sending' }); });
  });
  due.forEach(function (s) {
    var patch;
    try {
      if (!s.recipients) {
        var tplAsIs = draftTemplate_(s.gmail_draft_id), need = splitEmails_(tplAsIs.to).list.length;
        if (remainingQuota_() < need) patch = postpone_(s);
        else { draftById_(s.gmail_draft_id).send(); patch = { status: 'sent', result: 'Đã gửi thư nháp tới ' + need + ' người' }; }
      } else {
        var list = parseJson_(s.recipients, []), tpl = draftTemplate_(s.gmail_draft_id);
        var fields = [];
        list.forEach(function (n) { Object.keys(n.data || {}).forEach(function (k) { if (fields.indexOf(k) < 0) fields.push(k); }); });
        var r = prepareBulk_(tpl, list, fields);
        if (r.error) patch = { status: 'error', result: r.error };
        else if (remainingQuota_() < r.list.length) patch = postpone_(s);
        else {
          var g = sendMerged_(r.list, tpl);
          patch = { status: g.sent ? 'sent' : 'error', result: resultText_(g.sent, r.list.length, g.errors) };
        }
      }
    } catch (e) { patch = { status: 'error', result: String(e.message || e) }; }
    withLock_(function () { updateRecord_('mail_sends', s.send_id, patch); });
  });
  return due.length;
}

function postpone_(s) {
  var at = new Date();
  at.setDate(at.getDate() + 1); at.setHours(MAIL_SPLIT_HOUR, 0, 0, 0);
  return { status: 'scheduled', send_at: at, result: 'Hết hạn mức gửi hôm nay, app tự dời sang ' + formatMailDate_(at) + '.' };
}

/* ---------- Danh bạ (Cài đặt > Hộp thư > Danh bạ) ---------- */

function contactBook(token) {
  requireUser_(token, 'bod');
  var list = readTable_('contacts').map(contactView_).sort(function (a, b) { return a.group.localeCompare(b.group, 'vi') || a.name.localeCompare(b.name, 'vi'); });
  var groups = [];
  list.forEach(function (c) { if (groups.indexOf(c.group) < 0) groups.push(c.group); });
  return { contacts: list, groups: groups };
}

/** Thêm (không có id) hoặc sửa một liên hệ. c: { id, group, name, email, note }. */
function saveContact(token, c) {
  requireUser_(token, 'bod');
  c = c || {};
  var email = String(c.email || '').trim(), name = String(c.name || '').trim();
  if (!emailValid_(email)) throw new Error('Email chưa đúng.');
  var rec = { group_name: String(c.group || '').trim().slice(0, 100) || 'Khác', name: (name || email).slice(0, 200), email: email, note: String(c.note || '').trim().slice(0, 500) };
  var dup = readTable_('contacts').filter(function (x) { return String(x.email).toLowerCase() === email.toLowerCase() && x.group_name === rec.group_name && x.contact_id !== c.id; })[0];
  if (dup) throw new Error('Nhóm "' + rec.group_name + '" đã có email này.');
  if (c.id) {
    if (!findRecord_('contacts', String(c.id))) throw new Error('Không tìm thấy liên hệ này.');
    updateRecord_('contacts', String(c.id), rec);
  } else insertRecords_('contacts', [rec]);
  return contactBook(token);
}

function deleteContacts(token, ids) {
  requireUser_(token, 'bod');
  (ids || []).forEach(function (id) { if (findRecord_('contacts', String(id))) deleteRecord_('contacts', String(id)); });
  return contactBook(token);
}
