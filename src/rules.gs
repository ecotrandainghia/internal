/**
 * Cài đặt > Quy tắc CLB (Cơ cấu ban, Khen thưởng và hạn task, Ngưỡng cảnh báo), Hoạt động CLB > Link ghim,
 * và Tài khoản của tôi > Ảnh đại diện. Thang điểm dùng chung hộp ở trang Cộng điểm (points.gs).
 * Mọi lần sửa đều ghi Nhật ký (change_setting).
 */

var AVATAR_MAX = 200000;
var PINNED_MAX = 8;

/** Các số trong quy chế BOD sửa được: [tên trong Cài đặt, mặc định, nhỏ nhất, lớn nhất, ý nghĩa]. */
var RULE_NUMBERS = {
  kpi_threshold: [80, 1, 100, '% tối thiểu để đạt KPI log và task'],
  offset_threshold: [60, 1, 100, '% tối thiểu mỗi phần để được xét bù trừ'],
  top_reward_percent: [15, 1, 100, 'Khen thưởng top bao nhiêu % mỗi giai đoạn'],
  offset_top_percent: [40, 1, 100, 'Lọt top bao nhiêu % bảng bù trừ thì được cấp certificate'],
  not_done_after_hours: [24, 0, 720, 'Quá hạn bao nhiêu giờ mà chưa xác nhận thì task tính là Không làm'],
  due_soon_days: [2, 0, 30, 'Còn bao nhiêu ngày tới hạn chót thì task hiện Sắp đến hạn']
};

function ruleNumbers_() {
  var out = {};
  Object.keys(RULE_NUMBERS).forEach(function (k) {
    var r = RULE_NUMBERS[k], v = Number(getSetting_(k, r[0]));
    out[k] = isNaN(v) ? r[0] : v;
  });
  return out;
}

function deptView_(d) {
  return { code: d.dept_code, name: d.dept_name || '', subTeams: d.sub_teams || '', order: Number(d.sort_order) || 0, active: !!d.is_active };
}

/** Dữ liệu các hộp Quy tắc CLB và Link ghim. */
function clubRules(token) {
  requireUser_(token, 'bod');
  var used = {};
  readTable_('member_terms').forEach(function (r) { used[r.dept_code] = true; });
  var term = currentTerm_(readTable_('terms'));
  var now = {};
  readTable_('member_terms').forEach(function (r) { if (term && String(r.term_id) === String(term.term_id) && r.status === 'active') now[r.dept_code] = (now[r.dept_code] || 0) + 1; });
  return {
    depts: readTable_('departments').sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).map(function (d) {
      var v = deptView_(d);
      v.people = now[d.dept_code] || 0;
      v.used = !!used[d.dept_code];
      return v;
    }),
    numbers: ruleNumbers_(),
    limits: Object.keys(RULE_NUMBERS).reduce(function (o, k) { o[k] = [RULE_NUMBERS[k][1], RULE_NUMBERS[k][2]]; return o; }, {}),
    links: pinnedLinks_(readTable_('settings'))
  };
}

/**
 * Lưu Cơ cấu ban. list: [{ code, name, subTeams, active }] theo thứ tự hiện. Mã ban cũ không đổi được (muốn đổi thì thêm ban mã mới,
 * tắt ban cũ, rồi tải danh sách Cập nhật); ban mới thêm mã viết hoa, không trùng. Ban không xoá được, chỉ tắt Đang dùng. BOD luôn bật.
 */
function saveDepartments(token, list) {
  var me = requireUser_(token, 'bod');
  if (!Array.isArray(list) || !list.length) throw new Error('Cơ cấu phải có ít nhất một ban.');
  withLock_(function () {
    var have = {};
    readTable_('departments').forEach(function (d) { have[d.dept_code] = d; });
    var seen = {}, adds = [], edits = [];
    list.forEach(function (x, i) {
      var code = String(x.code || '').trim().toUpperCase(), name = String(x.name || '').trim().slice(0, 60);
      var subs = String(x.subTeams || '').split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(String).join(', ');
      if (!/^[A-Z0-9]{1,10}$/.test(code)) throw new Error('Mã ban "' + code + '" chỉ gồm chữ không dấu và số, tối đa 10 ký tự, viết đúng như cột Ban trong sheet.');
      if (seen[code]) throw new Error('Mã ban ' + code + ' bị trùng.');
      seen[code] = true;
      if (!name) throw new Error('Ban ' + code + ' chưa có tên.');
      var rec = { dept_name: name, sub_teams: subs, sort_order: i + 1, is_active: code === 'BOD' ? true : !!x.active };
      if (have[code]) edits.push({ key: code, patch: rec });
      else { rec.dept_code = code; adds.push(rec); }
    });
    Object.keys(have).forEach(function (code) { if (!seen[code]) throw new Error('Không xoá được ban ' + code + '. Tắt Đang dùng thay vì xoá, để dữ liệu năm cũ vẫn đọc được.'); });
    if (edits.length) updateRecords_('departments', edits, { actorId: me.memberId, action: 'change_setting' });
    if (adds.length) {
      insertRecords_('departments', adds);
      writeAuditMany_(me.memberId, 'change_setting', 'departments', adds.map(function (a) {
        return { rowId: a.dept_code, changes: [{ column: 'dept_name', oldValue: '', newValue: a.dept_name }] };
      }));
    }
  });
  return clubRules(token);
}

/** Lưu các số quy chế. values: { tên: số }; chỉ những tên có trong RULE_NUMBERS. */
function saveRuleNumbers(token, values) {
  var me = requireUser_(token, 'bod');
  values = values || {};
  var next = ruleNumbers_();
  Object.keys(values).forEach(function (k) {
    var r = RULE_NUMBERS[k], v = Number(values[k]);
    if (!r) return;
    if (isNaN(v) || Math.round(v) !== v || v < r[1] || v > r[2]) throw new Error(r[3] + ': nhập số nguyên từ ' + r[1] + ' đến ' + r[2] + '.');
    next[k] = v;
  });
  if (next.offset_threshold > next.kpi_threshold) throw new Error('Ngưỡng bù trừ (' + next.offset_threshold + '%) không được cao hơn ngưỡng đạt KPI (' + next.kpi_threshold + '%).');
  withLock_(function () {
    Object.keys(values).forEach(function (k) {
      if (!RULE_NUMBERS[k] || String(getSetting_(k, '')) === String(next[k])) return;
      setSetting_(k, String(next[k]), me.memberId, RULE_NUMBERS[k][3]);
    });
  });
  return clubRules(token);
}

/** Lưu link ghim (mọi người thấy giống nhau). links: [{ label, url }] theo thứ tự hiện. */
function savePinnedLinks(token, links) {
  var me = requireUser_(token, 'bod');
  links = (links || []).map(function (l) { return { label: String(l.label || '').trim().slice(0, 60), url: String(l.url || '').trim() }; })
    .filter(function (l) { return l.label || l.url; });
  if (links.length > PINNED_MAX) throw new Error('Tối đa ' + PINNED_MAX + ' link ghim.');
  links.forEach(function (l) {
    if (!l.label) throw new Error('Link ' + l.url + ' chưa có tên.');
    if (!/^https:\/\/\S+$/i.test(l.url)) throw new Error('Link "' + l.label + '" phải bắt đầu bằng https://.');
  });
  withLock_(function () {
    var old = readTable_('settings').filter(function (s) { return /^pinned_link_\d+$/.test(String(s.key)); });
    links.forEach(function (l, i) {
      var key = 'pinned_link_' + (i + 1);
      if (findRecord_('settings', key)) updateRecord_('settings', key, { value: l.url, description: l.label }, { actorId: me.memberId, action: 'change_setting' });
      else setSetting_(key, l.url, me.memberId, l.label);
    });
    old.forEach(function (s) {
      if (Number(String(s.key).split('_').pop()) > links.length) deleteRecord_('settings', s.key, { actorId: me.memberId, action: 'change_setting' });
    });
  });
  return clubRules(token);
}

/* ---------- Ảnh đại diện ---------- */

function avatarFolder_() {
  return appFolder_('avatar');
}

/** Mã file Drive trong link ảnh đại diện app đã lưu. */
function avatarFileId_(url) {
  var m = /[?&]id=([\w-]{20,})/.exec(String(url || ''));
  return m ? m[1] : '';
}

/**
 * Lưu ảnh đại diện của chính mình: ảnh JPEG đã thu nhỏ trên máy (data URL), lưu vào thư mục Ảnh đại diện trên Drive CLB,
 * ai có link thì xem được (để hiện trong app). image rỗng là bỏ ảnh. Ảnh cũ chuyển vào thùng rác. Trả về link mới.
 */
function saveAvatar(token, image) {
  var me = requireUser_(token);
  image = String(image || '');
  var m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(image);
  if (image && !m) throw new Error('Ảnh không hợp lệ.');
  if (image.length > AVATAR_MAX) throw new Error('Ảnh lớn quá, bạn chọn ảnh khác nhé.');
  var account = findRecord_('accounts', me.memberId), url = '';
  if (m) {
    var file = avatarFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', me.memberId + '.jpg'));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w256';
  }
  updateRecord_('accounts', me.memberId, { avatar_url: url });
  var oldId = avatarFileId_(account && account.avatar_url);
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* đã bị xoá tay */ } }
  return url;
}
