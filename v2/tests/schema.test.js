const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./gas');

const app = loadApp(['schema.gs', 'records.gs']);

test('đủ 29 tab, chia nhóm đúng như doc sheet', () => {
  assert.equal(app.TABLES.length, 29);
  const count = {};
  app.TABLES.forEach((t) => { count[t.group] = (count[t.group] || 0) + 1; });
  assert.deepEqual(count, { people: 5, time: 4, task: 2, log: 4, points: 5, mail: 6, system: 3 });
  assert.equal(new Set(app.TABLES.map((t) => t.name)).size, 29);
});

test('mỗi tab: tên cột không trùng, cột khoá có thật, kiểu cột hợp lệ', () => {
  const kinds = ['text', 'bool', 'num', 'date', 'time'];
  app.TABLES.forEach((t) => {
    const def = app.tableDef_(t.name);
    assert.equal(new Set(def.names).size, def.names.length, t.name);
    t.key.forEach((k) => assert.ok(def.types[k], `${t.name}.${k}`));
    def.cols.forEach((c) => assert.ok(kinds.includes(c.type), `${t.name}.${c.name}:${c.type}`));
    assert.ok(app.GROUPS.some((g) => g.id === t.group), t.name);
    if (t.id) assert.equal(t.key.length, 1, `${t.name} cấp mã thì khoá chỉ một cột`);
  });
});

test('tên tab và tên cột viết thường, nối gạch dưới', () => {
  app.TABLES.forEach((t) => {
    assert.match(t.name, /^[a-z][a-z0-9_]*$/);
    app.tableDef_(t.name).names.forEach((n) => assert.match(n, /^[a-z][a-z0-9_]*$/, `${t.name}.${n}`));
  });
});

test('giá trị cố định gắn với cột có thật, mã tiếng Anh', () => {
  Object.keys(app.ENUMS).forEach((k) => {
    const [table, col] = k.split('.');
    assert.ok(app.tableDef_(table).types[col], k);
    Object.keys(app.ENUMS[k]).forEach((code) => assert.match(code, /^[a-z][a-z0-9_]*$/, `${k}: ${code}`));
  });
});

test('các loại mã không trùng đầu', () => {
  const prefixes = app.TABLES.filter((t) => t.id).map((t) => t.id.prefix);
  assert.equal(new Set(prefixes).size, prefixes.length);
});

test('cột ô tick (is_..., password_changed, marked_on_time) đều là bool', () => {
  app.TABLES.forEach((t) => {
    app.tableDef_(t.name).cols.forEach((c) => {
      if (/^is_/.test(c.name) || ['password_changed', 'marked_on_time'].includes(c.name)) assert.equal(c.type, 'bool', `${t.name}.${c.name}`);
    });
  });
});

test('dòng mặc định khớp cột của tab', () => {
  app.DEFAULT_DEPARTMENTS.forEach((d) => app.validateRecord_(app.tableDef_('departments'), d));
  app.DEFAULT_SETTINGS.forEach((s) => app.validateRecord_(app.tableDef_('settings'), s));
  assert.ok(app.DEFAULT_DEPARTMENTS.some((d) => d.dept_code === 'BOD'));
});
