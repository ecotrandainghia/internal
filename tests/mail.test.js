const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const { fakeGmail } = require('./gmail');

const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');

/** App mẫu, Chi là UCV, hộp thư có hai thư. */
function withMail() {
  const s = setUp();
  const { app, term } = s;
  app.insertRecords_('member_labels', [{ member_id: 'M2', term_id: term, label_type: 'ucv' }], { termId: term });
  const g = fakeGmail();
  app.GmailApp = g.GmailApp;
  app.Gmail = g.Gmail;
  const t1 = g.add('Hỏi về tài trợ', 'Cty Xanh <xanh@cty.vn>', '<p>Chào CLB</p>', { files: [{ name: 'baogia.txt', bytes: [104, 105] }] });
  const t2 = g.add('Quảng cáo', 'spam@ads.vn', '<p>Mua ngay</p>');
  return { ...s, g, t1, t2, ucv: login(app, 'chi@gmail.com', 'chungCLB'), bodTok: asBod(app) };
}

test('pure: tách email, kiểm tra yêu cầu, lọc HTML, ảnh dán', () => {
  const { app } = setUp();
  assert.deepEqual(plain(app.splitEmails_('A <a@x.vn>; b@x.vn, a@x.vn sai@\nmailto:c@x.vn')), { list: ['a@x.vn', 'b@x.vn', 'c@x.vn'], bad: ['sai@'] });
  assert.equal(app.mailRequestError_({ action: 'compose', to: '', subject: 'x', body: 'y' }), 'Bạn chưa nhập người nhận.');
  assert.equal(app.mailRequestError_({ action: 'compose', to: 'a@x.vn', subject: '', body: 'y' }), 'Bạn chưa nhập tiêu đề.');
  assert.equal(app.mailRequestError_({ action: 'reply', threadId: 't', body: '<p> </p>' }), 'Bạn chưa nhập nội dung.');
  assert.equal(app.mailRequestError_({ action: 'forward', threadId: 't', to: 'a@x.vn' }), '');
  assert.equal(app.mailRequestError_({ action: 'add_label', threadId: 't' }), 'Bạn chưa chọn nhãn.');
  assert.equal(app.mailRequestError_({ action: 'delete_all' }), 'Thao tác không hợp lệ.');
  assert.equal(app.cleanHtml_('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:x">l</a></p>'), '<p>Hi<a href="#">l</a></p>');
  const t = plain(app.takeDataImages_('<img src="data:image/png;base64,AAAA"> và <img src=\'data:image/jpeg;base64,BB BB\'>'));
  assert.equal(t.html, '<img src="{{img0}}"> và <img src=\'{{img1}}\'>');
  assert.deepEqual(t.images, [{ mime: 'image/png', base64: 'AAAA' }, { mime: 'image/jpeg', base64: 'BBBB' }]);
});

test('UCV xem hộp thư, đọc thư, tải tệp; người khác không vào được', () => {
  const { app, t1, ucv, bodTok } = withMail();
  assert.throws(() => app.mailbox(login(app, 'binh@gmail.com', 'chungCLB'), 'inbox'), /Chỉ UCV/);
  assert.throws(() => app.mailbox(bodTok, 'inbox'), /Chỉ UCV/);
  const box = plain(app.mailbox(ucv, 'inbox', '', 0));
  assert.deepEqual(box.threads.map((t) => t.subject), ['Hỏi về tài trợ', 'Quảng cáo']);
  assert.deepEqual(box.labels, ['Tài trợ']);
  const th = plain(app.mailThread(ucv, t1));
  assert.equal(th.messages[0].files[0].name, 'baogia.txt');
  const f = plain(app.mailAttachment(ucv, t1, th.messages[0].id, 0));
  assert.deepEqual([f.name, f.base64], ['baogia.txt', 'aGk=']);
  assert.ok(plain(app.mailThread(bodTok, t1)).messages.length);
});

test('UCV soạn thư: lưu nháp, tệp và ảnh vào Drive, gửi duyệt; chỉ sửa, xoá đúng trạng thái', () => {
  const { app, ucv } = withMail();
  const img = Buffer.from('anh').toString('base64');
  let r = plain(app.saveMailRequest(ucv, { action: 'compose', to: 'a@x.vn', subject: 'Thư mời', body: '<p>Kính gửi<img src="data:image/png;base64,' + img + '"></p>',
    files: [{ name: 'moi.pdf', type: 'application/pdf', base64: Buffer.from('pdf').toString('base64') }] }, false));
  assert.equal(r.status, 'draft');
  assert.deepEqual(r.files.map((f) => f.name), ['moi.pdf']);
  const rec = app.findRecord_('mail_requests', r.id);
  assert.match(rec.body, /src="drive:blob\w+"/);
  assert.equal(Object.values(app.__blobs).filter((b) => b.folder === '[APP] Đính kèm mail').length, 2);
  // xem lại: ảnh hiện được
  assert.match(plain(app.mailRequest(ucv, r.id)).body, /data:image\/png;base64,/);
  assert.throws(() => app.saveMailRequest(ucv, { action: 'compose', to: '', subject: 'Thư mời', body: 'x' }, true, r.id), /người nhận/);
  r = plain(app.saveMailRequest(ucv, { action: 'compose', to: 'a@x.vn', subject: 'Thư mời', body: rec.body, keep: [r.files[0].id] }, true, r.id));
  assert.equal(r.status, 'pending');
  assert.equal(app.findRecord_('mail_requests', r.id).drafted_by, 'M2');
  assert.throws(() => app.saveMailRequest(ucv, { action: 'compose', to: 'a@x.vn', subject: 'Sửa', body: 'x' }, false, r.id), /không sửa được/);
  assert.throws(() => app.deleteMailRequest(ucv, r.id), /Chỉ xoá được/);
  const mine = plain(app.myMailRequests(ucv));
  assert.ok(mine.some((x) => x.id === r.id && x.status === 'pending'));
  assert.throws(() => app.mailRequest(asBod(app), mine.find((x) => x.status === 'draft')?.id || 'none'), /nháp|Không tìm thấy/);
});

test('BOD duyệt: gửi thư mới kèm chữ ký và ảnh nhúng, trả lời có trích dẫn, gắn nhãn; trả lại sửa và từ chối cần ghi chú', () => {
  const { app, g, t1, t2, ucv, bodTok, bod } = withMail();
  const img = Buffer.from('anh').toString('base64');
  const a = plain(app.saveMailRequest(ucv, { action: 'compose', to: 'a@x.vn', cc: 'b@x.vn', subject: 'Thư mời', body: '<p>Kính gửi<img src="data:image/png;base64,' + img + '"></p>' }, true)).id;
  const b = plain(app.saveMailRequest(ucv, { action: 'reply', threadId: t1, body: '<p>Cảm ơn anh</p>', quote: true }, true)).id;
  const c = plain(app.saveMailRequest(ucv, { action: 'add_label', threadId: t1, label: 'Đối tác' }, true)).id;
  const d = plain(app.saveMailRequest(ucv, { action: 'trash', threadId: t2 }, true)).id;
  let rv = plain(app.mailReview(bodTok));
  assert.equal(rv.pending, 5); // 4 yêu cầu mới và 1 có sẵn trong dữ liệu mẫu
  assert.throws(() => app.decideMailRequest(bodTok, a, 'needs_changes', ''), /ghi vài chữ/);
  app.decideMailRequest(bodTok, a, 'approved', '');
  const sent = g.sent[0];
  assert.deepEqual([sent.kind, sent.to, sent.subject, sent.opts.cc], ['compose', 'a@x.vn', 'Thư mời', 'b@x.vn']);
  assert.match(sent.opts.htmlBody, /src="cid:img0"/);
  assert.match(sent.opts.htmlBody, /<b>CLB ECO<\/b>/);
  assert.ok(sent.opts.inlineImages.img0);
  app.decideMailRequest(bodTok, b, 'approved', 'Ok');
  assert.equal(g.sent[1].kind, 'reply');
  assert.match(g.sent[1].opts.htmlBody, /gmail_quote[\s\S]*Chào CLB/);
  app.decideMailRequest(bodTok, c, 'approved', '');
  assert.ok(g.threads.find((t) => t.id === t1).labels.includes('Đối tác'));
  rv = plain(app.decideMailRequest(bodTok, d, 'rejected', 'Thư này cần giữ'));
  assert.equal(g.threads.find((t) => t.id === t2).box, 'inbox');
  assert.equal(rv.pending, 1);
  const row = app.findRecord_('mail_requests', d);
  assert.deepEqual([row.status, row.review_note, row.reviewed_by], ['rejected', 'Thư này cần giữ', bod]);
  assert.throws(() => app.decideMailRequest(bodTok, d, 'approved', ''), /đã được xử lý/);
  assert.equal(app.findRecord_('mail_requests', a).status, 'approved');
  // UCV xoá được yêu cầu bị từ chối
  assert.ok(!plain(app.deleteMailRequest(ucv, d)).some((x) => x.id === d));
});

test('BOD sửa trực tiếp rồi duyệt: ghi Nhật ký, UCV thấy đã được BOD sửa; Gmail lỗi thì chuyển Lỗi', () => {
  const { app, g, t1, ucv, bodTok } = withMail();
  const a = plain(app.saveMailRequest(ucv, { action: 'compose', to: 'a@x.vn', subject: 'Thư moi', body: '<p>Xin chao</p>' }, true)).id;
  app.decideMailRequest(bodTok, a, 'approved', '', { subject: 'Thư mời', body: '<p>Xin chào</p>' });
  assert.equal(g.sent[0].subject, 'Thư mời');
  const mine = plain(app.myMailRequests(ucv)).find((x) => x.id === a);
  assert.deepEqual([mine.status, mine.editedByBod], ['approved', true]);
  const log = app.readTable_('audit_log').filter((x) => x.action === 'approve_mail' && x.row_id === a).map((x) => x.column_name);
  assert.ok(log.includes('subject') && log.includes('body') && log.includes('status'));
  // thư gốc bị xoá hẳn trước khi duyệt
  const b = plain(app.saveMailRequest(ucv, { action: 'archive', threadId: t1 }, true)).id;
  g.threads.splice(0, 1);
  assert.throws(() => app.decideMailRequest(bodTok, b, 'approved', ''), /Gmail báo lỗi.*Không tìm thấy thư/);
  const row = app.findRecord_('mail_requests', b);
  assert.equal(row.status, 'error');
  assert.match(row.review_note, /Lỗi: Không tìm thấy thư/);
});

test('chữ ký: bật tắt, đọc lại; khung soạn thư có danh bạ thành viên và Danh bạ', () => {
  const { app, ucv, bodTok } = withMail();
  app.insertRecords_('contacts', [{ group_name: 'Đối tác', name: 'Cty Xanh', email: 'xanh@cty.vn' }]);
  app.updateRecord_('members', 'M1', { email: 'binh@gmail.com' });
  let s = plain(app.signatureSettings(bodTok, true));
  assert.deepEqual([s.on, s.html], [true, '<b>CLB ECO</b>']);
  s = plain(app.saveSignatureSetting(bodTok, false));
  assert.equal(s.on, false);
  const c = plain(app.composeSetup(ucv));
  assert.equal(c.signature, '');
  assert.deepEqual(c.contacts.map((x) => [x.group, x.name]), [['Thành viên · AD', 'Lê Chi'], ['Thành viên · BOD', 'Nguyễn Văn An'], ['Thành viên · PR', 'Trần Thị Bình'], ['Đối tác', 'Cty Xanh']]);
});
