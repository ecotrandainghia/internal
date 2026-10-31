const test = require('node:test');
const assert = require('node:assert/strict');
const plain = (x) => JSON.parse(JSON.stringify(x));

const { setUp } = require('./sample');

const HOUR = 36e5;
const login = (app, email, pw) => app.login(email, pw).token;
const asBod = (app) => login(app, 'an@gmail.com', 'matkhauAn');
const asBinh = (app) => login(app, 'binh@gmail.com', 'chungCLB');
const asChi = (app) => login(app, 'chi@gmail.com', 'chungCLB');

/** Chi là người phụ trách seeding; Bình có tên Facebook, Chi chưa có (app dò theo họ tên). */
function seedingSetUp() {
  const s = setUp();
  s.app.insertRecords_('member_labels', [{ member_id: 'M2', term_id: s.term, label_type: 'seeding_lead' }], { termId: s.term });
  s.app.updateRecord_('members', 'M1', { facebook_name: 'Bình Trần' });
  return s;
}
const addPost = (app, token, url, inMs = 24 * HOUR) => plain(app.addSeedingPost(token, { url, remindAt: Date.now() + inMs }));

test('dò tên: tên dài che tên ngắn nằm trong nó, trùng tên phải tick, tên một chữ chỉ khớp khi đứng riêng dòng', () => {
  const { app } = setUp();
  const names = app.seedingNames_({
    A: { facebook: 'Minh Anh', name: 'Phạm Minh Anh' }, B: { facebook: 'Đỗ Minh Anh Lê', name: 'Đỗ Minh Anh' },
    C: { facebook: 'Lan', name: 'Vũ Lan' }, D: { facebook: 'Hà Vy', name: 'Hà Vy 1' }, E: { facebook: 'Hà Vy', name: 'Hà Vy 2' },
    F: { facebook: '', name: 'Ngô Thu Trang' }
  }, [{ member_id: 'C', page_name: 'Shop Xanh' }, { member_id: 'X', page_name: 'Người lạ' }]);
  assert.equal(names[0].key, 'do minh anh le', 'tên dài dò trước');
  assert.ok(!names.some((n) => n.key === 'nguoi la'), 'fanpage của người không còn trong CLB thì bỏ');
  const m = plain(app.matchSeeding_('Đỗ Minh Anh Lê\nHôm nay Lan đi học\nhà vy\nShop Xanh · Theo dõi\nngô thu trang', names));
  assert.deepEqual(m.sure.map((s) => s.id).sort(), ['B', 'C', 'F']);
  assert.deepEqual(m.sure.find((s) => s.id === 'C').label, 'Shop Xanh', 'Lan chỉ có trong câu comment nên khớp qua fanpage');
  assert.deepEqual(m.unsure.map((u) => [u.label, u.why, u.ids]), [['Minh Anh', 'inside', ['A']], ['Hà Vy', 'same_name', ['D', 'E']]]);
  assert.deepEqual(m.unsure[0].inside, ['Đỗ Minh Anh Lê']);
  assert.deepEqual(plain(app.matchSeeding_('Lan', names)).sure.map((s) => s.id), ['C'], 'tên một chữ đứng riêng một dòng');
  const cn = app.seedingNames_({ G: { facebook: '王小明 Wang', name: 'Vương Tiểu Minh' }, H: { facebook: '김민지', name: 'Kim Min Ji' } }, []);
  assert.deepEqual(plain(cn.map((n) => n.key.normalize('NFC')).sort()), ['王小明 wang', '김민지'], 'tên tiếng Trung, Hàn vẫn giữ chữ để dò');
  assert.deepEqual(plain(app.matchSeeding_('王小明 Wang\nTheo dõi\n김민지', cn)).sure.map((s) => s.id).sort(), ['G', 'H']);
  assert.deepEqual(plain(app.evidenceChunks_('abcde', 2)), ['ab', 'cd', 'e']);
  assert.deepEqual(plain(app.evidenceChunks_('', 2)), ['']);
});

test('đặt nhắc hẹn: chỉ NS seeding hoặc BOD, link Facebook, lúc nhắc trong 14 ngày, không trùng bài', () => {
  const { app } = seedingSetUp();
  const chi = asChi(app);
  assert.deepEqual(plain(app.seedingPage(chi)).noFacebook, ['Lê Chi'], 'trang Seeding nêu tên người chưa có tên Facebook');
  assert.throws(() => addPost(app, asBinh(app), 'https://www.facebook.com/eco/posts/1'), /Chỉ người phụ trách seeding/);
  assert.throws(() => addPost(app, chi, 'https://example.com/eco/posts/1'), /link bài đăng Facebook/);
  assert.throws(() => addPost(app, chi, 'https://www.facebook.com/eco/posts/1', -HOUR), /đã qua/);
  assert.throws(() => addPost(app, chi, 'https://www.facebook.com/eco/posts/1', 15 * 24 * HOUR), /14 ngày/);
  const d = addPost(app, chi, 'https://www.facebook.com/eco/posts/1?ref=share');
  assert.equal(d.waiting.length, 1);
  assert.match(d.waiting[0].id, /^S-\d{4}-0001$/);
  assert.equal(d.waiting[0].mine, true);
  assert.ok(app.__triggers.includes('runSeedingReminders'), 'cài việc tự chạy nhắc hẹn');
  assert.throws(() => addPost(app, asBod(app), 'https://m.facebook.com/eco/posts/1/'), /đã có trong danh sách/);
  const later = Date.now() + 48 * HOUR;
  assert.equal(plain(app.setSeedingRemind(chi, d.waiting[0].id, later)).waiting[0].remindAt, later);
  assert.equal(plain(app.deleteSeedingPost(chi, d.waiting[0].id)).waiting.length, 0);
});

test('dán react, comment: xem trước, ghi nhận +1 react +2 comment, mỗi người một lần, chép bằng chứng sang Drive', () => {
  const { app, bod, term } = seedingSetUp();
  const chi = asChi(app), id = addPost(app, chi, 'https://www.facebook.com/eco/posts/2').waiting[0].id;
  const reacts = 'Bình Trần\nLê Chi\nNguyễn Văn An\nBình Trần';
  const comments = 'Bình Trần\nBài hay quá\nBình Trần\nĐồng ý';
  const pv = plain(app.previewSeeding(chi, id, reacts, comments));
  assert.deepEqual(pv.react.sure.map((s) => [s.id, s.via]), [['M2', 'Lê Chi'], ['M1', 'Bình Trần']], 'BOD không được cộng; chưa có tên Facebook thì dò theo họ tên');
  assert.deepEqual(pv.comment.sure.map((s) => s.id), ['M1']);
  assert.equal(pv.react.points, 1);
  assert.equal(pv.comment.points, 2);
  const d = plain(app.recordSeeding(chi, id, reacts, comments, { react: ['M1', 'M2', bod, 'M1'], comment: ['M1', 'M2'] }));
  assert.deepEqual(d.done, { people: 2, entries: 3, warn: '' }, 'người không có trong kết quả dò (BOD, Chi ở comment) bị bỏ');
  const rows = app.readTable_('point_entries').filter((e) => e.source === 'seeding');
  assert.deepEqual(plain(rows.map((e) => [e.member_id, e.points, e.source_id, e.awarded_by])), [['M1', 1, id, 'M2'], ['M2', 1, id, 'M2'], ['M1', 2, id, 'M2']]);
  assert.equal(d.waiting.length, 0);
  assert.deepEqual([d.recorded[0].id, d.recorded[0].entries], [id, 3]);
  assert.throws(() => app.recordSeeding(chi, id, reacts, comments, { react: ['M1'] }), /đã ghi nhận rồi/);
  const ss = app.SpreadsheetApp.openById(app.PropertiesService.getScriptProperties().getProperty('SEEDING_EVIDENCE_' + term));
  assert.equal(ss.name, '[APP] Bằng chứng seeding ' + term);
  assert.equal(ss.folder, '[APP] Bằng chứng seeding');
  assert.deepEqual(plain(ss.getSheetByName('phase_1').getDataRange().getValues()), [['post_id', 'reacts', 'comments'], [id, reacts, comments]]);
});

test('bằng chứng dài quá một ô thì nối xuống hàng dưới cùng mã bài; giai đoạn giao thoa không ghi nhận được', () => {
  const { app, term } = seedingSetUp();
  const chi = asChi(app), id = addPost(app, chi, 'https://www.facebook.com/eco/posts/3').waiting[0].id;
  app.EVIDENCE_CELL_MAX = 10;
  app.recordSeeding(chi, id, 'Bình Trần\nNgười ngoài CLB', 'ok', { react: ['M1'] });
  const ss = app.SpreadsheetApp.openById(app.PropertiesService.getScriptProperties().getProperty('SEEDING_EVIDENCE_' + term));
  assert.deepEqual(plain(ss.getSheetByName('phase_1').getDataRange().getValues().slice(1)),
    [[id, 'Bình Trần\n', 'ok'], [id, 'Người ngoà', ''], [id, 'i CLB', '']]);
  const t = app.readTable_('terms')[0];
  app.updateRecord_('terms', t.term_id, { phase1_start_at: new Date(Date.now() + 24 * HOUR) });
  const id2 = addPost(app, chi, 'https://www.facebook.com/eco/posts/4').waiting[0].id;
  assert.equal(plain(app.seedingPage(chi)).canRecord, false);
  assert.throws(() => app.recordSeeding(chi, id2, 'Bình Trần', '', { react: ['M1'] }), /giao thoa/);
});

test('huỷ ghi nhận: người đã ghi nhận hoặc BOD, gỡ điểm và bài về Chờ dán', () => {
  const { app, term } = seedingSetUp();
  app.insertRecords_('member_labels', [{ member_id: 'M1', term_id: term, label_type: 'seeding_lead' }], { termId: term });
  const chi = asChi(app), id = addPost(app, chi, 'https://www.facebook.com/eco/posts/5').waiting[0].id;
  app.recordSeeding(chi, id, 'Bình Trần', 'Lê Chi', { react: ['M1'], comment: ['M2'] });
  assert.throws(() => app.cancelSeeding(asBinh(app), id), /chỉ huỷ được bài mình ghi nhận/);
  const d = plain(app.cancelSeeding(chi, id));
  assert.deepEqual(d.waiting.map((p) => p.id), [id]);
  assert.ok(app.readTable_('point_entries').filter((e) => e.source === 'seeding').every((e) => e.is_cancelled && e.cancelled_by === 'M2'));
  assert.throws(() => app.cancelSeeding(chi, id), /chưa ghi nhận/);
  app.recordSeeding(chi, id, 'Bình Trần', '', { react: ['M1'] });
  plain(app.cancelSeeding(asBod(app), id));
  assert.equal(app.readTable_('point_entries').filter((e) => e.source === 'seeding' && !e.is_cancelled).length, 0);
});

test('nhắc hẹn: tới giờ thì gửi người đặt nhắc một tin gom các bài, không nhắc lại lần sau', () => {
  const { app } = seedingSetUp();
  const chi = asChi(app);
  const a = addPost(app, chi, 'https://www.facebook.com/eco/posts/6', HOUR).waiting[0].id;
  addPost(app, chi, 'https://www.facebook.com/eco/posts/7', 2 * HOUR);
  addPost(app, chi, 'https://www.facebook.com/eco/posts/8', 30 * HOUR);
  const now = Date.now();
  const msgs = plain(app.seedingReminderMessages_(now, now + 3 * HOUR));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].memberId, 'M2');
  assert.match(msgs[0].body, /posts\/6\n• https:\/\/www\.facebook\.com\/eco\/posts\/7$/);
  assert.equal(app.runSeedingReminders({}), null, 'không phải việc tự chạy của app thì bỏ qua');
  app.updateRecord_('seeding_posts', a, { remind_at: new Date(Date.now() - 60e3) });
  const trg = { triggerUid: 'trg-runSeedingReminders' };
  app.runSeedingReminders(trg);
  const sent = app.readTable_('notifications').filter((n) => n.title === 'Đến giờ ghi nhận seeding');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].member_id, 'M2');
  assert.equal(app.runSeedingReminders(trg), null, 'đã nhắc thì lần sau không nhắc lại');
});

test('fanpage để seeding: tên không trùng page khác hay tên Facebook người khác, BOD không cần, page react thì cộng cho chủ', () => {
  const { app } = seedingSetUp();
  const binh = asBinh(app), chi = asChi(app);
  assert.throws(() => app.addFanpage(asBod(app), { name: 'Page BOD' }), /BOD không được cộng điểm/);
  assert.throws(() => app.addFanpage(binh, { name: 'Shop Xanh', url: 'https://example.com/x' }), /link Facebook/);
  const d = plain(app.addFanpage(binh, { name: 'Shop Xanh', url: 'https://www.facebook.com/shopxanh' }));
  assert.deepEqual(d.pages, [{ name: 'Shop Xanh', url: 'https://www.facebook.com/shopxanh' }]);
  assert.equal(d.facebook, 'Bình Trần');
  assert.throws(() => app.addFanpage(chi, { name: 'shop  xanh' }), /đã có người khác đăng ký/);
  assert.throws(() => app.addFanpage(binh, { name: 'Shop Xanh' }), /đã thêm fanpage này/);
  app.updateRecord_('members', 'M2', { facebook_name: 'Chi Lê' });
  assert.throws(() => app.addFanpage(binh, { name: 'Chi Lê' }), /trùng tên Facebook/);
  assert.throws(() => app.removeFanpage(chi, 'Shop Xanh'), /Không tìm thấy/);
  const id = addPost(app, chi, 'https://www.facebook.com/eco/posts/9').waiting[0].id;
  assert.deepEqual(plain(app.previewSeeding(chi, id, 'Shop Xanh', '')).react.sure.map((s) => [s.id, s.via]), [['M1', 'Shop Xanh']]);
  assert.deepEqual(plain(app.removeFanpage(binh, 'Shop Xanh')).pages, []);
});

test('điền ngay: không đặt nhắc, dán và ghi nhận luôn; không có trong tin nhắc; giao thoa thì không điền ngay được', () => {
  const { app, term } = seedingSetUp();
  const chi = asChi(app);
  assert.throws(() => app.addSeedingPost(asBinh(app), { url: 'https://www.facebook.com/eco/posts/9', now: true }), /seeding/);
  const d = plain(app.addSeedingPost(chi, { url: 'https://www.facebook.com/eco/posts/9', now: true }));
  const post = d.waiting.find((p) => p.id === d.added);
  assert.equal(post.remindAt, null);
  assert.equal(app.seedingReminderMessages_(0, Date.now() + 365 * 24 * HOUR).length, 0);
  assert.throws(() => app.addSeedingPost(asBod(app), { url: 'https://facebook.com/eco/posts/9', now: true }), /đã có trong danh sách/);
  app.recordSeeding(chi, d.added, 'Bình Trần', '', { react: ['M1'] });
  assert.equal(app.findRecord_('seeding_posts', d.added).status, 'recorded');
  app.updateRecord_('terms', term, { phase1_start_at: new Date(Date.now() + 24 * HOUR) });
  assert.throws(() => app.addSeedingPost(chi, { url: 'https://www.facebook.com/eco/posts/10', now: true }), /giao thoa/);
});
