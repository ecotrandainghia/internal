/**
 * Cấu trúc file dữ liệu: 29 tab, đúng tên tab và tên cột trong doc "Sheet dữ liệu app ECO".
 * Sửa doc thì sửa ở đây cho khớp; app tự thêm tab, cột còn thiếu ở lần chạy sau (xem db.gs).
 *
 * Mỗi cột ghi "tên" hoặc "tên:kiểu". Kiểu:
 *   text (mặc định): ô để dạng chữ, để mã như 2627 hay số điện thoại 0900... không bị sheet đổi thành số
 *   bool: ô tick, lưu TRUE/FALSE
 *   num:  số
 *   date: ngày (dd/MM/yyyy)
 *   time: ngày giờ (dd/MM/yyyy HH:mm)
 * key: các cột làm khoá (hai cột trở lên là khoá ghép); trống là bảng chỉ thêm dòng.
 * id: cách app tự cấp mã cho cột khoá đầu tiên. perTerm = mã có nhiệm kỳ (T-2627-0042), không thì HD-0012.
 */

var GROUPS = [
  { id: 'people', label: 'Người', color: '#4a86e8' },
  { id: 'time', label: 'Thời gian', color: '#9900ff' },
  { id: 'task', label: 'Task', color: '#ff9900' },
  { id: 'log', label: 'Log', color: '#6aa84f' },
  { id: 'points', label: 'Điểm và Góp ý', color: '#f1c232' },
  { id: 'mail', label: 'Mail và Thông báo', color: '#c27ba0' },
  { id: 'system', label: 'Hệ thống', color: '#cc0000' }
];

var TABLES = [
  // Nhóm Người
  { name: 'members', label: 'Thành viên', group: 'people', key: ['member_id'],
    columns: ['member_id', 'full_name', 'birth_date:date', 'email', 'phone', 'facebook_name', 'facebook_url', 'join_batch', 'join_term_id'] },
  { name: 'member_terms', label: 'Thành viên theo nhiệm kỳ', group: 'people', key: ['member_id', 'term_id'],
    columns: ['member_id', 'term_id', 'class_name', 'dept_code', 'sub_team', 'position', 'status', 'left_date:date'] },
  { name: 'accounts', label: 'Tài khoản', group: 'people', key: ['member_id'],
    columns: ['member_id', 'password_hash', 'password_salt', 'password_changed:bool', 'theme', 'notify_zalo:bool', 'notify_app:bool',
      'self_remind:bool', 'avatar_url', 'last_login_at:time', 'data_consent_at:time'] },
  { name: 'member_labels', label: 'Nhãn và phân công', group: 'people', key: ['label_id'], id: { prefix: 'N', perTerm: true, width: 4 },
    columns: ['label_id', 'member_id', 'term_id', 'label_type', 'detail', 'start_date:date', 'end_date:date'] },
  { name: 'fanpages', label: 'Fanpage', group: 'people', key: ['page_name'],
    columns: ['member_id', 'page_name', 'page_url', 'added_date:date'] },

  // Nhóm Thời gian
  { name: 'terms', label: 'Nhiệm kỳ', group: 'time', key: ['term_id'],
    columns: ['term_id', 'prep_start_at:time', 'phase1_start_at:time', 'phase2_start_at:time', 'archive_file_id', 'archived_at:time'] },
  { name: 'roster_uploads', label: 'Lần tải sheet', group: 'time', key: ['upload_id'], id: { prefix: 'TL', perTerm: true, width: 2 },
    columns: ['upload_id', 'term_id', 'sheet_type', 'batch_type', 'uploaded_at:time', 'uploaded_by', 'copy_url', 'summary', 'status'] },
  { name: 'events', label: 'Sự kiện', group: 'time', key: ['event_id'], id: { prefix: 'SK', perTerm: true, width: 2 },
    columns: ['event_id', 'term_id', 'name', 'planned_date:date', 'description', 'created_by'] },
  { name: 'event_closings', label: 'Chốt sự kiện', group: 'time', key: ['event_id'],
    columns: ['event_id', 'status', 'planned_sessions:num', 'actual_sessions:num', 'closed_by', 'closed_at:time'] },

  // Nhóm Task
  { name: 'tasks', label: 'Task', group: 'task', key: ['task_id'], id: { prefix: 'T', perTerm: true, width: 4 },
    columns: ['task_id', 'event_id', 'dept_code', 'name', 'description', 'deadline:time', 'created_by', 'created_at:time',
      'is_cancelled:bool', 'is_counted:bool'] },
  { name: 'task_assignments', label: 'Giao task', group: 'task', key: ['task_id', 'member_id'],
    columns: ['task_id', 'member_id', 'confirmed_at:time', 'confirmed_by', 'marked_on_time:bool', 'quality', 'graded_by', 'graded_at:time'] },

  // Nhóm Log
  { name: 'log_sessions', label: 'Buổi log', group: 'log', key: ['session_id'], id: { prefix: 'B', perTerm: true, width: 4 },
    columns: ['session_id', 'event_id', 'name', 'duration_min:num', 'cancelled_other_reason:bool', 'is_counted:bool', 'cancelled_no_work:bool'] },
  { name: 'log_quotas', label: 'Chỉ tiêu log', group: 'log', key: ['event_id', 'scope_type', 'scope_value'],
    columns: ['event_id', 'scope_type', 'scope_value', 'initial_sessions:num'] },
  { name: 'attendance', label: 'Điểm danh', group: 'log', key: ['session_id', 'member_id'],
    columns: ['session_id', 'member_id', 'counted_as', 'marked_by', 'marked_at:time'] },
  { name: 'log_results', label: 'Kết quả log', group: 'log', key: ['event_id', 'member_id'],
    columns: ['event_id', 'member_id', 'initial_quota:num', 'final_quota:num', 'attended:num', 'extra_sessions:num'] },

  // Nhóm Điểm và Góp ý
  { name: 'activities', label: 'Hoạt động', group: 'points', key: ['activity_id'], id: { prefix: 'HD', perTerm: false, width: 4 },
    columns: ['activity_id', 'name', 'points:num', 'limit_note', 'added_date:date', 'is_active:bool'] },
  { name: 'point_entries', label: 'Cộng điểm', group: 'points', key: ['entry_id'], id: { prefix: 'D', perTerm: true, width: 5 },
    columns: ['entry_id', 'member_id', 'activity_id', 'points:num', 'event_id', 'source', 'source_id', 'awarded_at:time', 'awarded_by',
      'is_cancelled:bool', 'cancelled_by', 'cancelled_at:time'] },
  { name: 'seeding_posts', label: 'Bài seeding', group: 'points', key: ['post_id'], id: { prefix: 'S', perTerm: true, width: 4 },
    columns: ['post_id', 'post_url', 'created_by', 'created_at:time', 'remind_at:time', 'status', 'recorded_at:time'] },
  { name: 'feedback', label: 'Góp ý', group: 'points', key: ['feedback_id'], id: { prefix: 'G', perTerm: true, width: 4 },
    columns: ['feedback_id', 'content', 'is_anonymous:bool', 'member_id', 'sent_date:date', 'is_read:bool', 'is_applied:bool', 'marked_by'] },
  { name: 'phase_results', label: 'Kết quả giai đoạn', group: 'points', key: ['term_id', 'phase', 'member_id'],
    columns: ['term_id', 'phase', 'summary_round', 'member_id', 'total_points:num', 'kpi_log:num', 'kpi_task:num', 'rank:num',
      'is_top_reward:bool', 'certificate', 'snapshot_at:time'] },

  // Nhóm Mail và Thông báo
  { name: 'mail_requests', label: 'Yêu cầu mail', group: 'mail', key: ['request_id'], id: { prefix: 'M', perTerm: true, width: 4 },
    columns: ['request_id', 'created_at:time', 'drafted_by', 'action', 'gmail_thread_id', 'thread_subject', 'to', 'cc', 'bcc', 'subject',
      'body', 'is_html:bool', 'quote_original:bool', 'label', 'attachments', 'status', 'review_note', 'reviewed_by', 'reviewed_at:time'] },
  { name: 'contacts', label: 'Danh bạ', group: 'mail', key: ['contact_id'], id: { prefix: 'LH', perTerm: false, width: 4 },
    columns: ['contact_id', 'group_name', 'name', 'email', 'note'] },
  { name: 'mail_sends', label: 'Lịch gửi', group: 'mail', key: ['send_id'], id: { prefix: 'H', perTerm: true, width: 4 },
    columns: ['send_id', 'created_at:time', 'send_at:time', 'gmail_draft_id', 'subject', 'recipients', 'recipient_source', 'created_by',
      'status', 'result'] },
  { name: 'zalo_links', label: 'Kết nối Zalo', group: 'mail', key: ['member_id'],
    columns: ['member_id', 'link_code', 'chat_id', 'zalo_name', 'linked_at:time'] },
  { name: 'devices', label: 'Thiết bị', group: 'mail', key: ['endpoint'],
    columns: ['endpoint', 'member_id', 'device_key', 'device_name', 'enabled_at:time', 'last_fetched_at:time', 'p256dh', 'auth'] },
  { name: 'notifications', label: 'Thông báo', group: 'mail', key: [],
    columns: ['sent_at:time', 'member_id', 'title', 'body'] },

  // Nhóm Hệ thống
  { name: 'settings', label: 'Cài đặt', group: 'system', key: ['key'], handEditable: true,
    columns: ['key', 'value', 'description'] },
  { name: 'departments', label: 'Cơ cấu', group: 'system', key: ['dept_code'],
    columns: ['dept_code', 'dept_name', 'sub_teams', 'sort_order:num', 'is_active:bool'] },
  { name: 'audit_log', label: 'Nhật ký', group: 'system', key: [],
    columns: ['logged_at:time', 'actor_id', 'action', 'table_name', 'row_id', 'column_name', 'old_value', 'new_value'] }
];

/** Giá trị cố định: sheet lưu mã tiếng Anh, app hiện chữ tiếng Việt (mục "Giá trị cố định" trong doc). */
var ENUMS = {
  'member_terms.status': { active: 'Đang ở CLB', left: 'Đã rời' },
  'accounts.theme': { light: 'Sáng', dark: 'Tối', system: 'Theo máy' },
  'member_labels.label_type': { core_team: 'Core team', ucv: 'UCV', dept_lead: 'NS phụ trách ban', seeding_lead: 'NS phụ trách seeding',
    birthday_lead: 'NS phụ trách sinh nhật' },
  'roster_uploads.sheet_type': { members: 'Thành viên', core_team: 'Core team', ucv: 'UCV' },
  'roster_uploads.batch_type': { oday: 'Oday', batch_1: 'Đợt 1', batch_2: 'Đợt 2', update: 'Cập nhật' },
  'roster_uploads.status': { applied: 'Đã áp dụng', undone: 'Đã hoàn tác' },
  'event_closings.status': { open: 'Đang mở', closed: 'Đã chốt' },
  'task_assignments.quality': { complete: 'Hoàn chỉnh', needs_revision: 'Cần chỉnh sửa', poor: 'Làm quá sơ sài' },
  'log_quotas.scope_type': { dept: 'Ban', grade: 'Khối', member: 'Thành viên' },
  'attendance.counted_as': { present: 'Có mặt', registered_cancelled: 'Đăng ký nhưng buổi bị huỷ' },
  'point_entries.source': { manual: 'Tay', seeding: 'Seeding', log_extra: 'Log vượt', feedback: 'Góp ý' },
  'seeding_posts.status': { waiting: 'Chờ dán', recorded: 'Đã ghi nhận' },
  'phase_results.phase': { phase_1: 'GD1', phase_2: 'GD2', full_term: 'Cả nhiệm kỳ' },
  'phase_results.certificate': { cert_kpi: 'Cấp vì đạt KPI', cert_offset: 'Cấp nhờ bù trừ', none: 'Chưa cấp' },
  'phase_results.summary_round': { round_1: 'Đợt 1', round_2: 'Đợt 2' },
  'mail_requests.action': { compose: 'Soạn thư mới', reply: 'Trả lời', reply_all: 'Trả lời tất cả', forward: 'Chuyển tiếp', archive: 'Lưu trữ',
    move_to_inbox: 'Chuyển về hộp thư đến', trash: 'Chuyển vào thùng rác', add_label: 'Gắn nhãn', remove_label: 'Bỏ nhãn',
    report_spam: 'Báo cáo thư rác' },
  'mail_requests.status': { draft: 'Nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', needs_changes: 'Cần sửa lại', rejected: 'Từ chối',
    error: 'Lỗi' },
  'mail_sends.status': { scheduled: 'Đã lên lịch', sending: 'Đang gửi', sent: 'Đã gửi', error: 'Lỗi', cancelled: 'Đã huỷ' },
  'audit_log.action': { grade_task: 'Chấm task', change_deadline: 'Sửa hạn chót', add_points: 'Cộng điểm', cancel_points: 'Huỷ điểm',
    mark_attendance: 'Điểm danh', close_event: 'Chốt sự kiện', reopen_event: 'Mở chốt', approve_mail: 'Duyệt mail', upload_sheet: 'Tải sheet',
    undo_upload: 'Hoàn tác', change_setting: 'Sửa cài đặt', edit_member: 'Sửa thông tin thành viên',
    change_task_status: 'Đổi trạng thái task', remove_assignee: 'Bỏ người khỏi task' }
};

/** Đợt gia nhập trong Mã TV (giữ mã ngắn, không đổi sang tiếng Anh). */
var JOIN_BATCHES = ['OD', 'D1', 'D2', 'CU'];

/** Dòng có sẵn ở tab Cơ cấu khi tạo file (BOD sửa được trong Cài đặt). */
var DEFAULT_DEPARTMENTS = [
  { dept_code: 'BOD', dept_name: 'Ban điều hành', sub_teams: '', sort_order: 1, is_active: true },
  { dept_code: 'PG', dept_name: 'Ban Chương trình', sub_teams: '', sort_order: 2, is_active: true },
  { dept_code: 'PR', dept_name: 'Truyền thông', sub_teams: 'CAP, DES, PHO', sort_order: 3, is_active: true },
  { dept_code: 'AD', dept_name: 'Ban Đối ngoại', sub_teams: '', sort_order: 4, is_active: true },
  { dept_code: 'HR', dept_name: 'Ban Nhân sự', sub_teams: '', sort_order: 5, is_active: true }
];

/**
 * Dòng có sẵn ở tab Cài đặt khi tạo file: các mức trong quy chế và mã đăng nhập Google. Những dòng khác (giờ nhắc, lịch sinh nhật, Zalo...)
 * do bước làm tính năng đó thêm vào.
 */
var DEFAULT_SETTINGS = [
  { key: 'kpi_threshold', value: '80', description: '% tối thiểu để đạt KPI log và task' },
  { key: 'offset_threshold', value: '60', description: '% tối thiểu mỗi phần để được xét bù trừ' },
  { key: 'top_reward_percent', value: '15', description: 'Khen thưởng top bao nhiêu % mỗi giai đoạn' },
  { key: 'offset_top_percent', value: '40', description: 'Lọt top bao nhiêu % bảng bù trừ thì được cấp certificate' },
  { key: 'not_done_after_hours', value: '24', description: 'Quá hạn bao nhiêu giờ mà chưa xác nhận thì task tính là Không làm' },
  { key: 'due_soon_days', value: '2', description: 'Còn bao nhiêu ngày tới hạn chót thì task hiện Sắp đến hạn' },
  { key: 'react_activity_id', value: '', description: 'Mã hoạt động app tự cộng khi seeding ghi nhận react (app tự điền khi tạo thang điểm)' },
  { key: 'comment_activity_id', value: '', description: 'Mã hoạt động app tự cộng khi seeding ghi nhận comment' },
  { key: 'feedback_activity_id', value: '', description: 'Mã hoạt động app tự cộng khi góp ý được áp dụng' },
  { key: 'log_extra_activity_id', value: '', description: 'Mã hoạt động app tự cộng cho mỗi buổi log vượt khi chốt sự kiện' },
  { key: 'log_template_url', value: '', description: 'Link file mẫu sheet đăng ký log (mẫu của tool cũ, có tab Đăng ký log). Để trống là app tự kẻ bảng' },
  { key: 'log_folder_url', value: '', description: 'Link thư mục lưu sheet đăng ký log. Để trống là thư mục [ECO] Đăng ký log trong Drive của CLB' },
  { key: 'google_client_id', value: '', description: 'Mã ứng dụng Google (OAuth Client ID) để đăng nhập bằng Google. Để trống là tắt đăng nhập bằng Google' }
];

/**
 * Thang điểm mặc định theo quy chế (mục 5.5 tài liệu yêu cầu), thêm vào tab Hoạt động khi tab còn trống.
 * auto: hoạt động app tự cộng (seeding, góp ý, log vượt); mã của chúng ghi vào Cài đặt <auto>_activity_id,
 * và trang Cộng điểm không cho chọn tay để khỏi cộng hai lần. Log vượt tính theo buổi 90 phút: buổi 180 phút là 2 buổi, +40.
 */
var DEFAULT_ACTIVITIES = [
  { name: 'React bài đăng trong vòng 48 giờ', points: 1, limit_note: 'Mỗi bài một lần', auto: 'react' },
  { name: 'Comment bài đăng trong vòng 48 giờ', points: 2, limit_note: 'Mỗi bài một lần', auto: 'comment' },
  { name: 'Làm staff ca ngắn (giờ ra chơi)', points: 3, limit_note: '' },
  { name: 'Tham gia bonding', points: 5, limit_note: '' },
  { name: 'Góp ý được đưa vào sử dụng', points: 10, limit_note: 'Tối đa 2 lần mỗi giai đoạn', auto: 'feedback' },
  { name: 'Làm log vượt số buổi được giao cuối (mỗi buổi 90 phút)', points: 20, limit_note: 'Buổi 180 phút tính là 2 buổi', auto: 'log_extra' },
  { name: 'Đại diện CLB tham gia cuộc thi', points: 40, limit_note: '' },
  { name: 'Tham dự sự kiện của CLB hoặc của đối tác', points: 40, limit_note: '' },
  { name: 'Làm staff 1 buổi (sự kiện lớn)', points: 50, limit_note: '' }
];
