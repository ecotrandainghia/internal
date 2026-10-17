# Hướng dẫn cài đặt lên tài khoản Google của CLB

Làm một lần duy nhất, khoảng 20 phút. Đăng nhập **tài khoản Google của CLB** trước khi bắt đầu. Mọi bước bên dưới đều làm bằng tài khoản này.

Mã của app nằm ở một dự án Apps Script riêng. File dữ liệu do app tự tạo ở lần mở đầu tiên. Không cần tạo Google Sheet trước, và trong Google Sheet không có menu nào của app.

## 1. Tạo dự án Apps Script

1. Mở https://script.google.com, bấm **Dự án mới**.
2. Bấm vào tên "Dự án không có tiêu đề" ở trên cùng, đặt tên **CLB ECO**.
3. Bấm **Cài đặt dự án** (bánh răng). Kiểm tra **Múi giờ** là `(GMT+07:00) Hà Nội` hoặc `Asia/Ho_Chi_Minh`. Bật **Hiển thị tệp kê khai "appsscript.json" trong trình chỉnh sửa**.
4. Ở trang này có **ID tập lệnh**. Sao chép lại, bước 2 cần dùng.

## 2. Đưa mã vào Apps Script

### Cách tự động (khuyên dùng)

Cài một lần. Sau đó mỗi khi gộp thay đổi vào nhánh `main` trên GitHub, GitHub tự chạy kiểm thử, đẩy mã lên Apps Script và cập nhật app. Link app giữ nguyên.

1. Mở https://script.google.com/home/usersettings và bật **Google Apps Script API**.
2. Trên một máy tính có cài Node.js, mở cửa sổ lệnh (Terminal trong VS Code) và chạy `npx @google/clasp login`. Trình duyệt mở ra: chọn **tài khoản CLB**, bấm **Cho phép**.
3. Mở file `.clasprc.json` vừa được tạo trong thư mục người dùng (Windows: `C:\Users\<tên máy>\.clasprc.json`, Mac: `~/.clasprc.json`) và sao chép toàn bộ nội dung.
4. Trên GitHub, vào kho mã → **Settings → Secrets and variables → Actions → New repository secret**, tạo:
   - `CLASPRC_JSON`: dán nội dung vừa sao chép.
   - `SCRIPT_ID`: dán **ID tập lệnh** của dự án vừa tạo ở bước 1. Nếu trước đây đã có `SCRIPT_ID` của dự án cũ (dự án gắn vào file Google Sheet), sửa lại thành ID của dự án mới.
5. Xoá file `.clasprc.json` trên máy cho an toàn.
6. Vào tab **Actions** của kho mã → **Đẩy code lên Google Apps Script** → **Run workflow**. Đợi dấu tích xanh, rồi tải lại trang Apps Script sẽ thấy đủ các file.
7. Sau bước 3 bên dưới (triển khai lần đầu), vào **Triển khai → Quản lý các lần triển khai**, sao chép **Mã triển khai** và tạo (hoặc sửa) secret `DEPLOYMENT_ID`. Từ đó mỗi lần gộp thay đổi, app tự cập nhật.

Lưu ý: Apps Script giữ tối đa 200 phiên bản. Nếu GitHub báo lỗi đã đủ phiên bản, vào Apps Script → **Phiên bản** (biểu tượng đồng hồ) xoá bớt các phiên bản cũ. Nếu đăng nhập hết hạn (lâu không dùng), làm lại bước 2 đến 4 cho `CLASPRC_JSON`. App đang chạy không bị ảnh hưởng.

### Cách thủ công

Trên GitHub, mở từng file trong thư mục `src/`, bấm nút **Copy raw file** (biểu tượng hai tờ giấy ở góc phải) rồi dán vào Apps Script:

- File `.gs`: bấm **+ → Tập lệnh**, đặt đúng tên file bỏ phần `.gs` (ví dụ `DuLieu`). Riêng `Code.gs` thì dán đè vào file `Mã.gs` (hoặc `Code.gs`) có sẵn.
- File `.html`: bấm **+ → HTML**, đặt đúng tên file bỏ phần `.html` (ví dụ `DeskCaiDat`).
- `appsscript.json`: mở file `appsscript.json` trong trình soạn (đã bật hiện ở bước 1) và dán đè.

Phải chép **đủ mọi file** trong `src/`, kể cả `LogoEco.html`. Bấm biểu tượng **Lưu** (đĩa mềm).

## 3. Triển khai thành ứng dụng web

1. Trong Apps Script, bấm **Triển khai → Tùy chọn triển khai mới**.
2. Bấm bánh răng cạnh "Chọn loại", chọn **Ứng dụng web**.
3. **Thực thi với tư cách**: Tôi (tài khoản CLB). **Người có quyền truy cập**: Bất kỳ ai.
4. Bấm **Triển khai**. Google hỏi quyền: bấm **Ủy quyền truy cập**, chọn tài khoản CLB. Nếu thấy cảnh báo "Google chưa xác minh ứng dụng này", bấm **Nâng cao → Đi tới CLB ECO (không an toàn)** rồi **Cho phép**. Cảnh báo này xuất hiện vì đây là ứng dụng tự viết của CLB.
5. Sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).

## 4. Cài đặt lần đầu trong app

1. Vẫn đăng nhập tài khoản CLB, mở URL ứng dụng web vừa sao chép. Lần đầu app hiện trang **Cài đặt app CLB ECO**. Chỉ người quản lý tài khoản CLB mới làm được bước này: nếu trang hiện ô **Mã xác nhận** (Google không cho biết ai đang mở trang), bấm **Gửi mã**, mở hộp thư của tài khoản CLB lấy mã 6 số rồi nhập vào.
2. Chọn một trong hai cách:
   - **Tạo mới** (cài lần đầu): app tạo thư mục **CLB ECO - App** trên Drive, trong đó có các thư mục con Sao lưu, Lưu trữ, Đính kèm mail, Ảnh nền và file dữ liệu **CLB ECO - Dữ liệu**. App cũng tạo mọi lịch chạy tự động.
   - **Dùng file có sẵn**: dán link một file dữ liệu cũ của app (ví dụ bản sao lưu, hoặc khi chuyển app sang tài khoản CLB khác). File đã có tài khoản BOD và mật khẩu chung thì các ô bên dưới để trống được.
3. Điền họ tên, email, mật khẩu của bạn (tài khoản BOD đầu tiên). Dùng đúng email bạn ghi trong danh sách thành viên, cột Ban là BOD.
4. Điền **mật khẩu chung của CLB**. Thành viên chưa tự đổi mật khẩu sẽ đăng nhập bằng mật khẩu này. Đổi được sau ở Cài đặt, Tài khoản, Mật khẩu chung.
5. Bấm **Cài đặt**. Xong thì tải lại trang và đăng nhập bằng email, mật khẩu vừa điền.

Nếu Google hỏi thêm quyền (ví dụ Lịch, Gmail), bấm **Cho phép** như bước 3.4.

## 5. Gắn link app vào trang vỏ

Mở file `pwa/config.js` và dán URL ứng dụng web vào `webAppUrl`. Đây là link của dự án mới, khác link của dự án cũ. Gộp thay đổi vào `main` thì GitHub tự đăng lại trang vỏ. Từ đó mọi người mở app ở `https://ecotrandainghia.github.io/internal/`.

## 6. Tải danh sách thành viên

1. Chia sẻ sheet danh sách thành viên cho tài khoản CLB (quyền chỉnh sửa, để app ghi được mã thành viên).
2. Trong app, vào **Cài đặt → Tài khoản → Tải danh sách thành viên**.
3. Chọn kiểu tải: **Sau Oday**, **Sau tuyển đợt 1**, **Sau tuyển đợt 2** hoặc **Cập nhật**. Lần đầu tiên chọn "Sau Oday" hoặc "Sau tuyển đợt 1".
4. Dán link sheet, ghi tên tab (để trống là tab đầu). Nên để bật **Ghi mã thành viên vào sheet nguồn**.
5. Bấm **Xem trước**. App báo ai được thêm, ai sửa thông tin, ai đổi ban, ai đã rời. Kiểm tra rồi bấm **Tải lên**.

Người không còn trong danh sách được đánh dấu "Đã rời", không bao giờ bị xoá. Lịch sinh nhật đặt ở **Cài đặt → Tài khoản → Lịch sinh nhật**.

## Khi có mã mới

Nếu đã cài cách tự động ở bước 2, chỉ cần gộp thay đổi vào `main`. Nếu không, chép lại các file đã thay đổi như bước 2, lưu, rồi vào **Triển khai → Quản lý các lần triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**. Link app giữ nguyên.

Bản mới thêm bảng hay cột thì app tự thêm vào file dữ liệu ở lần dùng đầu tiên. Nếu bản mới cần thêm quyền của Google, chọn hàm `khoiTaoCoSoDuLieu` ở thanh trên cùng của Apps Script, bấm **Chạy**, rồi **Cho phép**.

## Kiểm tra app có chạy đều không

Vào **Cài đặt → Hệ thống → Tình trạng hệ thống**. Ở đây có các lịch chạy, lần chạy gần nhất, nhật ký và dung lượng file dữ liệu. Thiếu lịch chạy thì bấm **Sửa lịch chạy**. Lỗi ở việc chạy tự động được gửi mail cho BOD, mỗi việc tối đa một mail mỗi ngày.

## Bật nhắc việc qua Zalo

Head HR làm mỗi năm một lần. Hướng dẫn chi tiết có ngay trong app: **Cài đặt → Thông báo → Thông báo của thành viên → Bot Zalo**. Tóm tắt: tạo bot ở bot.zaloplatforms.com, dán mã bot vào app, bấm Lưu. Giờ nhắc chọn ở **Cài đặt → Thông báo → Lịch nhắc task**. Rồi ai muốn nhận nhắc qua Zalo thì nhắn mã kết nối của mình cho bot (mã xem ở Cài đặt, Thông báo của tôi).

## Bật đăng nhập bằng Google

Làm một lần, khoảng 5 phút, bằng **tài khoản Google của CLB**. Hướng dẫn từng bước có ngay trong app: **Cài đặt → Tài khoản → Đăng nhập bằng Google**. Tóm tắt:

1. Mở https://console.cloud.google.com, tạo một dự án (ví dụ "CLB ECO").
2. Vào **APIs & Services → OAuth consent screen**, chọn **External**, điền tên app và email CLB, lưu rồi bấm **Publish app**.
3. Vào **Credentials → Create credentials → OAuth client ID**, loại **Web application**. Ở **Authorized JavaScript origins** thêm `https://ecotrandainghia.github.io`. Bấm **Create**.
4. Sao chép **Client ID** (đuôi `.apps.googleusercontent.com`), dán vào app ở **Cài đặt → Tài khoản → Đăng nhập bằng Google**, bấm Lưu.

Nút Google chỉ hiện khi mở app từ trang vỏ (link `ecotrandainghia.github.io/internal/`). Người đăng nhập phải dùng đúng email đã có tài khoản trong app (email trong danh sách thành viên).
