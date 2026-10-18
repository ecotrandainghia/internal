# App CLB ECO bản mới (v2)

App mới viết lại theo wireframe Van duyệt ngày 18/10/2026. App cũ ở `src/` vẫn chạy thật cho tới khi bản này xong, nên mọi thay đổi của app mới chỉ nằm trong `v2/`.

- `v2/src/main.gs`: trang web (`doGet`) và `include`.
- `v2/src/index.html`: trang vỏ: thanh bên, thanh trên điện thoại, chỗ cho menu avatar và pop-up Cài đặt.
- `v2/src/styles.html`: màu, chữ, bố cục theo design system. Vùng nội dung rộng tối đa 1040 px ở mọi trang.
- `v2/src/shell.html`: menu theo vai trò, chuyển trang, menu 3 gạch, menu avatar, pop-up Cài đặt, giao diện sáng/tối.

Tên file, hàm, biến dùng tiếng Anh; chữ hiện cho người dùng dùng tiếng Việt có dấu.

Xem thử: tạo một dự án Apps Script riêng (không dùng dự án của app cũ), chép các file trong `v2/src/` vào, triển khai ứng dụng web rồi mở link kèm `?role=BOD`, `?role=TV` hoặc `?role=HR`. Đăng nhập thật làm ở bước 3.
