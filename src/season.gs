/**
 * Cài đặt > Giao diện theo mùa: chủ đề trang trí (trang chủ và màn đăng nhập) và ảnh nền đăng nhập, đổi cho cả CLB.
 * Chủ đề lưu ở Cài đặt season_theme (trống là không trang trí). Ảnh nền là JPEG trong thư mục Drive "[APP] Ảnh nền đăng nhập" (appFolder_('login_bg'));
 * Cài đặt login_bg_file_id trỏ tới ảnh, login_bg_version đổi mỗi lần thay ảnh để máy biết lấy ảnh mới.
 */

var SEASONS = ['spring', 'summer', 'autumn', 'winter', 'tet', 'womens_day', 'earth', 'national_day', 'mid_autumn', 'halloween', 'teachers_day', 'christmas'];
var LOGIN_BG_MAX = 2500000; // số ký tự base64, khoảng 1,8 MB ảnh

/** Chủ đề đang dùng ('' là không trang trí). */
function seasonTheme_() {
  var id = String(getSetting_('season_theme', '') || '').trim();
  return SEASONS.indexOf(id) >= 0 ? id : '';
}

/** BOD đổi chủ đề cho cả CLB. id trống là bỏ trang trí. Trả về id đã lưu. */
function saveSeason(token, id) {
  var me = requireUser_(token, 'bod');
  id = String(id || '').trim();
  if (id && SEASONS.indexOf(id) < 0) throw new Error('Chủ đề không hợp lệ.');
  if (id !== seasonTheme_()) setSetting_('season_theme', id, me.memberId, 'Chủ đề trang trí theo mùa; trống là không trang trí');
  return id;
}

/** BOD đổi ảnh nền màn đăng nhập (data:image/jpeg;base64,...), hoặc để trống để về nền xanh mặc định. Trả về phiên bản mới ('' khi bỏ ảnh). */
function saveLoginBackground(token, dataUrl) {
  var me = requireUser_(token, 'bod');
  var s = String(dataUrl || ''), b64 = '';
  if (s) {
    var m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(s);
    if (!m) throw new Error('Ảnh phải là JPEG.');
    if (m[1].length > LOGIN_BG_MAX) throw new Error('Ảnh quá lớn. Chọn ảnh nhỏ hơn 1,8 MB.');
    b64 = m[1];
  }
  return withLock_(function () {
    var oldId = String(getSetting_('login_bg_file_id', '') || ''), fileId = '', version = '';
    if (b64) {
      var folder = appFolder_('login_bg');
      version = String(Date.now());
      fileId = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', 'nen-dang-nhap-' + version + '.jpg')).getId();
    }
    setSetting_('login_bg_file_id', fileId, me.memberId, 'Mã ảnh nền màn đăng nhập trên Drive; trống là nền xanh mặc định');
    setSetting_('login_bg_version', version, me.memberId, 'Phiên bản ảnh nền đăng nhập, đổi mỗi lần thay ảnh');
    if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* ảnh cũ đã bị xoá tay */ } }
    return version;
  });
}

/**
 * Ảnh nền màn đăng nhập, gọi được khi chưa đăng nhập. version: phiên bản máy đang giữ.
 * Trả về { version } và thêm data (data URL JPEG) chỉ khi máy cần ảnh mới.
 */
function loginBackground(version) {
  var cur = String(getSetting_('login_bg_version', '') || ''), id = String(getSetting_('login_bg_file_id', '') || '');
  if (!cur || !id) return { version: '' };
  if (String(version || '') === cur) return { version: cur };
  try { return { version: cur, data: 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()) }; } catch (e) { return { version: '' }; }
}
