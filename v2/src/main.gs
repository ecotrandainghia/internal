/**
 * App CLB ECO bản mới: trang web.
 * Chưa có file dữ liệu thì mở trang cài đặt lần đầu (setup.gs); có rồi thì mở app, trang web tự hỏi đăng nhập.
 * ?tb=<mã máy>: điện thoại hỏi nội dung thông báo (notify.gs).
 */

function doGet(e) {
  // Máy bật thông báo từ bản cũ (tin không kèm nội dung) hỏi nội dung bằng mã máy.
  if (e && e.parameter && e.parameter.tb) {
    return ContentService.createTextOutput(JSON.stringify(hasDataFile_() ? noticesForDevice_(e.parameter.tb) : { ds: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (!hasDataFile_()) return setupPage_();
  var page = HtmlService.createTemplateFromFile('index');
  page.googleClientId = String(getSetting_('google_client_id', '')).trim();
  page.season = seasonTheme_();
  return page.evaluate()
    .setTitle('CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
