# Cài app CLB ECO lên điện thoại và bật đăng nhập Google

App CLB ECO chạy trên Google Apps Script. Để cài được lên màn hình chính điện thoại như một app thật, và để đăng nhập được bằng Google, cần một "trang vỏ" nhỏ (thư mục `pwa/`) đặt trên GitHub Pages. Trang vỏ chỉ là khung hiển thị app, không chứa dữ liệu hay mật khẩu nào.

## 1. Bật GitHub Pages (làm một lần)

1. Kho `ecotrandainghia/internal` để **công khai** (gói GitHub miễn phí chỉ đăng trang từ kho công khai). Trong kho chỉ có mã, không có dữ liệu thành viên hay mật khẩu (dữ liệu nằm trong Google Drive của CLB, mã đăng nhập nằm trong Secrets).
2. Vào **Settings → Pages**, mục **Build and deployment → Source** chọn **GitHub Actions**.
3. Từ đó mỗi lần gộp thay đổi trong `pwa/` vào `main`, GitHub tự đăng trang vỏ (workflow `dang-trang-vo.yml`). Không ai phải chép tay.
4. Trong `pwa/config.js`, `webAppUrl` là link ứng dụng web (dạng `https://script.google.com/macros/s/…/exec`). Link này giữ nguyên mỗi lần cập nhật mã, chỉ đổi khi tạo lần triển khai mới hoặc dự án Apps Script khác.

Link cho mọi người:

- App CLB ECO: `https://ecotrandainghia.github.io/internal/`
- Trang gốc `https://ecotrandainghia.github.io/` là website công khai của CLB, nằm ở kho riêng `ecotrandainghia.github.io`.

## 2. Cài lên điện thoại

- **iPhone:** mở link bằng Safari → nút Chia sẻ → **Thêm vào MH chính**.
- **Android:** mở link bằng Chrome → menu ⋮ → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**).
- **Máy tính:** mở link bằng Chrome hoặc Edge → biểu tượng cài đặt ở thanh địa chỉ.

## 3. Bật đăng nhập bằng Google (làm một lần)

Đăng nhập bằng email và mật khẩu luôn dùng được. Đăng nhập bằng Google là thêm cho tiện.

1. Đăng nhập tài khoản Google của CLB, mở https://console.cloud.google.com
2. Tạo dự án mới, đặt tên `ECO`.
3. Vào **APIs & Services → OAuth consent screen** (Màn hình xin phép OAuth): chọn **External**, điền tên app `CLB ECO`, email hỗ trợ là email CLB, lưu. Ở mục **Publishing status** bấm **Publish app** để mọi tài khoản Google đều đăng nhập được (chỉ dùng thông tin cơ bản là email nên không cần Google xét duyệt).
4. Vào **APIs & Services → Credentials → Create credentials → OAuth client ID**: loại **Web application**, mục **Authorized JavaScript origins** thêm `https://ecotrandainghia.github.io`, bấm **Create**.
5. Chép **Client ID** (kết thúc bằng `.apps.googleusercontent.com`), mở app CLB ECO → **Cài đặt → Tài khoản và phân quyền → Đăng nhập bằng Google**, dán vào và **Lưu**.

Từ đó, khi mở app qua trang vỏ (`ecotrandainghia.github.io/internal/`, hoặc app đã cài), màn hình đăng nhập có thêm nút **Đăng nhập bằng Google**. Email Google phải trùng email tài khoản trong app (email trong danh sách thành viên).

## Khi chuyển trang vỏ sang tài khoản GitHub khác

Địa chỉ trang vỏ đổi theo tài khoản GitHub mới. Cần:

1. Bật lại GitHub Pages như bước 1 ở kho mới, và dán lại link ứng dụng web vào `config.js`.
2. Thêm địa chỉ mới vào **Authorized JavaScript origins** của Client ID (bước 3.4).
3. Gửi link mới cho mọi người và cài lại app trên điện thoại.
