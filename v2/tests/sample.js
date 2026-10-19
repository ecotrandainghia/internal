// Dữ liệu mẫu cho test trang chủ (và để chạy thử giao diện): app đã cài, đang ở GD1, có BOD và hai thành viên.
const { loadApp } = require('./gas');

const FILES = ['schema.gs', 'records.gs', 'db.gs', 'access.gs', 'auth.gs', 'setup.gs', 'main.gs', 'stats.gs', 'home.gs', 'tasks.gs', 'points.gs', 'log.gs', 'signup.gs', 'feedback.gs', 'mail.gs', 'bulk.gs', 'members.gs'];
const DAY = 864e5, HOUR = 36e5;
const ago = (ms) => new Date(Date.now() - ms);
const later = (ms) => new Date(Date.now() + ms);

/** App đã cài, đang ở GD1, có BOD An và hai thành viên Bình (PR) và Chi (AD, NS phụ trách ban PR). */
function setUp() {
  const app = loadApp(FILES);
  app.__viewer = 'clb@example.com';
  app.setupApp({ name: 'Nguyễn Văn An', email: 'an@gmail.com', position: 'Chủ nhiệm', password: 'matkhauAn', clubPassword: 'chungCLB' });
  const bod = app.readTable_('members')[0].member_id;
  const term = app.readTable_('member_terms')[0].term_id;
  app.insertRecords_('terms', [{ term_id: term, prep_start_at: ago(60 * DAY), phase1_start_at: ago(30 * DAY) }]);
  const add = (id, name, email, dept, cls) => {
    app.insertRecords_('members', [{ member_id: id, full_name: name, email, join_batch: 'D1', join_term_id: term }]);
    app.insertRecords_('member_terms', [{ member_id: id, term_id: term, dept_code: dept, class_name: cls, position: 'Thành viên', status: 'active' }]);
    app.insertRecords_('accounts', [{ member_id: id, theme: 'system' }]);
  };
  add('M1', 'Trần Thị Bình', 'binh@gmail.com', 'PR', '11A1');
  add('M2', 'Lê Chi', 'chi@gmail.com', 'AD', '11A2');
  app.insertRecords_('member_labels', [{ member_id: 'M2', term_id: term, label_type: 'dept_lead', detail: 'PR' }], { termId: term });
  app.insertRecords_('events', [{ term_id: term, name: 'Ngày hội Xanh', planned_date: ago(20 * DAY), created_by: bod }], { termId: term });
  const ev = app.readTable_('events')[0].event_id;
  const task = (name, deadline, extra = {}) => app.insertRecords_('tasks', [{ event_id: ev, dept_code: 'PR', name, deadline, created_by: bod,
    created_at: ago(10 * DAY), is_cancelled: false, is_counted: true, ...extra }], { termId: term })[0].task_id;
  const ids = {
    soon: task('Thiết kế poster', later(DAY)),
    later: task('Viết caption', later(10 * DAY)),
    late: task('Báo cáo quỹ', ago(3 * HOUR)),
    graded: task('Chụp ảnh', ago(5 * DAY)),
    waiting: task('Dựng video', ago(2 * DAY)),
    cancelled: task('Huỷ rồi', later(DAY), { is_cancelled: true })
  };
  const asg = (task_id, member_id, extra = {}) => app.insertRecords_('task_assignments', [{ task_id, member_id, ...extra }]);
  asg(ids.soon, 'M1'); asg(ids.later, 'M1'); asg(ids.late, 'M1'); asg(ids.cancelled, 'M1');
  asg(ids.graded, 'M1', { confirmed_at: ago(6 * DAY), confirmed_by: 'M1', quality: 'complete', graded_by: bod });
  asg(ids.waiting, 'M1', { confirmed_at: ago(3 * DAY), confirmed_by: 'M1' });
  asg(ids.late, 'M2');
  app.insertRecords_('point_entries', [
    { member_id: 'M1', activity_id: 'HD-0001', points: 40, awarded_at: ago(5 * DAY), awarded_by: bod, source: 'manual' },
    { member_id: 'M2', activity_id: 'HD-0001', points: 50, awarded_at: ago(5 * DAY), awarded_by: bod, source: 'manual' },
    { member_id: 'M1', activity_id: 'HD-0001', points: 99, awarded_at: ago(45 * DAY), awarded_by: bod, source: 'manual' }
  ], { termId: term });
  app.insertRecords_('log_sessions', [{ event_id: ev, name: 'Thứ 7', duration_min: 180, is_counted: true }], { termId: term });
  const session = app.readTable_('log_sessions')[0].session_id;
  app.insertRecords_('log_quotas', [{ event_id: ev, scope_type: 'dept', scope_value: 'PR', initial_sessions: 4 }]);
  app.insertRecords_('attendance', [{ session_id: session, member_id: 'M1', counted_as: 'present', marked_by: bod, marked_at: ago(2 * DAY) }]);
  app.insertRecords_('mail_requests', [{ created_at: ago(HOUR), drafted_by: 'M2', action: 'compose', subject: 'Thư mời tài trợ', status: 'pending' },
    { created_at: ago(HOUR), drafted_by: 'M2', action: 'compose', subject: 'Nháp', status: 'draft' }], { termId: term });
  app.insertRecords_('feedback', [{ content: 'Góp ý 1', is_anonymous: true, sent_date: ago(DAY), is_read: false },
    { content: 'Góp ý 2', is_anonymous: true, sent_date: ago(DAY), is_read: true }], { termId: term });
  app.setSetting_('pinned_link_2', 'https://example.com/b', bod, 'Quy chế');
  app.setSetting_('pinned_link_1', 'https://example.com/a', bod, 'Form đăng ký log');
  app.setSetting_('pinned_link_3', 'không phải link', bod, 'Hỏng');
  return { app, bod, term, ids };
}
module.exports = { FILES, setUp };
