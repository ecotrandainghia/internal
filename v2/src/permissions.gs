/**
 * Cài đặt > Tài khoản và phân quyền: Phân quyền nhân sự (NS phụ trách ban, seeding, sinh nhật), Đặt lại mật khẩu,
 * Đăng nhập bằng Google. Nhãn chỉ có hiệu lực trong nhiệm kỳ đang chạy; gỡ nhãn là ghi Đến ngày, không xoá dòng.
 * Mọi thay đổi ghi Nhật ký (change_setting), không bao giờ ghi mật khẩu.
 */

var STAFF_LABELS = { dept_lead: 'NS phụ trách ban', seeding_lead: 'NS phụ trách seeding', birthday_lead: 'NS phụ trách sinh nhật' };

/** Người đang ở CLB trong nhiệm kỳ đang chạy, kèm ban, lớp và tình trạng mật khẩu. */
function staffPeople_(data, termId) {
  var members = {}, accounts = {};
  data.members.forEach(function (m) { members[m.member_id] = m; });
  data.accounts.forEach(function (a) { accounts[a.member_id] = a; });
  return data.member_terms.filter(function (r) { return String(r.term_id) === String(termId) && r.status === 'active' && members[r.member_id]; })
    .map(function (r) {
      var a = accounts[r.member_id] || {};
      return { id: r.member_id, name: members[r.member_id].full_name, dept: r.dept_code, cls: r.class_name || '', email: members[r.member_id].email || '',
        ownPassword: !!a.password_hash, lastLogin: a.last_login_at ? a.last_login_at.getTime() : null };
    })
    .sort(function (a, b) { return a.dept === b.dept ? a.name.localeCompare(b.name, 'vi') : a.dept === 'BOD' ? -1 : b.dept === 'BOD' ? 1 : a.dept < b.dept ? -1 : 1; });
}

/** Dữ liệu các hộp Phân quyền nhân sự, Đặt lại mật khẩu, Đăng nhập bằng Google. */
function accountAdmin(token) {
  var me = requireUser_(token, 'bod');
  return accountAdminFor_(me);
}

function accountAdminFor_(me) {
  var data = peopleData_(), term = currentTerm_(readTable_('terms')), now = new Date();
  var termId = term ? String(term.term_id) : '';
  var people = termId ? staffPeople_(data, termId) : [], names = {};
  people.forEach(function (p) { names[p.id] = p.name; });
  var leads = {};
  Object.keys(STAFF_LABELS).forEach(function (t) { leads[t] = []; });
  data.member_labels.forEach(function (l) {
    if (!leads[l.label_type] || String(l.term_id) !== termId || !names[l.member_id]) return;
    if (activeLabels_([l], l.member_id, termId, now).length) leads[l.label_type].push({ labelId: l.label_id, id: l.member_id, name: names[l.member_id], dept: l.detail || '' });
  });
  Object.keys(leads).forEach(function (t) { leads[t].sort(function (a, b) { return (a.dept + a.name).localeCompare(b.dept + b.name, 'vi'); }); });
  return {
    me: me.memberId, termLabel: termId ? termLabel_(termId) : '', people: people, leads: leads,
    depts: readTable_('departments').filter(function (d) { return d.is_active; }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      .map(function (d) { return { code: d.dept_code, name: d.dept_name }; }),
    googleClientId: String(getSetting_('google_client_id', '') || '')
  };
}

/** Gắn nhãn phụ trách cho một người ở nhiệm kỳ đang chạy. req: { type, memberId, dept (chỉ với NS phụ trách ban) }. */
function addStaffLabel(token, req) {
  var me = requireUser_(token, 'bod');
  req = req || {};
  var type = String(req.type || ''), dept = String(req.dept || '').trim().toUpperCase();
  if (!STAFF_LABELS[type]) throw new Error('Loại phân quyền không hợp lệ.');
  withLock_(function () {
    var view = accountAdminFor_(me), term = currentTerm_(readTable_('terms'));
    if (!term) throw new Error('Chưa có nhiệm kỳ nào. Tải danh sách thành viên trước đã.');
    var who = view.people.filter(function (p) { return p.id === req.memberId; })[0];
    if (!who) throw new Error('Người này không còn ở CLB trong nhiệm kỳ này.');
    if (type === 'dept_lead') {
      if (!view.depts.some(function (d) { return d.code === dept; })) throw new Error('Chọn ban được phụ trách.');
    } else dept = '';
    if (view.leads[type].some(function (l) { return l.id === who.id && l.dept === dept; })) throw new Error(who.name + ' đã là ' + STAFF_LABELS[type] + (dept ? ' ' + dept : '') + ' rồi.');
    var rec = insertRecords_('member_labels', [{ member_id: who.id, term_id: term.term_id, label_type: type, detail: dept, start_date: new Date() }], { termId: term.term_id })[0];
    writeAudit_({ actorId: me.memberId, action: 'change_setting', table: 'member_labels', rowId: rec.label_id },
      [{ column: 'label_type', oldValue: '', newValue: STAFF_LABELS[type] + (dept ? ' ' + dept : '') + ': ' + who.name }]);
  });
  return accountAdmin(token);
}

/** Gỡ nhãn phụ trách: ghi Đến ngày là hôm nay (giữ dòng để tra lại). */
function removeStaffLabel(token, labelId) {
  var me = requireUser_(token, 'bod');
  withLock_(function () {
    var l = findRecord_('member_labels', labelId);
    if (!l || !STAFF_LABELS[l.label_type]) throw new Error('Không tìm thấy phân quyền này.');
    if (l.end_date && l.end_date.getTime() < Date.now()) return;
    // Đến ngày tính cả mili giây đó, nên lùi 1 ms để nhãn hết hiệu lực ngay.
    updateRecord_('member_labels', labelId, { end_date: new Date(Date.now() - 1) }, { actorId: me.memberId, action: 'change_setting' });
  });
  return accountAdmin(token);
}

/**
 * Đặt lại mật khẩu của một người về mật khẩu chung của CLB (họ đăng nhập bằng mật khẩu chung rồi tự đổi).
 * Các máy đang đăng nhập tài khoản đó phải đăng nhập lại.
 */
function resetPassword(token, memberId) {
  var me = requireUser_(token, 'bod');
  if (memberId === me.memberId) throw new Error('Mật khẩu của bạn thì đổi ở Tài khoản của tôi, Đổi mật khẩu.');
  var who = findRecord_('members', memberId), account = findRecord_('accounts', memberId);
  if (!who || !account) throw new Error('Không tìm thấy tài khoản này.');
  withLock_(function () {
    updateRecord_('accounts', memberId, { password_hash: '', password_salt: '', password_changed: false });
    writeAudit_({ actorId: me.memberId, action: 'change_setting', table: 'accounts', rowId: memberId },
      [{ column: 'password_changed', oldValue: account.password_changed ? 'Có' : 'Không', newValue: 'Đặt lại về mật khẩu chung' }]);
  });
  dropSessionsOf_(memberId, '');
  return accountAdmin(token);
}

/** Đổi mật khẩu chung của CLB (dùng cho người chưa có mật khẩu riêng). */
function changeClubPassword(token, pw) {
  var me = requireUser_(token, 'bod');
  setDefaultPassword_(pw);
  writeAudit_({ actorId: me.memberId, action: 'change_setting', table: 'settings', rowId: 'default_password' },
    [{ column: 'value', oldValue: '', newValue: 'Đổi mật khẩu chung' }]);
  return true;
}

/** Bật (dán Client ID) hoặc tắt (để trống) đăng nhập bằng Google. */
function saveGoogleClientId(token, clientId) {
  var me = requireUser_(token, 'bod');
  var id = String(clientId || '').trim();
  if (id && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Client ID chưa đúng dạng. Mã đúng kết thúc bằng .apps.googleusercontent.com');
  if (id !== String(getSetting_('google_client_id', '') || '')) setSetting_('google_client_id', id, me.memberId, 'Client ID để đăng nhập bằng Google; trống là tắt');
  return accountAdmin(token);
}
