const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');
const { FakeSpreadsheet } = require('./gas');
const { fakeGmail } = require('./gmail');

const ID = 'sheetnguoinhan0123456789';
const login = (app, email, pw) => app.login(email, pw).token;

/** App mẫu có Gmail giả, một thư nháp trộn thư (kèm ảnh và tệp) và một thư nháp thường. */
function withDrafts() {
  const s = setUp();
  const { app } = s;
  const g = fakeGmail();
  app.GmailApp = g.GmailApp;
  app.Gmail = g.Gmail;
  const merge = g.addDraft('Thư mời {Tên}', '<p>Chào {Họ và tên} ban {{ban}}</p><img src="cid:ii_1" alt="logo.png">',
    { files: [{ name: 'logo.png', bytes: [1], inline: true }, { name: 'kehoach.pdf', bytes: [2, 3] }] });
  const plainDraft = g.addDraft('Họp BOD', '<p>Họp lúc 8 giờ</p>', { to: 'an@gmail.com, binh@gmail.com' });
  return { ...s, g, merge, plainDraft, tok: login(app, 'an@gmail.com', 'matkhauAn') };
}

const members = (app, tok) => plain(app.bulkSources(tok)).members;
const past = (app, id) => app.updateRecord_('mail_sends', id, { send_at: new Date(Date.now() - 6e4) });

test('pure: chỗ điền, thay chỗ điền, đọc bảng từ sheet, kiểm tra trước khi gửi, chia đợt', () => {
  const { app } = setUp();
  assert.deepEqual(plain(app.mergeFields_('Chào {Tên}, {{Họ và tên}} {Tên} {}')), ['Tên', 'Họ và tên']);
  assert.deepEqual(plain(app.fillMerge_('<b>{ten}</b> {Lớp}', { 'Tên': 'A<b>', 'Lop': '' }, true)), { text: '<b>A&lt;b&gt;</b> ', missing: [] });
  assert.deepEqual(plain(app.fillMerge_('{Công ty}', {}, false)).missing, ['Công ty']);
  const t = plain(app.tableFromValues_([['', ''], ['Họ tên', 'Địa chỉ mail', ''], ['A', 'a@x.vn', 'x'], ['', '', ''], ['B', 'sai', '']]));
  assert.deepEqual(t.columns, ['Họ tên', 'Địa chỉ mail', 'Cột 3']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.emailColumn, 'Địa chỉ mail');
  assert.equal(plain(app.tableFromValues_([['Tên', 'Liên hệ'], ['A', 'a@x.vn']])).emailColumn, 'Liên hệ');
  const tpl = { subject: 'Mời {Tên}', html: '<p>{Công ty}</p>' };
  let r = plain(app.prepareBulk_(tpl, [{ email: 'a@x.vn', data: { 'Tên': 'A', 'Công ty': '' } }, { email: 'A@x.vn', data: {} }, { email: 'b@x.vn', data: { 'Tên': '', 'Công ty': 'Xanh' } }], ['Tên', 'Công ty']));
  assert.equal(r.error, '');
  assert.deepEqual(r.list.map((x) => x.subject), ['Mời A', 'Mời ']);
  assert.deepEqual(r.empty, [{ field: 'Công ty', emails: ['a@x.vn'] }, { field: 'Tên', emails: ['b@x.vn'] }]);
  r = plain(app.prepareBulk_(tpl, [{ email: 'a@x.vn' }], []));
  assert.deepEqual(r.unknown, ['Tên', 'Công ty']);
  assert.match(r.error, /\{Tên\}, \{Công ty\}.*không có cột/);
  assert.match(plain(app.prepareBulk_({ subject: 'x', html: 'y' }, [{ email: 'sai' }], [])).error, /1 email chưa đúng: sai/);
  assert.match(plain(app.prepareBulk_({ subject: '', html: 'y' }, [], [])).error, /chưa có tiêu đề/);
  const start = new Date(2026, 9, 18, 15, 30);
  const b = plain(app.splitBatches_(250, start, 30, false)).map((x) => [new Date(x.at).getDate(), new Date(x.at).getHours(), x.count]);
  assert.deepEqual(b, [[18, 15, 30], [19, 7, 100], [20, 7, 100], [21, 7, 20]]);
  assert.deepEqual(plain(app.splitBatches_(150, start, 100, true)).map((x) => [new Date(x.at).getDate(), new Date(x.at).getHours(), x.count]), [[18, 15, 100], [19, 15, 50]]);
  assert.deepEqual(plain(app.splitBatches_(5, start, 0, false)).map((x) => [new Date(x.at).getDate(), x.count, x.first]), [[19, 5, false]]);
});

test('thư nháp và nguồn người nhận: chỉ BOD, thành viên có trường điền theo tên cột', () => {
  const { app, tok, merge } = withDrafts();
  assert.throws(() => app.mailDrafts(login(app, 'binh@gmail.com', 'chungCLB')), /BOD/);
  const d = plain(app.mailDrafts(tok));
  assert.deepEqual(d.drafts.map((x) => x.subject), ['Họp BOD', 'Thư mời {Tên}']);
  const m = d.drafts.find((x) => x.id === merge);
  assert.deepEqual([m.fields, m.files], [['Tên', 'Họ và tên', 'ban'], ['kehoach.pdf']]);
  assert.equal(d.quota, 100);
  const s = plain(app.bulkSources(tok));
  const chi = s.members.find((x) => x.email === 'chi@gmail.com');
  assert.deepEqual([chi.data['Họ và tên'], chi.data['Tên'], chi.data['Ban'], chi.data['Lớp']], ['Lê Chi', 'Chi', 'AD', '11A2']);
  assert.ok(s.memberFields.includes('Ngày sinh'));
});

test('gửi ngay cho thành viên: điền từng người, kèm ảnh và tệp của thư nháp, ghi Lịch gửi', () => {
  const { app, g, tok, merge } = withDrafts();
  const list = members(app, tok).map((x) => ({ email: x.email, data: x.data }));
  const fields = plain(app.bulkSources(tok)).memberFields;
  const c = plain(app.checkBulk(tok, { draftId: merge, recipients: list, fields }));
  assert.equal(c.error, '');
  assert.equal(c.count, 3);
  assert.equal(c.preview.subject, 'Thư mời ' + list[0].data['Tên']);
  assert.deepEqual(c.files, ['kehoach.pdf']);
  // Nhập tay: không có trường nào để điền nên bị chặn
  assert.match(plain(app.checkBulk(tok, { draftId: merge, recipients: [{ email: 'x@y.vn' }], fields: [] })).error, /không có cột/);
  assert.throws(() => app.sendBulk(tok, { draftId: merge, recipients: [{ email: 'x@y.vn' }], fields: [] }), /không có cột/);
  const r = plain(app.sendBulk(tok, { draftId: merge, recipients: list, fields, source: 'Thành viên CLB: tất cả' }));
  assert.deepEqual([r.sent, r.scheduled, r.batches], [3, 0, 1]);
  const chi = g.sent.find((x) => x.to === 'chi@gmail.com');
  assert.equal(chi.subject, 'Thư mời Chi');
  assert.match(chi.opts.htmlBody, /Chào Lê Chi ban AD/);
  assert.deepEqual(Object.keys(chi.opts.inlineImages), ['ii_1']);
  assert.equal(chi.opts.attachments[0].getName(), 'kehoach.pdf');
  const row = app.readTable_('mail_sends').slice(-1)[0];
  assert.deepEqual([row.status, row.result, row.recipient_source, row.gmail_draft_id], ['sent', 'Đã gửi 3/3 thư', 'Thành viên CLB: tất cả', '']);
});

test('vượt hạn mức: chặn nếu không chia đợt; chia đợt thì gửi phần còn được, phần sau tự gửi, hết hạn mức thì dời', () => {
  const { app, g, tok, merge } = withDrafts();
  app.__quota = 1;
  const rows = [['Tên', 'Email', 'Công ty'], ['Minh', 'minh@xanh.vn', 'Xanh'], ['Lan', 'lan@la.vn', ''], ['Hùng', 'hung@cty.vn', 'Cty']];
  const ss = new FakeSpreadsheet(ID);
  ss.sheets[0].data = rows;
  app.__files[ID] = ss;
  const t = plain(app.readSendSheet(tok, 'https://docs.google.com/spreadsheets/d/' + ID + '/edit'));
  assert.deepEqual([t.columns, t.emailColumn, t.rows.length], [['Tên', 'Email', 'Công ty'], 'Email', 3]);
  const draft = g.addDraft('Mời {Tên}', '<p>Gửi {Công ty}</p>');
  const recipients = t.rows.map((o) => ({ email: o.Email, data: o }));
  const c = plain(app.checkBulk(tok, { draftId: draft, recipients, fields: t.columns }));
  assert.deepEqual(c.empty, [{ field: 'Công ty', emails: ['lan@la.vn'] }]);
  assert.throws(() => app.sendBulk(tok, { draftId: draft, recipients, fields: t.columns }), /chỉ còn gửi được 1 người/);
  const r = plain(app.sendBulk(tok, { draftId: draft, recipients, fields: t.columns, source: 'Sheet: Đối tác', split: true }));
  assert.deepEqual([r.sent, r.scheduled], [1, 1]);
  assert.deepEqual(plain(app.__triggers.filter((t) => typeof t === 'string')), ['runScheduledSends']);
  const later = app.readTable_('mail_sends').find((x) => x.status === 'scheduled');
  assert.equal(later.send_at.getHours(), 7);
  assert.equal(later.recipient_source, 'Sheet: Đối tác (đợt 2/2)');
  // Đến giờ nhưng hết hạn mức: dời sang hôm sau
  past(app, later.send_id);
  app.__quota = 0;
  assert.equal(app.runScheduledSends(), 1);
  let row = app.findRecord_('mail_sends', later.send_id);
  assert.equal(row.status, 'scheduled');
  assert.match(row.result, /Hết hạn mức/);
  // Còn hạn mức: gửi, đọc thư nháp lúc gửi nên nội dung mới sửa trong Gmail vẫn được dùng
  g.drafts.find((d) => d.id === draft).html = '<p>Thân gửi {Công ty}</p>';
  past(app, later.send_id);
  app.__quota = 100;
  app.runScheduledSends();
  row = app.findRecord_('mail_sends', later.send_id);
  assert.deepEqual([row.status, row.result], ['sent', 'Đã gửi 2/2 thư']);
  assert.match(g.sent.find((x) => x.to === 'hung@cty.vn').opts.htmlBody, /Thân gửi Cty/);
  // Thư nháp bị xoá trước giờ gửi thì báo lỗi
  app.sendBulk(tok, { draftId: draft, recipients: recipients.slice(0, 1), fields: t.columns, sendAt: Date.now() + 36e5 });
  const s3 = app.readTable_('mail_sends').slice(-1)[0];
  g.drafts.splice(0, g.drafts.length);
  past(app, s3.send_id);
  app.runScheduledSends();
  assert.match(app.findRecord_('mail_sends', s3.send_id).result, /Không tìm thấy thư nháp/);
});

test('hẹn giờ thư nháp thường, sửa giờ, huỷ; Lịch gửi hiện thư chờ gửi trước', () => {
  const { app, g, tok, plainDraft, merge } = withDrafts();
  assert.throws(() => app.scheduleDraft(tok, merge, Date.now() + 36e5), /chưa có người nhận/);
  assert.throws(() => app.scheduleDraft(tok, plainDraft, Date.now()), /ít nhất 1 phút/);
  let s = plain(app.scheduleDraft(tok, plainDraft, Date.now() + 36e5));
  const id = s.items[0].id;
  assert.deepEqual([s.items[0].status, s.items[0].source, s.items[0].by], ['scheduled', 'Người nhận ghi trong thư nháp', 'Nguyễn Văn An']);
  app.sendBulk(tok, { draftId: merge, recipients: members(app, tok).slice(0, 1).map((x) => ({ email: x.email, data: x.data })), fields: plain(app.bulkSources(tok)).memberFields });
  s = plain(app.sendSchedule(tok));
  assert.deepEqual(s.items.map((x) => x.status), ['scheduled', 'sent']);
  const at = Date.now() + 2 * 36e5;
  s = plain(app.rescheduleSend(tok, id, at));
  assert.equal(s.items[0].sendAt, at);
  past(app, id);
  app.runScheduledSends();
  assert.equal(g.sent.slice(-1)[0].kind, 'draft');
  assert.equal(app.findRecord_('mail_sends', id).result, 'Đã gửi thư nháp tới 2 người');
  assert.throws(() => app.cancelSend(tok, id), /đã gửi hoặc đã huỷ/);
  const id2 = plain(app.scheduleDraft(tok, g.addDraft('Nhắc', 'x', { to: 'a@x.vn' }), Date.now() + 36e5)).items[0].id;
  s = plain(app.cancelSend(tok, id2));
  assert.equal(s.items.find((x) => x.id === id2).status, 'cancelled');
});

test('danh bạ: thêm, sửa, xoá, không trùng email trong một nhóm; dùng làm nguồn người nhận', () => {
  const { app, tok } = withDrafts();
  assert.throws(() => app.saveContact(tok, { name: 'X', email: 'sai' }), /Email chưa đúng/);
  let b = plain(app.saveContact(tok, { group: 'Nhà tài trợ', name: 'Công ty Xanh', email: 'lienhe@xanh.vn', note: 'Anh Minh' }));
  app.saveContact(tok, { group: '', name: '', email: 'a@x.vn' });
  assert.throws(() => app.saveContact(tok, { group: 'Nhà tài trợ', email: 'LIENHE@xanh.vn' }), /đã có email này/);
  b = plain(app.contactBook(tok));
  assert.deepEqual(b.groups, ['Khác', 'Nhà tài trợ']);
  const xanh = b.contacts.find((c) => c.email === 'lienhe@xanh.vn');
  b = plain(app.saveContact(tok, { ...xanh, name: 'Cty Xanh' }));
  assert.equal(b.contacts.find((c) => c.id === xanh.id).name, 'Cty Xanh');
  assert.deepEqual(plain(app.bulkSources(tok)).contacts.map((c) => c.email), ['lienhe@xanh.vn', 'a@x.vn']);
  b = plain(app.deleteContacts(tok, [xanh.id]));
  assert.deepEqual(b.contacts.map((c) => c.email), ['a@x.vn']);
});
