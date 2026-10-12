# Hệ thống quản lý CLB: app eco

Mã nguồn của app eco (trước đây là hai app ECOBoard và ECODesk), chạy trên Google Apps Script, dữ liệu lưu trong Google Sheet của tài khoản CLB.

- Mở app không cần đăng nhập thì chỉ xem được bảng xếp hạng điểm.
- Mọi thành viên có email trong danh sách đều đăng nhập được (mật khẩu chung của CLB, mật khẩu riêng, hoặc Google). Quyền theo bậc thang: thành viên < HR < UCV < BOD, người bậc trên có cả chức năng của bậc dưới.
- Thành viên: trang chủ (điểm của mình, link ghim, quy chế), xếp hạng và lịch sử điểm của mình, góp ý ẩn danh, cài đặt. HR thêm task; UCV thêm mail; BOD thêm cộng điểm, duyệt mail, báo cáo, file log, đọc góp ý, cài đặt chung.
- Cài được lên điện thoại như app nhờ trang vỏ trong `pwa/` (địa chỉ ecotdn.github.io/home).

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/yeu-cau.md](docs/yeu-cau.md) | Yêu cầu đã chốt với CLB |
| [docs/huong-dan-cai-dat.md](docs/huong-dan-cai-dat.md) | Cài đặt lên tài khoản Google của CLB, từng bước |
| [docs/huong-dan-cai-app.md](docs/huong-dan-cai-app.md) | Cài app lên điện thoại, bật đăng nhập Google |
| [docs/kien-truc.md](docs/kien-truc.md) | Cách hệ thống được tổ chức, các tab dữ liệu |

## Cấu trúc thư mục

```
src/            Mã chạy trên Google Apps Script (chép nguyên vào trình soạn Apps Script)
  Code.gs       Máy chủ: trang web, menu hậu kỳ, đọc ghi dữ liệu
  Logic.gs      Các hàm tính toán thuần (có kiểm thử)
  HauKy.html    Hộp thoại tải danh sách trong Google Sheet
  MayChuDesk.gs Máy chủ app eco: đăng nhập, phân quyền, cộng điểm, task, góp ý, cài đặt
  Zalo.gs       Nhắc việc qua bot Zalo
  ThongBao.gs   Gửi thông báo theo cách mỗi người chọn: Zalo, app trên điện thoại (Web Push), mail
  Mail.gs       Mail: hộp thư UCV, BOD duyệt, thư mẫu, gửi hàng loạt, hẹn giờ
  BaoCao.gs     Báo cáo, xuất Excel và tạo file đăng ký log
  Eco.html      Khung giao diện app eco (gồm các file Desk*.html, EcoXepHang.html)
  appsscript.json  Cấu hình dự án Apps Script
pwa/            Trang vỏ trên GitHub Pages để cài app và đăng nhập Google
tests/          Kiểm thử tự động cho Logic.gs (chạy: npm test)
docs/           Tài liệu
```
