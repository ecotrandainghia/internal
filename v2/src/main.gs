/**
 * App CLB ECO bản mới: trang web.
 * Bước 1 chỉ có khung (thanh bên, menu 3 gạch, menu avatar, pop-up Cài đặt).
 * Vai trò tạm lấy từ ?role= để xem thử; bước 3 thay bằng đăng nhập thật.
 */

var ROLES = ['BOD', 'TV', 'HR'];

function doGet(e) {
  var role = e && e.parameter && ROLES.indexOf(e.parameter.role) >= 0 ? e.parameter.role : 'BOD';
  var page = HtmlService.createTemplateFromFile('index');
  page.role = role;
  return page.evaluate()
    .setTitle('CLB ECO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
