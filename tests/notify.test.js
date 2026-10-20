const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');
const asChi = (app) => login(app, 'chi@gmail.com', 'chungCLB');
const u8 = (a) => Buffer.from(a.map((b) => b & 255));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

/** Giả lập Zalo và máy chủ thông báo đẩy: ghi lại mọi lần gọi. */
function fakeWeb(app, opts = {}) {
  const calls = [];
  app.__fetch = (url, o) => {
    calls.push({ url, o });
    const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
    if (url.startsWith('https://bot-api.zapps.me/bot')) {
      const method = url.split('/').pop(), payload = JSON.parse(o.payload);
      if (opts.zaloDown) return reply(500, { ok: false, description: 'hỏng' });
      if (method === 'getMe') return reply(200, { ok: true, result: { display_name: 'ECO Bot' } });
      if (method === 'getUpdates') {
        const u = (opts.updates || []).shift();
        return u ? reply(200, { ok: true, result: u }) : reply(200, { ok: false, error_code: 408, description: 'time out' });
      }
      if (method === 'sendMessage') return reply(200, { ok: true, result: { chat_id: payload.chat_id } });
      return reply(200, { ok: true, result: true });
    }
    return reply(opts.pushCode || 201, '');
  };
  return calls;
}

test('ký ES256 và mã hoá tin đẩy đúng chuẩn: Node kiểm chữ ký và giải mã được', () => {
  const { app } = setUp();
  const priv = app.newP256Key_();
  const pub = u8(app.p256PublicKey_(priv));
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(u8(priv));
  assert.deepEqual(pub, ecdh.getPublicKey());
  const msg = 'eyJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJ4In0';
  const hash = Array.from(crypto.createHash('sha256').update(msg).digest());
  const sig = u8(app.p256Sign_(hash, priv));
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(msg), { key, dsaEncoding: 'ieee-p1363' }, sig));

  const device = crypto.createECDH('prime256v1');
  device.generateKeys();
  const auth = crypto.randomBytes(16), salt = crypto.randomBytes(16);
  const data = Array.from(Buffer.from(JSON.stringify({ tieuDe: 'Nhắc việc', noiDung: 'Thiết kế poster' })));
  const body = u8(app.encryptPush_(data, Array.from(device.getPublicKey()), Array.from(auth), app.newP256Key_(), Array.from(salt)));
  assert.deepEqual(body.subarray(0, 16), salt);
  assert.equal(body.readUInt32BE(16), 4096);
  const serverPub = body.subarray(21, 86), cipher = body.subarray(86);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const shared = device.computeSecret(serverPub);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), device.getPublicKey(), serverPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const dec = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  dec.setAuthTag(cipher.subarray(cipher.length - 16));
  const out = Buffer.concat([dec.update(cipher.subarray(0, cipher.length - 16)), dec.final()]);
  assert.equal(out[out.length - 1], 2);
  assert.deepEqual(JSON.parse(out.subarray(0, out.length - 1).toString()), { tieuDe: 'Nhắc việc', noiDung: 'Thiết kế poster' });
});

test('mỗi tài khoản có mã kết nối riêng 6 ký tự; nhắn mã cho bot thì app ghi lại Mã chat Zalo', () => {
  const { app } = setUp();
  const links = app.ensureZaloLinks_();
  assert.equal(links.length, 3);
  assert.ok(links.every((l) => /^[A-HJ-NP-Z2-9]{6}$/.test(l.link_code)));
  assert.equal(new Set(links.map((l) => l.link_code)).size, 3);
  const code = links.find((l) => l.member_id === 'M1').link_code;
  assert.throws(() => app.checkMyZalo(asBinh(app)), /chưa có bot/);
  app.__props.ZALO_BOT_TOKEN = 'tok';
  const calls = fakeWeb(app, { updates: [[{ message: { chat: { id: 'c1' }, from: { display_name: 'Bình Zalo' }, text: 'mã của mình: ' + code.toLowerCase() } },
    { message: { chat: { id: 'c9' }, from: { display_name: 'Lạ' }, text: 'xin chào' } }]] });
  const d = plain(app.checkMyZalo(asBinh(app)));
  assert.equal(d.linked, true);
  assert.equal(d.zaloName, 'Bình Zalo');
  assert.match(d.checkText, /2 tin mới, 1 người vừa kết nối.*Lạ: “xin chào”/);
  const sent = calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => JSON.parse(c.o.payload));
  assert.deepEqual(sent.map((m) => m.chat_id), ['c1', 'c9']);
  assert.match(sent[0].text, /Trần Thị Bình sẽ nhận thông báo ở đây/);
  assert.equal(app.findRecord_('zalo_links', 'M1').chat_id, 'c1');
});

test('gửi tin theo đường mỗi người chọn, ghi tab Thông báo, đường này lỗi thì đường kia vẫn gửi', () => {
  const { app } = setUp();
  app.__props.ZALO_BOT_TOKEN = 'tok';
  app.ensureZaloLinks_();
  app.updateRecord_('zalo_links', 'M1', { chat_id: 'c1' });
  app.updateRecord_('accounts', 'M1', { notify_zalo: true, notify_app: true });
  app.insertRecords_('devices', [{ endpoint: ENDPOINT, member_id: 'M1', device_key: 'k'.repeat(24), device_name: 'iPhone',
    p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }]);
  let calls = fakeWeb(app, { zaloDown: true });
  let r = plain(app.notifyMembers_([{ memberId: 'M1', title: 'Nhắc việc', body: 'Thiết kế poster' }, { memberId: 'M2', title: 'Nhắc việc', body: 'x' }]));
  assert.equal(r.sent, 1);
  assert.deepEqual(r.failed.map((f) => [f.id, f.why]), [['M2', 'chưa chọn cách nhận nào']]);
  const push = calls.find((c) => c.url === ENDPOINT);
  assert.equal(push.o.headers['Content-Encoding'], 'aes128gcm');
  assert.match(push.o.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
  assert.deepEqual(plain(app.readTable_('notifications').map((n) => [n.member_id, n.title, n.body])), [['M1', 'Nhắc việc', 'Thiết kế poster'], ['M2', 'Nhắc việc', 'x']]);

  calls = fakeWeb(app, { pushCode: 410 });
  r = plain(app.notifyMembers_([{ memberId: 'M1', title: 'Lần 2', body: 'y' }]));
  assert.equal(r.sent, 1);
  const zalo = calls.find((c) => c.url.endsWith('/sendMessage'));
  assert.equal(JSON.parse(zalo.o.payload).text, 'CLB ECO: Lần 2\ny');
  assert.equal(app.readTable_('devices').length, 0, 'máy đã tắt thông báo thì bị gỡ');
});

test('Thông báo của tôi: giữ ít nhất một đường, bật máy thì bật luôn đường app, chỉ chủ máy hoặc BOD gỡ được', () => {
  const { app } = setUp();
  const tok = asBinh(app);
  assert.throws(() => app.saveMyChannels(tok, { zalo: false, app: false }), /ít nhất một/);
  let d = plain(app.saveMyChannels(tok, { zalo: true, app: false }));
  assert.deepEqual([d.zalo, d.app, d.must, d.linked, d.devices.length], [true, false, false, false, 0]);
  assert.match(d.publicKey, /^[\w-]{87}$/);
  assert.equal(plain(app.myNotify(asChi(app))).must, true, 'Người phụ trách ban phải nhận tin');
  assert.throws(() => app.saveDevice(tok, { endpoint: 'https://evil.example.com/x', key: 'k'.repeat(24) }), /chưa hỗ trợ/);
  d = plain(app.saveDevice(tok, { endpoint: ENDPOINT, key: 'k'.repeat(24), name: 'iPhone' }));
  assert.deepEqual([d.app, d.devices.map((m) => m.name)], [true, ['iPhone']]);
  assert.ok(!JSON.stringify(d).includes(ENDPOINT), 'không gửi địa chỉ máy về trang web');
  assert.throws(() => app.removeDevice(asChi(app), d.devices[0].id), /máy của mình/);
  d = plain(app.removeDevice(tok, d.devices[0].id));
  assert.equal(d.devices.length, 0);
  d = plain(app.saveSelfRemind(tok, true));
  assert.equal(d.selfRemind, true);
  assert.equal(d.must, true);
});

test('báo BOD góp ý mới và thư chờ duyệt (tắt được), báo UCV kết quả duyệt', () => {
  const { app, bod } = setUp();
  fakeWeb(app);
  app.sendFeedback(asBinh(app), { content: 'Góp ý', named: true });
  let rows = app.readTable_('notifications');
  assert.deepEqual(plain(rows.map((n) => [n.member_id, n.title])), [[bod, 'Góp ý mới']]);
  assert.match(rows[0].body, /của Trần Thị Bình/);
  assert.throws(() => app.saveBodAlerts(asBinh(app), { feedback: false }), /Chỉ BOD/);
  const d = plain(app.saveBodAlerts(asBod(app), { feedback: false }));
  assert.deepEqual([d.alerts.feedback.on, d.alerts.mail.on, d.alerts.seeding.on], [false, true, false]);
  app.sendFeedback(asBinh(app), { content: 'Góp ý 2', named: false });
  assert.equal(app.readTable_('notifications').length, 1);
  assert.equal(app.readTable_('audit_log').filter((a) => a.row_id === 'notify_bod_feedback').length, 1);
  app.notifyReviewResult_(app.readTable_('mail_requests')[0].request_id, 'needs_changes', 'Sửa tiêu đề', 'Nguyễn Văn An', '');
  rows = app.readTable_('notifications');
  assert.deepEqual(plain([rows[1].member_id, rows[1].title, rows[1].body]), ['M2', 'Kết quả duyệt thư', 'Thư “Thư mời tài trợ” cần sửa lại. Ghi chú của BOD: Sửa tiêu đề']);
});

test('BOD: xem đường nhận của mọi người, đổi giúp, gửi thử; đổi bot thì mọi người kết nối lại', () => {
  const { app, bod } = setUp();
  const tok = asBod(app);
  assert.throws(() => app.clubNotify(asBinh(app)), /Chỉ BOD/);
  const calls = fakeWeb(app);
  let d = plain(app.saveZaloBot(tok, 'tok1'));
  assert.deepEqual(d.bot, { has: true, name: 'ECO Bot', link: '' });
  assert.equal(app.__props.ZALO_BOT_TOKEN, 'tok1');
  assert.ok(!app.readTable_('settings').some((s) => String(s.value).includes('tok1')), 'mã bot không ghi vào sheet');
  app.updateRecord_('zalo_links', 'M1', { chat_id: 'c1', zalo_name: 'Bình' });
  d = plain(app.saveMemberChannels(tok, 'M1', { zalo: true, app: false }));
  const binh = d.people.find((p) => p.id === 'M1');
  assert.deepEqual([binh.zalo, binh.app, binh.linked, binh.zaloName], [true, false, true, 'Bình']);
  assert.deepEqual(d.people.map((p) => p.id).sort(), [bod, 'M1', 'M2'].sort());
  const r = plain(app.sendTest(tok, '*', { zalo: true }));
  assert.equal(r.sent, 1);
  assert.equal(r.total, 3);
  assert.ok(r.report.includes('Trần Thị Bình · Zalo: đã gửi.'));
  assert.ok(r.report.includes('Lê Chi · Zalo: chưa kết nối bot.'));
  assert.throws(() => app.saveZaloBotLink(asBinh(app), 'https://zalo.me/x'), /Chỉ BOD/);
  assert.throws(() => app.saveZaloBotLink(tok, 'zalo.me/x'), /https/);
  assert.throws(() => app.saveZaloBotLink(tok, 'javascript:alert(1)'), /https/);
  assert.equal(plain(app.saveZaloBotLink(tok, ' https://zalo.me/ecobot ')).bot.link, 'https://zalo.me/ecobot');
  assert.equal(plain(app.myNotify(asBinh(app))).bot.link, 'https://zalo.me/ecobot');
  app.saveZaloBot(tok, 'tok2');
  assert.equal(plain(app.clubNotify(tok)).bot.link, '', 'bot mới thì link cũ bị xoá');
  assert.equal(app.findRecord_('zalo_links', 'M1').chat_id, '');
  assert.ok(calls.some((c) => c.url.endsWith('/deleteWebhook')));
});

test('máy bật từ bản cũ hỏi nội dung bằng mã máy; tin cũ hơn 30 ngày bị xoá; trang Thông báo chỉ hiện tin của mình', () => {
  const { app } = setUp();
  const key = 'k'.repeat(24);
  app.insertRecords_('devices', [{ endpoint: ENDPOINT, member_id: 'M1', device_key: key, last_fetched_at: new Date(Date.now() - 3600e3) }]);
  app.insertRecords_('notifications', [
    { sent_at: new Date(Date.now() - 40 * 864e5), member_id: 'M1', title: 'Cũ', body: 'a' },
    { sent_at: new Date(Date.now() - 60e3), member_id: 'M1', title: 'Mới', body: 'b' },
    { sent_at: new Date(Date.now() - 60e3), member_id: 'M2', title: 'Của Chi', body: 'c' }]);
  const out = app.doGet({ parameter: { tb: key } });
  assert.deepEqual(JSON.parse(out.text), { ds: [{ tieuDe: 'Mới', noiDung: 'b' }] });
  assert.deepEqual(JSON.parse(app.doGet({ parameter: { tb: key } }).text), { ds: [] });
  assert.deepEqual(plain(app.myNotifications(asBinh(app)).items.map((n) => n.title)), ['Mới']);
  app.dropOldNotifications_();
  assert.deepEqual(plain(app.readTable_('notifications').map((n) => n.title)), ['Mới', 'Của Chi']);
});
