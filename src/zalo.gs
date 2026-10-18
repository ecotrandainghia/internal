/**
 * Bot Zalo của CLB. Head HR tạo bot mỗi năm và dán mã bot trong Cài đặt; mã bot cất trong thuộc tính
 * dự án, không ghi vào sheet. Mỗi tài khoản có một Mã kết nối ở tab Kết nối Zalo; ai muốn nhận tin qua Zalo thì nhắn mã
 * đó cho bot một lần, app đọc tin của bot và ghi lại Mã chat Zalo để biết gửi vào đâu.
 */

var ZALO_API = 'https://bot-api.zapps.me/bot';
var ZALO_TOKEN_PROP = 'ZALO_BOT_TOKEN';
var ZALO_MAX_CHARS = 2000;
var LINK_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function zaloToken_() {
  return String(PropertiesService.getScriptProperties().getProperty(ZALO_TOKEN_PROP) || '').trim();
}

function zaloCall_(token, method, params) {
  var res = UrlFetchApp.fetch(ZALO_API + token + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(params || {}), muteHttpExceptions: true
  });
  var out;
  try { out = JSON.parse(res.getContentText()); } catch (e) { out = null; }
  if (!out || !out.ok) {
    var err = new Error('Zalo báo lỗi: ' + (out && (out.description || out.message) ? (out.description || out.message) : 'mã lỗi ' + res.getResponseCode()));
    err.code = out && out.error_code;
    throw err;
  }
  return out.result;
}

/** Chia tin dài thành nhiều tin, mỗi tin không quá max ký tự, ưu tiên cắt ở chỗ xuống dòng. */
function splitMessage_(text, max) {
  var out = [], cur = '';
  String(text).split('\n').forEach(function (line) {
    while (line.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(line.slice(0, max));
      line = line.slice(max);
    }
    if (cur && cur.length + 1 + line.length > max) { out.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  });
  if (cur) out.push(cur);
  return out;
}

function zaloSend_(token, chatId, text) {
  splitMessage_(text, ZALO_MAX_CHARS).forEach(function (part) { zaloCall_(token, 'sendMessage', { chat_id: String(chatId), text: part }); });
}

/** Mã kết nối 6 ký tự, không có chữ dễ nhầm như O và 0, I và 1. taken: các mã đã dùng. */
function newLinkCode_(taken) {
  for (var round = 0; round < 20; round++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid()), code = '';
    for (var i = 0; i < 6; i++) code += LINK_CODE_CHARS.charAt((bytes[i] + 256) % LINK_CODE_CHARS.length);
    if (!taken || taken.indexOf(code) < 0) return code;
  }
  throw new Error('Không tạo được mã kết nối.');
}

/** Tìm mã kết nối trong tin người dùng nhắn bot. */
function findLinkCode_(text, codes) {
  var words = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').split(/\s+/);
  for (var i = 0; i < codes.length; i++) if (codes[i] && words.indexOf(String(codes[i]).toUpperCase()) >= 0) return codes[i];
  return '';
}

/** Mỗi tài khoản một dòng ở tab Kết nối Zalo. Trả về các dòng (đã thêm dòng cho tài khoản mới). */
function ensureZaloLinks_() {
  var missing = function () {
    var links = readTable_('zalo_links'), has = {};
    links.forEach(function (l) { has[l.member_id] = true; });
    return { links: links, ids: readTable_('accounts').map(function (a) { return a.member_id; }).filter(function (id) { return id && !has[id]; }) };
  };
  var m = missing();
  if (!m.ids.length) return m.links;
  return withLock_(function () {
    var again = missing();
    if (!again.ids.length) return again.links;
    var taken = again.links.map(function (l) { return l.link_code; });
    var rows = again.ids.map(function (id) { var c = newLinkCode_(taken); taken.push(c); return { member_id: id, link_code: c }; });
    insertRecords_('zalo_links', rows);
    return readTable_('zalo_links');
  });
}

/**
 * Đọc tin mới nhắn cho bot. Tin có mã kết nối thì ghi lại Mã chat Zalo của người đó và trả lời xác nhận.
 * waitSec: chờ thêm để người dùng kịp nhắn (nút Kiểm tra); lịch tự chạy gọi với 0.
 * Trả về { messages, linked: [Mã TV], unknown: [{ name, text }], error }.
 */
function readZaloUpdates_(waitSec) {
  var token = zaloToken_(), out = { messages: 0, linked: [], unknown: [], error: '' };
  if (!token) return out;
  var links = ensureZaloLinks_(), codes = links.map(function (l) { return l.link_code; });
  var names = namesById_(readTable_('members'));
  var until = Date.now() + (waitSec || 0) * 1000;
  for (var round = 0; round < 30; round++) {
    var left = Math.floor((until - Date.now()) / 1000), got;
    try { got = zaloCall_(token, 'getUpdates', { timeout: String(Math.max(1, Math.min(left, 20))) }); } catch (e) {
      // Không có tin mới thì Zalo trả lỗi hết giờ chờ: còn thời gian thì chờ tiếp.
      if (e.code !== 408 && !/time ?out/i.test(e.message)) { out.error = e.message; break; }
      if (until - Date.now() < 2000) break;
      continue;
    }
    var list = Array.isArray(got) ? got : got ? [got] : [];
    if (!list.length) { if (until - Date.now() < 2000) break; continue; }
    list.forEach(function (u) {
      var m = u && u.message;
      if (!m || !m.chat || !m.chat.id) return;
      out.messages++;
      var code = findLinkCode_(m.text, codes), row = links.filter(function (l) { return l.link_code === code; })[0];
      var zaloName = String((m.from && m.from.display_name) || '');
      try {
        if (row) {
          withLock_(function () { updateRecord_('zalo_links', row.member_id, { chat_id: String(m.chat.id), zalo_name: zaloName, linked_at: new Date() }); });
          out.linked.push(row.member_id);
          zaloSend_(token, m.chat.id, 'Đã kết nối với app CLB ECO. Từ nay ' + (names[row.member_id] || 'bạn') + ' sẽ nhận thông báo ở đây.');
        } else {
          if (out.unknown.length < 5) out.unknown.push({ name: zaloName, text: String(m.text || '(không phải chữ)').slice(0, 40) });
          zaloSend_(token, m.chat.id, 'Bot này gửi thông báo của app CLB ECO. Muốn nhận, bạn gửi mã kết nối 6 ký tự của mình (xem trong app, Cài đặt, Thông báo của tôi).');
        }
      } catch (e) { /* trả lời lỗi thì bỏ qua, lần sau vẫn chạy */ }
    });
    if (out.linked.length) until = Date.now();
  }
  return out;
}

/** Câu báo kết quả đọc tin, hiện trên trang. */
function zaloCheckText_(r) {
  if (r.error) return 'Không đọc được tin nhắn của bot. ' + r.error;
  if (!r.messages) return 'Trong lúc chờ, bot không nhận được tin nào. Bấm Kiểm tra lại, rồi trong vòng 25 giây nhắn mã cho bot (khung chat của chính bot, không phải Zalo Bot Manager).';
  var s = 'Đã đọc ' + r.messages + ' tin mới, ' + r.linked.length + ' người vừa kết nối.';
  if (r.unknown.length) s += ' Tin không có mã đúng: ' + r.unknown.map(function (t) { return (t.name ? t.name + ': ' : '') + '“' + t.text + '”'; }).join(', ') + '.';
  return s;
}

/** Bot có webhook thì Zalo không trả tin qua getUpdates, nên gỡ webhook trước khi đọc. */
function dropZaloWebhook_() {
  try { zaloCall_(zaloToken_(), 'deleteWebhook', {}); } catch (e) { /* chưa có webhook thì thôi */ }
}

/** Tên bot người dùng tìm được trong Zalo. */
function zaloBotName_(bot) {
  return String((bot && (bot.display_name || bot.name || bot.account_name)) || '');
}
