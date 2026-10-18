# Thử và chuyển sang app mới

App mới (code trong `v2/src`) chạy ở **một dự án Apps Script riêng** và **một file dữ liệu riêng**, nên thử thoải mái mà app cũ vẫn chạy bình thường. Làm bằng **tài khoản Google của CLB**.

## 1. Gộp code app mới vào `main`

Gộp lần lượt các PR của app mới (từ PR #5 tới PR mới nhất). Các PR này chỉ sửa trong `v2/`, `docs/` và `.github/`, không đụng `src/`, nên app cũ không đổi.

## 2. Tạo dự án Apps Script cho app mới

1. Mở https://script.google.com, bấm **Dự án mới**, đặt tên **CLB ECO (app mới)**.
2. Bấm **Cài đặt dự án** (bánh răng): kiểm tra **Múi giờ** là `Asia/Ho_Chi_Minh`, sao chép **ID tập lệnh**.
3. Trên GitHub, vào kho mã → **Settings → Secrets and variables → Actions → New repository secret**, tạo `NEW_SCRIPT_ID` và dán ID vừa sao chép. `CLASPRC_JSON` đã có từ app cũ, không cần làm lại.
4. Vào tab **Actions** → **Đẩy app mới lên Apps Script thử** → **Run workflow**. Đợi dấu tích xanh, tải lại trang Apps Script sẽ thấy đủ các file.

## 3. Triển khai và cài đặt lần đầu

1. Trong Apps Script của dự án mới: **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**. **Thực thi với tư cách**: Tôi. **Người có quyền truy cập**: Bất kỳ ai. Bấm **Triển khai**, cho phép các quyền Google hỏi.
2. Vào **Triển khai → Quản lý các lần triển khai**, sao chép **Mã triển khai**, tạo secret `NEW_DEPLOYMENT_ID`. Từ đó mỗi lần gộp thay đổi của app mới, app mới tự cập nhật.
3. Mở **URL ứng dụng web**. Lần đầu app hiện trang cài đặt: bấm **Gửi mã** nếu được hỏi, lấy mã 6 số trong hộp thư CLB, rồi điền thông tin BOD đầu tiên và mật khẩu chung. App tạo file dữ liệu `[ECO] Dữ liệu app`, lịch chạy mỗi đêm và lịch làm mới tab xem.
4. Đăng nhập, vào **Cài đặt → Tài khoản và phân quyền → Tải danh sách thành viên**, tải sheet danh sách thành viên như thường lệ.

## 4. Thử

Mở app mới trên máy tính và điện thoại, thử các việc hay dùng: giao và chấm task, tạo buổi log và điểm danh, cộng điểm, góp ý, soạn và duyệt thư, thông báo Zalo. Việc nào chạy sai thì nhắn Claude trong dự án.

## 5. Chuyển hẳn

Khi đã ổn, nhắn Claude "chuyển hẳn". Claude sẽ mở một PR dọn sạch app cũ: xoá `src/` cũ, chuyển code mới vào `src/`, bỏ thư mục `v2/` và workflow thử, sửa README, hướng dẫn và trang vỏ sang link app mới. Trước khi gộp PR đó, sửa secret `SCRIPT_ID` và `DEPLOYMENT_ID` thành giá trị của dự án mới (lấy từ `NEW_SCRIPT_ID`, `NEW_DEPLOYMENT_ID`) rồi xoá hai secret `NEW_...`. Dự án Apps Script cũ có thể xoá sau khi mọi người đã dùng app mới.
