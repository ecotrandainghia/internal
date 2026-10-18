# App CLB ECO bản mới (v2)

App mới viết lại theo wireframe Van duyệt ngày 18/10/2026. App cũ ở `src/` vẫn chạy thật cho tới khi bản này xong, nên mọi thay đổi của app mới chỉ nằm trong `v2/`.

- `v2/src/main.gs`: trang web (`doGet`) và `include`.
- `v2/src/index.html`: trang vỏ: thanh bên, thanh trên điện thoại, chỗ cho menu avatar và pop-up Cài đặt.
- `v2/src/styles.html`: màu, chữ, bố cục theo design system. Vùng nội dung rộng tối đa 1040 px ở mọi trang.
- `v2/src/shell.html`: menu theo vai trò, chuyển trang, menu 3 gạch, menu avatar, pop-up Cài đặt, giao diện sáng/tối.
- `v2/src/schema.gs`: 29 tab dữ liệu với tên cột, kiểu cột, khoá, cách cấp mã, giá trị cố định; đúng như doc "Sheet dữ liệu app ECO". Sửa doc thì sửa file này cho khớp.
- `v2/src/records.gs`: đổi dòng sheet thành bản ghi và ngược lại, cấp mã (T-2627-0042...), kiểm tra trước khi ghi, so trước sau để ghi Nhật ký. Không gọi gì của Google nên chạy thử được bằng Node.
- `v2/src/db.gs`: mở file dữ liệu, tự tạo tab và cột còn thiếu, đọc ghi theo tên tab và tên cột, khoá ghi, Nhật ký, Cài đặt.

Tên file, hàm, biến dùng tiếng Anh; chữ hiện cho người dùng dùng tiếng Việt có dấu.

## Tầng dữ liệu

- Đọc: `readTable_('tasks')`, `findRecord_('tasks', 'T-2627-0042')`.
- Thêm: `insertRecords_('tasks', [{ name: 'Poster', ... }], { termId: '2627' })`. Cột khoá để trống thì app tự cấp mã.
- Sửa: `updateRecord_('tasks', 'T-2627-0042', { deadline: ngayMoi }, { actorId, action: 'change_deadline' })`. Có `action` thì mỗi cột đổi ghi một dòng Nhật ký.
- Đọc rồi ghi mà không ai chen vào giữa: bọc trong `withLock_(function () { ... })`.
- Cài đặt: `getSetting_`, `getNumberSetting_`, `setSetting_` (sửa trong app thì ghi Nhật ký).
- Tạo file dữ liệu: trong trình sửa Apps Script chọn hàm `setupDataFile` rồi bấm Chạy một lần. App tạo file "[ECO] Dữ liệu app", đủ 29 tab, tô màu theo nhóm, khoá mọi tab trừ Cài đặt, thêm sẵn các ban và mức quy chế. Bản cập nhật sau có thêm cột thì app tự thêm, không cần chạy lại.

Kiểm tra: `npm test` chạy cả test app cũ và test trong `v2/tests` (giả lập Google Sheets, không cần mạng).

Xem thử: tạo một dự án Apps Script riêng (không dùng dự án của app cũ), chép các file trong `v2/src/` vào, triển khai ứng dụng web rồi mở link kèm `?role=BOD`, `?role=TV` hoặc `?role=HR`. Đăng nhập thật làm ở bước 3.
