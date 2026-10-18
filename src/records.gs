/**
 * Chuyển qua lại giữa dòng trong sheet và bản ghi (đối tượng theo tên cột), cấp mã, so sánh trước sau để ghi Nhật ký.
 * File này không gọi gì của Google nên chạy thử được bằng Node (tests/).
 */

/* ===================== Định nghĩa bảng ===================== */

var TABLE_INDEX_ = null;

/** Định nghĩa một tab theo tên tiếng Anh, kèm danh sách cột đã tách kiểu. Tên sai thì báo lỗi ngay. */
function tableDef_(name) {
  if (!TABLE_INDEX_) {
    TABLE_INDEX_ = {};
    TABLES.forEach(function (t) {
      var cols = t.columns.map(function (c) {
        var p = c.split(':');
        return { name: p[0], type: p[1] || 'text' };
      });
      var types = {};
      cols.forEach(function (c) { types[c.name] = c.type; });
      TABLE_INDEX_[t.name] = { name: t.name, label: t.label, group: t.group, key: t.key, id: t.id || null,
        handEditable: !!t.handEditable, cols: cols, names: cols.map(function (c) { return c.name; }), types: types };
    });
  }
  var def = TABLE_INDEX_[name];
  if (!def) throw new Error('Không có tab dữ liệu tên ' + name + '.');
  return def;
}

/* ===================== Giá trị trong ô ===================== */

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/** Đọc chữ dd/MM/yyyy hoặc dd/MM/yyyy HH:mm (người gõ tay vào sheet). Không đọc được thì trả về null. */
function parseDate_(s) {
  var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*$/.exec(String(s));
  if (!m) return null;
  var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** Giá trị đọc từ sheet → giá trị trong bản ghi. */
function readCell_(v, type) {
  if (type === 'bool') return v === true || String(v).trim().toUpperCase() === 'TRUE';
  if (type === 'num') {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    return isFinite(n) ? n : '';
  }
  if (type === 'date' || type === 'time') {
    if (isDate_(v)) return v;
    if (v === '' || v === null || v === undefined) return null;
    return parseDate_(v);
  }
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Giá trị trong bản ghi → giá trị ghi vào sheet. */
function writeCell_(v, type) {
  if (type === 'bool') return v === true || String(v).trim().toUpperCase() === 'TRUE';
  if (type === 'num') {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    if (!isFinite(n)) throw new Error('Giá trị "' + v + '" không phải là số.');
    return n;
  }
  if (type === 'date' || type === 'time') {
    if (v === '' || v === null || v === undefined) return '';
    if (isDate_(v)) return v;
    var d = parseDate_(v);
    if (!d) throw new Error('Giá trị "' + v + '" không phải là ngày.');
    return d;
  }
  if (v === null || v === undefined) return '';
  return String(v);
}

function sameCell_(a, b) {
  if (isDate_(a) || isDate_(b)) return isDate_(a) && isDate_(b) && a.getTime() === b.getTime();
  return a === b;
}

/* ===================== Dòng ↔ bản ghi ===================== */

/**
 * Cả tab (dòng 1 là tên cột) → danh sách bản ghi. Bỏ dòng trống hẳn. Cột lạ (ai đó thêm tay) thì giữ nguyên giá trị.
 */
function rowsToRecords_(def, values) {
  if (!values || values.length < 2) return [];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    var rec = {};
    def.names.forEach(function (n) { rec[n] = readCell_('', def.types[n]); });
    header.forEach(function (h, c) {
      if (!h) return;
      rec[h] = def.types[h] ? readCell_(row[c], def.types[h]) : row[c];
    });
    out.push(rec);
  }
  return out;
}

/** Bản ghi → một dòng theo đúng thứ tự cột đang có trong sheet. keep: dòng cũ, để giữ giá trị ở cột lạ. */
function recordToRow_(def, header, rec, keep) {
  return header.map(function (h, c) {
    h = String(h).trim();
    if (!def.types[h]) return keep ? keep[c] : '';
    return writeCell_(rec[h], def.types[h]);
  });
}

/* ===================== Khoá và mã ===================== */

/** Giá trị khoá của bản ghi, nối lại thành một chuỗi để so. */
function keyString_(def, rec) {
  return def.key.map(function (k) { return String(rec[k] === undefined || rec[k] === null ? '' : rec[k]).trim(); }).join('\u0001');
}

/** Mã dòng để ghi Nhật ký: khoá ghép thì nối bằng " / ". */
function rowLabel_(def, rec) {
  return def.key.map(function (k) { return String(rec[k]); }).join(' / ');
}

function pad_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** T-2627-0042, HD-0012... */
function formatId_(spec, termId, seq) {
  return spec.prefix + (spec.perTerm ? '-' + termId : '') + '-' + pad_(seq, spec.width);
}

/** Số thứ tự kế tiếp: lớn nhất trong các mã cùng loại (và cùng nhiệm kỳ) cộng 1. */
function nextIdSeq_(spec, termId, ids) {
  var head = spec.prefix + (spec.perTerm ? '-' + termId : '') + '-';
  var max = 0;
  ids.forEach(function (id) {
    id = String(id);
    if (id.indexOf(head) !== 0) return;
    var rest = id.slice(head.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  });
  return max + 1;
}

/** Mã TV: nhiệm kỳ gia nhập - đợt - số, ví dụ 2627-OD-012. */
function formatMemberId_(termId, batch, seq) {
  if (JOIN_BATCHES.indexOf(batch) < 0) throw new Error('Đợt gia nhập "' + batch + '" không hợp lệ.');
  return termId + '-' + batch + '-' + pad_(seq, 3);
}

function nextMemberSeq_(termId, batch, ids) {
  return nextIdSeq_({ prefix: termId + '-' + batch, perTerm: false }, '', ids);
}

/* ===================== Kiểm tra trước khi ghi ===================== */

/** Báo lỗi nếu bản ghi có cột không có trong tab (gõ sai tên), thiếu khoá, hoặc giá trị cố định sai. */
function validateRecord_(def, rec) {
  Object.keys(rec).forEach(function (k) {
    if (!def.types[k]) throw new Error('Tab ' + def.name + ' không có cột ' + k + '.');
  });
  def.key.forEach(function (k) {
    if (rec[k] === undefined || rec[k] === null || String(rec[k]).trim() === '') {
      throw new Error('Thiếu ' + k + ' khi ghi vào tab ' + def.name + '.');
    }
  });
  def.names.forEach(function (n) {
    var list = ENUMS[def.name + '.' + n];
    if (list && rec[n] !== undefined && rec[n] !== '' && !Object.prototype.hasOwnProperty.call(list, rec[n])) {
      throw new Error('Giá trị "' + rec[n] + '" không dùng được ở cột ' + n + ' (tab ' + def.name + ').');
    }
  });
}

/**
 * Chuẩn bị các bản ghi mới để thêm: cấp mã còn trống, kiểm tra, không cho trùng khoá với dòng đã có hay với nhau.
 * Trả về bản sao đã đủ mọi cột.
 */
function prepareInsert_(def, existing, records, termId) {
  var seen = {};
  if (def.key.length) existing.forEach(function (r) { seen[keyString_(def, r)] = true; });
  var ids = def.id ? existing.map(function (r) { return r[def.key[0]]; }) : [];
  return records.map(function (input) {
    var rec = {};
    def.names.forEach(function (n) { rec[n] = readCell_('', def.types[n]); });
    Object.keys(input).forEach(function (k) { rec[k] = input[k]; });
    if (def.id && !String(rec[def.key[0]] || '').trim()) {
      if (def.id.perTerm && !termId) throw new Error('Cần nhiệm kỳ để cấp mã cho tab ' + def.name + '.');
      rec[def.key[0]] = formatId_(def.id, termId, nextIdSeq_(def.id, termId, ids));
    }
    validateRecord_(def, rec);
    if (def.key.length) {
      var k = keyString_(def, rec);
      if (seen[k]) throw new Error('Tab ' + def.name + ' đã có dòng ' + rowLabel_(def, rec) + '.');
      seen[k] = true;
    }
    if (def.id) ids.push(rec[def.key[0]]);
    return rec;
  });
}

/* ===================== So sánh để ghi Nhật ký ===================== */

/** Những cột thật sự đổi khi áp patch lên bản ghi cũ. Không cho đổi cột khoá. */
function diffRecord_(def, before, patch) {
  var changes = [];
  Object.keys(patch).forEach(function (col) {
    if (!def.types[col]) throw new Error('Tab ' + def.name + ' không có cột ' + col + '.');
    if (def.key.indexOf(col) >= 0) throw new Error('Không đổi được cột khoá ' + col + '.');
    var type = def.types[col];
    var oldV = writeCell_(before[col], type), newV = writeCell_(patch[col], type);
    if (!sameCell_(oldV, newV)) changes.push({ column: col, oldValue: readCell_(oldV, type), newValue: readCell_(newV, type) });
  });
  return changes;
}

/**
 * Các dòng Nhật ký cho một lần sửa: mỗi cột đổi là một dòng, cùng lúc, người làm, việc, mã dòng.
 * formatDate: hàm đổi ngày giờ thành chữ (máy chủ dùng giờ Việt Nam).
 */
function auditEntries_(info, changes, formatDate) {
  if (!Object.prototype.hasOwnProperty.call(ENUMS['audit_log.action'], info.action)) {
    throw new Error('Việc "' + info.action + '" không có trong danh sách Nhật ký.');
  }
  var show = function (v) {
    if (isDate_(v)) return formatDate(v);
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    return v === null || v === undefined ? '' : String(v);
  };
  return changes.map(function (c) {
    return { logged_at: info.at, actor_id: info.actorId || '', action: info.action, table_name: info.table, row_id: info.rowId,
      column_name: c.column, old_value: show(c.oldValue), new_value: show(c.newValue) };
  });
}
