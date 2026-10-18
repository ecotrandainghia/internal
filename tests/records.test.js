const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./gas');
// Mảng tạo trong môi trường giả lập khác "loại" với mảng của Node, nên chép ra trước khi so.
const plain = (x) => JSON.parse(JSON.stringify(x));

const app = loadApp(['schema.gs', 'records.gs']);
const def = (n) => app.tableDef_(n);

test('cấp mã đúng khuôn trong doc', () => {
  assert.equal(app.formatId_({ prefix: 'T', perTerm: true, width: 4 }, '2627', 42), 'T-2627-0042');
  assert.equal(app.formatId_({ prefix: 'D', perTerm: true, width: 5 }, '2627', 310), 'D-2627-00310');
  assert.equal(app.formatId_({ prefix: 'SK', perTerm: true, width: 2 }, '2627', 3), 'SK-2627-03');
  assert.equal(app.formatId_({ prefix: 'HD', perTerm: false, width: 4 }, '', 12), 'HD-0012');
  assert.equal(app.formatMemberId_('2627', 'OD', 12), '2627-OD-012');
  assert.throws(() => app.formatMemberId_('2627', 'XX', 1));
});

test('số kế tiếp chỉ tính mã cùng loại, cùng nhiệm kỳ', () => {
  const spec = { prefix: 'T', perTerm: true, width: 4 };
  assert.equal(app.nextIdSeq_(spec, '2627', ['T-2627-0007', 'T-2526-0099', 'T-2627-0003', 'TL-2627-50', '']), 8);
  assert.equal(app.nextIdSeq_(spec, '2728', ['T-2627-0007']), 1);
  assert.equal(app.nextMemberSeq_('2627', 'D1', ['2627-D1-031', '2627-OD-090', '2627-D1-002']), 32);
});

test('đọc ô theo kiểu cột', () => {
  assert.equal(app.readCell_(2627, 'text'), '2627');
  assert.equal(app.readCell_('', 'text'), '');
  assert.equal(app.readCell_(true, 'bool'), true);
  assert.equal(app.readCell_('TRUE', 'bool'), true);
  assert.equal(app.readCell_('', 'bool'), false);
  assert.equal(app.readCell_('12', 'num'), 12);
  assert.equal(app.readCell_('', 'num'), '');
  assert.equal(app.readCell_('', 'date'), null);
  const d = app.readCell_('05/11/2026 23:59', 'time');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 10, 5, 23, 59]);
  assert.equal(app.readCell_('31/02/2026', 'date'), null);
});

test('ghi ô: số và ngày sai thì báo lỗi, không ghi bậy', () => {
  assert.equal(app.writeCell_('0900 000 001', 'text'), '0900 000 001');
  assert.equal(app.writeCell_(null, 'bool'), false);
  assert.throws(() => app.writeCell_('abc', 'num'), /không phải là số/);
  assert.throws(() => app.writeCell_('ngày mai', 'date'), /không phải là ngày/);
});

test('dòng sheet thành bản ghi: bỏ dòng trống, giữ cột lạ, thiếu cột thì để trống', () => {
  const values = [
    ['task_id', 'name', 'ghi_chu_tay', 'is_cancelled'],
    ['T-2627-0001', 'Poster', 'abc', true],
    ['', '', '', ''],
    ['T-2627-0002', 'Clip', '', false]
  ];
  const recs = app.rowsToRecords_(def('tasks'), values);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].ghi_chu_tay, 'abc');
  assert.equal(recs[0].is_cancelled, true);
  assert.equal(recs[1].deadline, null);
  assert.equal(recs[1].is_counted, false);
});

test('bản ghi thành dòng theo thứ tự cột đang có, giữ giá trị cột lạ', () => {
  const header = ['name', 'ghi_chu_tay', 'task_id'];
  const row = app.recordToRow_(def('tasks'), header, { task_id: 'T-2627-0001', name: 'Poster' }, ['x', 'giữ', 'y']);
  assert.deepEqual(row, ['Poster', 'giữ', 'T-2627-0001']);
});

test('thêm dòng: cấp mã liên tiếp, không trùng khoá, bắt lỗi gõ sai', () => {
  const existing = [{ task_id: 'T-2627-0004' }];
  const added = app.prepareInsert_(def('tasks'), existing, [{ name: 'A' }, { name: 'B' }], '2627');
  assert.deepEqual(added.map((r) => r.task_id), ['T-2627-0005', 'T-2627-0006']);
  assert.equal(added[0].is_cancelled, false);
  assert.throws(() => app.prepareInsert_(def('tasks'), [], [{ name: 'A' }]), /Cần nhiệm kỳ/);
  assert.throws(() => app.prepareInsert_(def('tasks'), [], [{ nmae: 'A' }], '2627'), /không có cột nmae/);
  assert.throws(() => app.prepareInsert_(def('task_assignments'), [{ task_id: 'T1', member_id: 'M1' }],
    [{ task_id: 'T1', member_id: 'M1' }]), /đã có dòng T1 \/ M1/);
  assert.throws(() => app.prepareInsert_(def('task_assignments'), [], [{ task_id: 'T1' }]), /Thiếu member_id/);
  assert.throws(() => app.prepareInsert_(def('task_assignments'), [], [{ task_id: 'T1', member_id: 'M1', quality: 'tốt' }]),
    /không dùng được ở cột quality/);
});

test('so trước sau: chỉ cột thật sự đổi, không cho đổi khoá', () => {
  const before = { task_id: 'T1', name: 'Poster', deadline: new Date(2026, 10, 5, 23, 59), is_cancelled: false };
  const same = app.diffRecord_(def('tasks'), before, { name: 'Poster', deadline: new Date(2026, 10, 5, 23, 59), is_cancelled: false });
  assert.equal(same.length, 0);
  const ch = app.diffRecord_(def('tasks'), before, { deadline: '07/11/2026 23:59', is_cancelled: true });
  assert.deepEqual(plain(ch.map((c) => c.column)), ['deadline', 'is_cancelled']);
  assert.throws(() => app.diffRecord_(def('tasks'), before, { task_id: 'T2' }), /cột khoá/);
});

test('Nhật ký: mỗi cột một dòng, ngày ghi thành chữ, việc phải có trong danh sách', () => {
  const at = new Date(2026, 10, 6, 8, 0);
  const rows = app.auditEntries_({ at, actorId: '2627-OD-003', action: 'grade_task', table: 'task_assignments', rowId: 'T1 / M1' },
    [{ column: 'quality', oldValue: '', newValue: 'complete' }, { column: 'marked_on_time', oldValue: false, newValue: true },
      { column: 'graded_at', oldValue: null, newValue: new Date(2026, 10, 6, 8, 0) }], () => '06/11/2026 08:00');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.column_name, r.old_value, r.new_value]),
    [['quality', '', 'complete'], ['marked_on_time', 'FALSE', 'TRUE'], ['graded_at', '', '06/11/2026 08:00']]);
  assert.ok(rows.every((r) => r.row_id === 'T1 / M1' && r.action === 'grade_task' && r.logged_at === at));
  assert.throws(() => app.auditEntries_({ action: 'xoa_het' }, [], String), /không có trong danh sách/);
});
