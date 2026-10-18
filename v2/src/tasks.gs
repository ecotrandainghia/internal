/**
 * Task: phần thành viên tự làm. Thành viên bấm "Đã xong" (xác nhận hoàn thành); app tự biết đúng hạn hay trễ hạn.
 * Bấm nhầm thì tự huỷ xác nhận được, miễn là BOD chưa chấm. Phần BOD và NS quản lý task làm ở bước 5.
 */

/** Dòng Giao task của chính mình, kèm task. Không có thì báo lỗi. */
function myAssignment_(memberId, taskId) {
  var task = findRecord_('tasks', String(taskId || ''));
  var a = task && findRecord_('task_assignments', { task_id: task.task_id, member_id: memberId });
  if (!a) throw new Error('Không tìm thấy task này trong danh sách task của bạn.');
  return { task: task, assignment: a };
}

/** Thành viên xác nhận hoàn thành task của mình. */
function confirmTask(token, taskId) {
  var me = requireUser_(token);
  return withLock_(function () {
    delete memo_.tasks; delete memo_.task_assignments;
    var x = myAssignment_(me.memberId, taskId), now = new Date();
    if (x.task.is_cancelled) throw new Error('Task này đã bị huỷ.');
    if (x.assignment.confirmed_at) throw new Error('Bạn đã xác nhận task này rồi.');
    if (taskTiming_(x.task, x.assignment, now, getNumberSetting_('not_done_after_hours', 24)) === 'not_done') {
      throw new Error('Task đã quá hạn lâu nên tính là Không làm. Nếu bạn đã nộp, nhắn BOD hoặc NS phụ trách ban nhé.');
    }
    updateRecord_('task_assignments', { task_id: x.task.task_id, member_id: me.memberId }, { confirmed_at: now, confirmed_by: me.memberId });
    return true;
  });
}

/** Huỷ xác nhận khi bấm nhầm. Chỉ khi chính mình đã xác nhận và BOD chưa chấm. */
function undoConfirmTask(token, taskId) {
  var me = requireUser_(token);
  return withLock_(function () {
    delete memo_.tasks; delete memo_.task_assignments;
    var a = myAssignment_(me.memberId, taskId).assignment;
    if (!a.confirmed_at) throw new Error('Task này chưa được xác nhận.');
    if (a.quality) throw new Error('BOD đã chấm task này nên không huỷ được. Nhắn BOD nếu cần sửa.');
    if (a.confirmed_by !== me.memberId) throw new Error('Task này do NS hoặc BOD xác nhận giúp bạn. Nhắn họ nếu cần sửa.');
    updateRecord_('task_assignments', { task_id: a.task_id, member_id: me.memberId }, { confirmed_at: '', confirmed_by: '', marked_on_time: false });
    return true;
  });
}
