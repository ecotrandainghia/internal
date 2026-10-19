/**
 * Thông báo của app: gửi qua Zalo và app trên điện thoại, theo hai cột Nhận qua Zalo, Nhận qua app ở tab Tài khoản.
 * Mọi loại tin đi theo lựa chọn này; một đường lỗi thì đường kia vẫn gửi. Mỗi tin gửi một người là một dòng ở tab
 * Thông báo (gửi qua đường nào cũng ghi), để trang Thông báo cho mỗi người xem lại tin của mình trong 30 ngày.
 */

var NOTIFY_KEEP_DAYS = 30;
/** Tin báo BOD: [dòng Cài đặt, tên hiện trên app, mặc định]. Seeding mặc định tắt. */
var BOD_ALERTS = {
  mail: ['notify_bod_mail', 'Thư UCV chờ duyệt', '1'],
  feedback: ['notify_bod_feedback', 'Góp ý mới', '1'],
  seeding: ['notify_bod_seeding', 'Người phụ trách seeding ghi nhận một bài', '0']
};

/** Mã ngắn của một máy (từ địa chỉ nhận tin), để trang web gỡ máy mà không lộ địa chỉ hay mã máy. */
function deviceId_(endpoint) {
  return base64Url_(unsignedBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(endpoint)))).slice(0, 12);
}

function deviceView_(d) {
  return { id: deviceId_(d.endpoint), name: d.device_name || 'Máy không rõ tên', at: d.enabled_at ? d.enabled_at.getTime() : null };
}

/** Ai cần nhận tin, qua đường nào: { Mã TV: { id, name, zalo, app, chatId, zaloName, code, devices } } (mọi tài khoản). */
function notifyPeople_() {
  var names = namesById_(readTable_('members')), out = {};
  readTable_('accounts').forEach(function (a) {
    out[a.member_id] = { id: a.member_id, name: names[a.member_id] || a.member_id, zalo: !!a.notify_zalo, app: !!a.notify_app,
      selfRemind: !!a.self_remind, chatId: '', zaloName: '', code: '', devices: [] };
  });
  ensureZaloLinks_().forEach(function (z) {
    var p = out[z.member_id];
    if (p) { p.chatId = String(z.chat_id || ''); p.zaloName = z.zalo_name || ''; p.code = z.link_code; }
  });
  readTable_('devices').forEach(function (d) { if (out[d.member_id]) out[d.member_id].devices.push(d); });
  return out;
}

/**
 * Gửi tin cho một người qua các đường channels ({ zalo, app }), lỗi đường này không chặn đường kia.
 * Không ghi tab Thông báo (người gọi ghi). Trả về { sent: số đường gửi được, report: [câu], gone: [endpoint] }.
 */
function deliver_(p, title, body, channels, zaloToken) {
  var out = { sent: 0, report: [], gone: [] };
  if (channels.zalo) {
    if (!zaloToken) out.report.push('Zalo: CLB chưa nhập mã bot.');
    else if (!p.chatId) out.report.push('Zalo: chưa kết nối bot.');
    else {
      try { zaloSend_(zaloToken, p.chatId, 'CLB ECO: ' + title + '\n' + body); out.sent++; out.report.push('Zalo: đã gửi.'); }
      catch (e) { out.report.push('Zalo: lỗi ' + e.message); }
    }
  }
  if (channels.app) {
    try {
      var r = pushToDevices_(p.devices, title, body);
      if (r.sent) out.sent++;
      out.report = out.report.concat(r.report);
      out.gone = r.gone;
    } catch (e) { out.report.push('App: lỗi ' + e.message); }
  }
  return out;
}

function dropDevices_(endpoints) {
  if (!endpoints.length) return;
  withLock_(function () { endpoints.forEach(function (ep) { if (findRecord_('devices', ep)) deleteRecord_('devices', ep); }); });
}

/**
 * Gửi tin cho nhiều người theo đường mỗi người chọn. items: [{ memberId, title, body }].
 * Ghi tab Thông báo trước (kể cả người chưa cài đường nào, để vẫn xem lại được trong app), rồi mới gửi.
 * Trả về { sent: số người nhận được qua ít nhất một đường, failed: [{ id, name, why }] }.
 */
function notifyMembers_(items) {
  items = (items || []).filter(function (x) { return x && x.memberId && x.title; });
  var out = { sent: 0, failed: [] };
  if (!items.length) return out;
  var people = notifyPeople_(), token = zaloToken_(), gone = [], now = new Date();
  items = items.filter(function (x) { return people[x.memberId]; });
  withLock_(function () {
    insertRecords_('notifications', items.map(function (x) {
      return { sent_at: now, member_id: x.memberId, title: String(x.title).slice(0, 200), body: String(x.body || '').slice(0, 3000) };
    }));
  });
  items.forEach(function (x) {
    var p = people[x.memberId];
    if (!p.zalo && !p.app) { out.failed.push({ id: p.id, name: p.name, why: 'chưa chọn cách nhận nào' }); return; }
    var r = deliver_(p, x.title, x.body || '', { zalo: p.zalo, app: p.app }, token);
    gone = gone.concat(r.gone);
    if (r.sent) out.sent++;
    else out.failed.push({ id: p.id, name: p.name, why: r.report.join(' ') });
  });
  dropDevices_(gone);
  return out;
}

/** Như notifyMembers_ nhưng không bao giờ báo lỗi ra ngoài: tin báo hỏng không được làm hỏng việc chính. */
function notifyQuietly_(items) {
  try { return notifyMembers_(items); } catch (e) { return { sent: 0, failed: [{ why: String(e.message || e) }] }; }
}

/** Lịch nhắc hằng ngày (nhắc task, nhắc sinh nhật, đọc tin Zalo, xoá tin cũ) phải có sẵn khi đã có người cài nhận tin. */
function ensureRemindersQuietly_() {
  try { ensureReminderTriggers_(); } catch (e) { /* lần sau cài lại */ }
  ensureBirthdayTrigger_();
}

/** Mã TV của BOD đang ở CLB (theo nhiệm kỳ mới nhất của từng người). */
function bodIds_(data) {
  data = data || peopleData_();
  return data.accounts.map(function (a) { return a.member_id; }).filter(function (id) {
    var t = latestTermRow_(data.member_terms, id);
    return t && t.status === 'active' && t.dept_code === 'BOD';
  });
}

function bodAlertOn_(kind) {
  var a = BOD_ALERTS[kind];
  return String(getSetting_(a[0], a[2])) === '1';
}

/** Báo cho mọi BOD một việc (thư chờ duyệt, góp ý mới, seeding), nếu BOD đang bật loại tin đó. */
function alertBod_(kind, title, body) {
  try {
    if (!bodAlertOn_(kind)) return;
    notifyQuietly_(bodIds_().map(function (id) { return { memberId: id, title: title, body: body }; }));
  } catch (e) { /* tin báo hỏng thì bỏ qua */ }
}

/** Xoá thông báo cũ hơn số ngày giữ (chạy kèm lịch nhắc hằng ngày). */
function dropOldNotifications_() {
  var cut = Date.now() - getNumberSetting_('notify_keep_days', NOTIFY_KEEP_DAYS) * 864e5;
  withLock_(function () {
    var sh = sheet_('notifications'), values = sh.getDataRange().getValues();
    if (values.length < 2) return;
    var col = values[0].indexOf('sent_at'), width = values[0].length;
    var keep = values.slice(1).filter(function (r) { var d = readCell_(r[col], 'time'); return !d || d.getTime() >= cut; });
    if (keep.length === values.length - 1) return;
    // Ghi đè các dòng còn giữ lên trên, phần dưới để trống (nhanh hơn xoá từng dòng).
    var blank = [];
    for (var i = 0; i < width; i++) blank.push('');
    while (keep.length < values.length - 1) keep.push(blank.slice());
    sh.getRange(2, 1, keep.length, width).setValues(keep);
    delete memo_.notifications;
  });
}

/** Máy bật từ bản cũ (không có khoá mã hoá) tự hỏi nội dung bằng mã máy (doGet ?tb=). Trả về 5 tin mới nhất. */
function noticesForDevice_(key) {
  key = String(key || '');
  if (key.length < 20) return { ds: [] };
  return withLock_(function () {
    var d = readTable_('devices').filter(function (x) { return x.device_key === key; })[0];
    if (!d) return { ds: [] };
    var from = d.last_fetched_at ? d.last_fetched_at.getTime() : 0;
    var list = readTable_('notifications').filter(function (n) { return n.member_id === d.member_id && n.sent_at && n.sent_at.getTime() > from; })
      .slice(-5).map(function (n) { return { tieuDe: n.title, noiDung: n.body }; });
    updateRecord_('devices', d.endpoint, { last_fetched_at: new Date() });
    return { ds: list };
  });
}

/* ===================== Thông báo của tôi ===================== */

function mustNotify_(user, account) {
  return user.isBod || user.labels.indexOf('dept_lead') >= 0 || user.labels.indexOf('seeding_lead') >= 0 || user.labels.indexOf('birthday_lead') >= 0 || !!(account && account.self_remind);
}

function myNotifyFor_(me) {
  var p = notifyPeople_()[me.memberId];
  var account = me.data.accounts.filter(function (a) { return a.member_id === me.memberId; })[0];
  return {
    zalo: p.zalo, app: p.app, selfRemind: p.selfRemind, must: mustNotify_(me.user, account),
    bot: { has: !!zaloToken_(), name: String(getSetting_('zalo_bot_name', '')) },
    code: p.code, linked: !!p.chatId, zaloName: p.zaloName,
    devices: p.devices.map(deviceView_),
    publicKey: vapidKeys_().pub
  };
}

/** Cài đặt > Thông báo của tôi. */
function myNotify(token) {
  return myNotifyFor_(requireUser_(token));
}

/** Chọn đường nhận của mình. Phải còn ít nhất một đường. */
function saveMyChannels(token, ch) {
  var me = requireUser_(token);
  ch = ch || {};
  if (!ch.zalo && !ch.app) throw new Error('Bạn cần bật ít nhất một cách nhận: Zalo hoặc app.');
  withLock_(function () { updateRecord_('accounts', me.memberId, { notify_zalo: !!ch.zalo, notify_app: !!ch.app }); });
  ensureRemindersQuietly_();
  return myNotifyFor_(requireUser_(token));
}

/** Bật, tắt tự nhắc hạn task của mình (mặc định tắt vì người phụ trách ban nhắc giúp). */
function saveSelfRemind(token, on) {
  var me = requireUser_(token);
  withLock_(function () { updateRecord_('accounts', me.memberId, { self_remind: !!on }); });
  ensureRemindersQuietly_();
  return myNotifyFor_(requireUser_(token));
}

/** Đọc tin mới của bot (chờ tối đa 25 giây để bạn kịp nhắn mã). Trả về trang kèm câu báo. */
function checkMyZalo(token) {
  var me = requireUser_(token);
  if (!zaloToken_()) throw new Error('CLB chưa có bot Zalo. Nhờ BOD nhập mã bot trong Cài đặt, Thông báo của CLB.');
  dropZaloWebhook_();
  var r = readZaloUpdates_(25);
  var out = myNotifyFor_(me);
  out.checkText = zaloCheckText_(r);
  return out;
}

/** Ghi lại máy vừa bật thông báo (trang vỏ gửi lên sau khi đăng ký nhận tin). Bật luôn đường app. */
function saveDevice(token, info) {
  var me = requireUser_(token);
  info = info || {};
  var endpoint = String(info.endpoint || ''), key = String(info.key || '');
  if (!pushEndpointValid_(endpoint)) throw new Error('Máy này chưa hỗ trợ thông báo của app.');
  if (!/^[A-Za-z0-9-]{20,80}$/.test(key)) throw new Error('Thiếu mã của máy. Bạn thử bật lại nhé.');
  var p256dh = /^[A-Za-z0-9_-]{80,100}$/.test(String(info.p256dh || '')) ? String(info.p256dh) : '';
  var auth = /^[A-Za-z0-9_-]{16,30}$/.test(String(info.auth || '')) ? String(info.auth) : '';
  withLock_(function () {
    var rec = { member_id: me.memberId, device_key: key, device_name: String(info.name || '').slice(0, 80), enabled_at: new Date(),
      last_fetched_at: new Date(), p256dh: p256dh, auth: auth };
    if (findRecord_('devices', endpoint)) updateRecord_('devices', endpoint, rec);
    else { rec.endpoint = endpoint; insertRecords_('devices', [rec]); }
    updateRecord_('accounts', me.memberId, { notify_app: true });
  });
  ensureRemindersQuietly_();
  return myNotifyFor_(requireUser_(token));
}

/** Gỡ một máy. Chủ máy hoặc BOD gỡ được. Trả về trang của người gọi (BOD gỡ giúp thì trả về trang Thông báo của CLB). */
function removeDevice(token, id) {
  var me = requireUser_(token);
  withLock_(function () {
    var d = readTable_('devices').filter(function (x) { return deviceId_(x.endpoint) === String(id); })[0];
    if (!d) throw new Error('Máy này đã được gỡ rồi.');
    if (d.member_id !== me.memberId && !me.user.isBod) throw new Error('Bạn chỉ gỡ được máy của mình.');
    deleteRecord_('devices', d.endpoint);
  });
  return myNotifyFor_(me);
}

/** Gửi thử cho chính mình theo các đường đang bật. */
function sendMeTest(token) {
  var me = requireUser_(token);
  var p = notifyPeople_()[me.memberId];
  if (!p.zalo && !p.app) return { sent: 0, report: ['Bạn chưa bật cách nhận nào.'] };
  var title = 'Thông báo thử', body = 'Đây là tin thử. Bạn sẽ nhận thông báo của app CLB ECO theo cách này.';
  withLock_(function () { insertRecords_('notifications', [{ sent_at: new Date(), member_id: me.memberId, title: title, body: body }]); });
  var r = deliver_(p, title, body, { zalo: p.zalo, app: p.app }, zaloToken_());
  dropDevices_(r.gone);
  return { sent: r.sent, report: r.report };
}

/** Trang Thông báo: tin app đã gửi bạn trong những ngày còn giữ, mới nhất trước. */
function myNotifications(token) {
  var me = requireUser_(token);
  var days = getNumberSetting_('notify_keep_days', NOTIFY_KEEP_DAYS), cut = Date.now() - days * 864e5;
  return {
    days: days,
    items: readTable_('notifications').filter(function (n) { return n.member_id === me.memberId && n.sent_at && n.sent_at.getTime() >= cut; })
      .sort(function (a, b) { return b.sent_at.getTime() - a.sent_at.getTime(); })
      .map(function (n) { return { at: n.sent_at.getTime(), title: n.title, body: n.body }; })
  };
}

/* ===================== Thông báo của CLB (BOD) ===================== */

function clubNotifyFor_() {
  var data = peopleData_(), people = notifyPeople_();
  var depts = {};
  data.accounts.forEach(function (a) { var t = latestTermRow_(data.member_terms, a.member_id); if (t) depts[a.member_id] = t; });
  var list = Object.keys(people).filter(function (id) { return depts[id] && depts[id].status === 'active'; }).map(function (id) {
    var p = people[id];
    return { id: id, name: p.name, dept: depts[id].dept_code, zalo: p.zalo, app: p.app, linked: !!p.chatId, zaloName: p.zaloName,
      code: p.code, devices: p.devices.map(deviceView_) };
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  var alerts = {};
  Object.keys(BOD_ALERTS).forEach(function (k) { alerts[k] = { label: BOD_ALERTS[k][1], on: bodAlertOn_(k) }; });
  return {
    bot: { has: !!zaloToken_(), name: String(getSetting_('zalo_bot_name', '')) },
    people: list, alerts: alerts, keepDays: getNumberSetting_('notify_keep_days', NOTIFY_KEEP_DAYS)
  };
}

/** Cài đặt > Thông báo của CLB: ai nhận qua đường nào, bot Zalo, tin báo BOD. */
function clubNotify(token) {
  requireUser_(token, 'bod');
  ensureRemindersQuietly_();
  return clubNotifyFor_();
}

/**
 * Lưu mã bot Zalo (Head HR tạo bot mỗi năm). Mã cất trong thuộc tính dự án. Bot mới thì mọi người nhắn mã kết nối lại,
 * nên app xoá trắng Mã chat Zalo, Tên Zalo, Lúc kết nối của mọi dòng.
 */
function saveZaloBot(token, botToken) {
  var me = requireUser_(token, 'bod');
  botToken = String(botToken || '').trim();
  if (!botToken) throw new Error('Bạn dán mã bot Zalo vào nhé.');
  if (botToken === zaloToken_()) return clubNotifyFor_();
  var bot;
  try { bot = zaloCall_(botToken, 'getMe', {}); } catch (e) { throw new Error('Mã bot không dùng được. Bạn kiểm tra đã chép đủ mã chưa. (' + e.message + ')'); }
  PropertiesService.getScriptProperties().setProperty(ZALO_TOKEN_PROP, botToken);
  setSetting_('zalo_bot_name', zaloBotName_(bot), me.memberId, 'Tên bot Zalo của CLB (app tự ghi khi BOD nhập mã bot)');
  dropZaloWebhook_();
  withLock_(function () {
    var rows = readTable_('zalo_links').filter(function (z) { return z.chat_id || z.zalo_name || z.linked_at; });
    if (rows.length) updateRecords_('zalo_links', rows.map(function (z) { return { key: z.member_id, patch: { chat_id: '', zalo_name: '', linked_at: '' } }; }));
  });
  return clubNotifyFor_();
}

/** BOD đổi đường nhận của một người. */
function saveMemberChannels(token, memberId, ch) {
  requireUser_(token, 'bod');
  ch = ch || {};
  if (!ch.zalo && !ch.app) throw new Error('Mỗi người cần ít nhất một cách nhận.');
  withLock_(function () {
    if (!findRecord_('accounts', String(memberId))) throw new Error('Không tìm thấy tài khoản này.');
    updateRecord_('accounts', String(memberId), { notify_zalo: !!ch.zalo, notify_app: !!ch.app });
  });
  return clubNotifyFor_();
}

/** BOD gỡ kết nối Zalo của một người (nối nhầm người). */
function unlinkZalo(token, memberId) {
  requireUser_(token, 'bod');
  withLock_(function () { updateRecord_('zalo_links', String(memberId), { chat_id: '', zalo_name: '', linked_at: '' }); });
  return clubNotifyFor_();
}

/** BOD gửi thử cho một người hoặc mọi người ('*'), qua các đường BOD chọn (không theo lựa chọn của người nhận). */
function sendTest(token, memberId, ch) {
  var me = requireUser_(token, 'bod');
  ch = ch || {};
  if (!ch.zalo && !ch.app) throw new Error('Bạn chọn ít nhất một cách gửi.');
  var people = notifyPeople_(), ids = clubNotifyFor_().people.map(function (p) { return p.id; });
  if (memberId !== '*') ids = ids.filter(function (id) { return id === String(memberId); });
  if (!ids.length) throw new Error('Không tìm thấy người nhận.');
  var token_ = zaloToken_(), report = [], sent = 0, gone = [];
  var title = 'Thông báo thử', body = me.user.name + ' gửi thử thông báo cho bạn. Bạn đọc được dòng này là đã nhận được.';
  ids.forEach(function (id) {
    var r = deliver_(people[id], title, body, ch, token_);
    if (r.sent) sent++;
    gone = gone.concat(r.gone);
    r.report.forEach(function (line) { report.push(people[id].name + ' · ' + line); });
  });
  dropDevices_(gone);
  return { sent: sent, total: ids.length, report: report };
}

/** BOD bật tắt từng loại tin báo BOD. alerts: { mail, feedback, seeding } (true/false). */
function saveBodAlerts(token, alerts) {
  var me = requireUser_(token, 'bod');
  alerts = alerts || {};
  Object.keys(BOD_ALERTS).forEach(function (k) {
    if (alerts[k] === undefined || !!alerts[k] === bodAlertOn_(k)) return;
    setSetting_(BOD_ALERTS[k][0], alerts[k] ? '1' : '0', me.memberId, 'Báo BOD khi có ' + BOD_ALERTS[k][1].toLowerCase() + ' (1 là bật, 0 là tắt)');
  });
  return clubNotifyFor_();
}
