/**
 * App CLB ECO bản mới: trang web.
 * Chưa có file dữ liệu thì mở trang cài đặt lần đầu (setup.gs); có rồi thì mở app, trang web tự hỏi đăng nhập.
 */

function doGet() {
  if (!hasDataFile_()) return setupPage_();
  var page = HtmlService.createTemplateFromFile('index');
  page.googleClientId = String(getSetting_('google_client_id', '')).trim();
  return page.evaluate()
    .setTitle('CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
