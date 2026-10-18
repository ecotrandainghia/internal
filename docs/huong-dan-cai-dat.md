# Hướng dẫn cài đặt lên tài khoản Google của CLB

Làm một lần duy nhất, khoảng 20 phút. Đăng nhập **tài khoản Google của CLB** trước khi bắt đầu. Mọi bước bên dưới đều làm bằng tài khoản này.

Mã của app nằm ở một dự án Apps Script riêng. File dữ liệu "[ECO] Dữ liệu app" do app tự tạo ở lần cài đặt đầu tiên. Không cần tạo Google Sheet trước, và trong Google Sheet không có menu nào của app.

Nếu dự án Apps Script đã có sẵn và GitHub đã có secret `SCRIPT_ID`, `DEPLOYMENT_ID`, `CLASPRC_JSON` (ví dụ đang chạy bản trước của app), bỏ qua bước 1 đến 3 và xem mục **Chuyển từ bản trước** ở cuối.

## 1. Tạo dự án Apps Script

1. Mở https://script.google.com, bấm **Dự án mới**.
2. Bấm vào tên "Dự án không có tiêu đề" ở trên cùng, đặt tên **CLB ECO**.
3. Bấm **Cài đặt dự án** (bánh răng). Kiểm tra **Múi giờ** là `(GMT+07:00) Hà Nội` hoặc `Asia/Ho_Chi_Minh`.
4. Ở trang này có **ID tập lệnh**. Sao chép lại, bước 2 cần dùng.

## 2. Đưa mã vào Apps Script

Cài một lần. Sau đó mỗi khi gộp thay đổi vào nhánh `main` trên GitHub, GitHub tự chạy kiểm thử, đẩy thư mục `src/` lên Apps Script và cập nhật app. Link app giữ nguyên.

1. Mở https://script.google.com/home/usersettings và bật **Google Apps Script API**.
2. Trên một máy tính có cài Node.js, mở cửa sổ lệnh (Terminal trong VS Code) và chạy `npx @google/clasp login`. Trình duyệt mở ra: chọn **tài khoản CLB**, bấm **Cho phép**.
3. Mở file `.clasprc.json` vừa được tạo trong thư mục người dùng (Windows: `C:\Users\<tên máy>\.clasprc.json`, Mac: `~/.clasprc.json`) và sao chép toàn bộ nội dung.
4. Trên GitHub, vào kho mã → **Settings → Secrets and variables → Actions → New repository secret**, tạo:
   - `CLASPRC_JSON`: dán nội dung vừa sao chép. Chỉ dán ở đây, không gửi cho ai.
   - `SCRIPT_ID`: dán **ID tập lệnh** ở bước 1.
5. Xoá file `.clasprc.json` trên máy cho an toàn.
6. Vào tab **Actions** của kho mã → **Đẩy code lên Google Apps Script** → **Run workflow**. Đợi dấu tích xanh, rồi tải lại trang Apps Script sẽ thấy đủ các file.
7. Sau bước 3 bên dưới (triển khai lần đầu), vào **Triển khai → Quản lý các lần triển khai**, sao chép **Mã triển khai** và tạo secret `DEPLOYMENT_ID`. Từ đó mỗi lần gộp thay đổi, app tự cập nhật.

Lưu ý: Apps Script giữ tối đa 200 phiên bản. Nếu GitHub báo lỗi đã đủ phiên bản, vào Apps Script → **Phiên bản** (biểu tượng đồng hồ) xoá bớt các phiên bản cũ. Nếu đăng nhập hết hạn (lâu không dùng), làm lại bước 2 đến 4 cho `CLASPRC_JSON`. App đang chạy không bị ảnh hưởng.

## 3. Triển khai thành ứng dụng web

1. Trong Apps Script, bấm **Triển khai → Tùy chọn triển khai mới**.
2. Bấm bánh răng cạnh "Chọn loại", chọn **Ứng dụng web**.
3. **Thực thi với tư cách**: Tôi (tài khoản CLB). **Người có quyền truy cập**: Bất kỳ ai.
4. Bấm **Triển khai**. Google hỏi quyền: bấm **Ủy quyền truy cập**, chọn tài khoản CLB. Nếu thấy cảnh báo "Google chưa xác minh ứng dụng này", bấm **Nâng cao → Đi tới CLB ECO (không an toàn)** rồi **Cho phép**. Cảnh báo này xuất hiện vì đây là ứng dụng tự viết của CLB.
5. Sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).

## 4. Cài đặt lần đầu trong app

1. Mở URL ứng dụng web (hoặc `https://ecotrandainghia.github.io/internal/` nếu đã làm bước 5). Lần đầu app hiện trang **Cài đặt app lần đầu**.
2. Chỉ người đọc được hộp thư của tài khoản CLB mới cài được. Nếu trang hiện ô mã, bấm **Gửi mã**, mở hộp thư của tài khoản CLB lấy mã 6 số rồi nhập vào.
3. Điền họ tên, email, mật khẩu của bạn (tài khoản BOD đầu tiên). Dùng đúng email bạn sẽ ghi trong danh sách thành viên.
4. Điền **mật khẩu chung của CLB**. Thành viên chưa tự đổi mật khẩu sẽ đăng nhập bằng mật khẩu này. Đổi được sau ở **Cài đặt → Tài khoản và phân quyền → Đặt lại mật khẩu**.
5. Bấm **Cài đặt**. App tạo file dữ liệu "[ECO] Dữ liệu app" trên Drive và cài các việc tự chạy. Xong thì đăng nhập bằng email, mật khẩu vừa điền.

Nếu app báo cần cấp quyền (thường sau khi bản mới dùng thêm dịch vụ của Google, ví dụ Lịch, Gmail), mở dự án trong Apps Script, chọn hàm `sendSetupCode` ở thanh trên cùng, bấm **Chạy** rồi **Cho phép** như bước 3.4. Hàm này chỉ gửi một mã vào hộp thư CLB; app đã cài thì nó báo "đã được cài đặt rồi", không sao cả.

## 5. Gắn link app vào trang vỏ

Mở file `pwa/config.js` và dán URL ứng dụng web vào `webAppUrl`. Gộp thay đổi vào `main` thì GitHub tự đăng lại trang vỏ. Từ đó mọi người mở app ở `https://ecotrandainghia.github.io/internal/`. Xem thêm `docs/huong-dan-cai-app.md`.

## 6. Tải danh sách thành viên

1. Chia sẻ sheet danh sách thành viên cho tài khoản CLB (quyền chỉnh sửa, để app ghi được mã thành viên).
2. Trong app, vào **Cài đặt → Tài khoản và phân quyền → Tải danh sách thành viên**.
3. Chọn kiểu tải: **Oday**, **Đợt 1**, **Đợt 2** hoặc **Cập nhật**. Mỗi kiểu có ghi chú ngay bên dưới.
4. Dán link sheet, ghi tên tab (để trống là tab đầu).
5. Bấm **Xem trước**. App báo ai được thêm, ai sửa thông tin, ai đổi ban, ai đã rời. Kiểm tra rồi bấm **Tải lên**.

Người không còn trong danh sách được đánh dấu đã rời, không bao giờ bị xoá. Core team và UCV tải ở **Cài đặt → Tài khoản và phân quyền → Core team và UCV**; NS phụ trách ban, seeding, sinh nhật gán ở **Phân quyền nhân sự**.

## Khi có mã mới

Chỉ cần gộp thay đổi vào `main`. GitHub chạy kiểm thử, đẩy mã và cập nhật app. Link app giữ nguyên. Bản mới thêm tab hay cột thì app tự thêm vào file dữ liệu ở lần dùng đầu tiên.

## Kiểm tra app có chạy đều không

Vào **Cài đặt → Hệ thống → Tình trạng hệ thống**. Ở đây có các việc tự chạy, lần chạy gần nhất và dung lượng file dữ liệu. Việc tự chạy bị lỗi thì app báo cho BOD qua Zalo hoặc app, mỗi việc tối đa một tin mỗi ngày. App tự sao lưu mỗi đêm, giữ 30 bản; khôi phục ở **Cài đặt → Hệ thống → Sao lưu và khôi phục**.

## Bật nhắc việc qua Zalo

Head HR làm mỗi năm một lần. Hướng dẫn chi tiết có ngay trong app: **Cài đặt → Thông báo của CLB → Bot Zalo**. Tóm tắt: tạo bot ở bot.zaloplatforms.com, dán mã bot vào app, bấm Lưu. Mốc nhắc chọn ở **Cài đặt → Thông báo của CLB → Lịch nhắc task**. Rồi ai muốn nhận nhắc qua Zalo thì nhắn mã kết nối của mình cho bot (mã xem ở **Cài đặt → Thông báo của tôi**).

## Bật đăng nhập bằng Google

Làm một lần, khoảng 5 phút. Các bước ở `docs/huong-dan-cai-app.md`, mục 3. Client ID dán vào **Cài đặt → Tài khoản và phân quyền → Đăng nhập bằng Google**.

## Chuyển từ bản trước

Khi dự án Apps Script đang chạy bản trước của app, chỉ cần gộp thay đổi vào `main`. GitHub đẩy mã mới lên đúng dự án đó, link app và trang vỏ giữ nguyên. Sau đó:

1. Mở link app. App chưa có file dữ liệu mới nên hiện trang **Cài đặt app lần đầu**: làm như bước 4. Nếu app báo cần cấp quyền, làm như cuối bước 4.
2. Lúc cài đặt, app tự bỏ các lịch chạy và thuộc tính dự án của bản trước. File dữ liệu cũ trên Drive giữ nguyên, app không đụng tới, cần tra lại thì mở file đó.
3. Tải lại danh sách thành viên như bước 6. Mật khẩu riêng của bản trước không chuyển sang: mọi người đăng nhập bằng mật khẩu chung rồi tự đổi.
4. Dán lại mã bot Zalo ở **Cài đặt → Thông báo của CLB → Bot Zalo**, và Client ID ở **Đăng nhập bằng Google** nếu có dùng. Thành viên nhắn lại mã kết nối mới cho bot.
