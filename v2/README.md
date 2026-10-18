# App CLB ECO bản mới (v2)

App mới viết lại theo wireframe Van duyệt ngày 18/10/2026. App cũ ở `src/` vẫn chạy thật cho tới khi bản này xong, nên mọi thay đổi của app mới chỉ nằm trong `v2/`.

- `v2/src/main.gs`: trang web (`doGet`): chưa cài thì mở trang cài đặt lần đầu, cài rồi thì mở app.
- `v2/src/index.html`: trang vỏ: thanh bên, thanh trên điện thoại, chỗ cho menu avatar và pop-up Cài đặt.
- `v2/src/styles.html`: màu, chữ, bố cục theo design system. Vùng nội dung rộng tối đa 1040 px ở mọi trang.
- `v2/src/shell.html`: màn đăng nhập, ba bước của lần đăng nhập đầu, menu theo vai trò và nhãn, chuyển trang, menu 3 gạch, menu avatar, pop-up Cài đặt, đổi mật khẩu, giao diện sáng/tối.
- `v2/src/schema.gs`: 29 tab dữ liệu với tên cột, kiểu cột, khoá, cách cấp mã, giá trị cố định; đúng như doc "Sheet dữ liệu app ECO". Sửa doc thì sửa file này cho khớp.
- `v2/src/records.gs`: đổi dòng sheet thành bản ghi và ngược lại, cấp mã (T-2627-0042...), kiểm tra trước khi ghi, so trước sau để ghi Nhật ký. Không gọi gì của Google nên chạy thử được bằng Node.
- `v2/src/db.gs`: mở file dữ liệu, tự tạo tab và cột còn thiếu, đọc ghi theo tên tab và tên cột, khoá ghi, Nhật ký, Cài đặt.
- `v2/src/access.gs`: quy tắc đăng nhập và quyền (ai được vào, BOD hay thành viên, nhãn nào còn hạn, nhiệm kỳ của một ngày). Chạy thử được bằng Node.
- `v2/src/auth.gs`: đăng nhập bằng email và mật khẩu hoặc Google, phiên ghi nhớ 60 ngày, đổi mật khẩu, lưu giao diện, đồng ý dùng dữ liệu.
- `v2/src/setup.gs`, `v2/src/setup.html`: trang cài đặt lần đầu.
- `v2/src/stats.gs`: cách tính dùng chung (nhiệm kỳ và giai đoạn hiện tại, kết quả task, KPI task, KPI log, điểm, hạng). Không gọi gì của Google nên chạy thử được bằng Node.
- `v2/src/home.gs`, `v2/src/home.html`: trang chủ BOD và thành viên.
- `v2/src/tasks.gs`, `v2/src/taskboard.html`: task. Thành viên bấm Đã xong hoặc Huỷ xác nhận; BOD và NS phụ trách ban nhập task, sửa hạn, huỷ task, xác nhận thay, bấm Nộp đúng hạn; BOD chấm.

Tên file, hàm, biến dùng tiếng Anh; chữ hiện cho người dùng dùng tiếng Việt có dấu.

## Tầng dữ liệu

- Đọc: `readTable_('tasks')`, `findRecord_('tasks', 'T-2627-0042')`.
- Thêm: `insertRecords_('tasks', [{ name: 'Poster', ... }], { termId: '2627' })`. Cột khoá để trống thì app tự cấp mã.
- Sửa: `updateRecord_('tasks', 'T-2627-0042', { deadline: ngayMoi }, { actorId, action: 'change_deadline' })`. Có `action` thì mỗi cột đổi ghi một dòng Nhật ký.
- Đọc rồi ghi mà không ai chen vào giữa: bọc trong `withLock_(function () { ... })`.
- Cài đặt: `getSetting_`, `getNumberSetting_`, `setSetting_` (sửa trong app thì ghi Nhật ký).
- Tạo file dữ liệu: trang cài đặt lần đầu làm việc này (xem dưới). App tạo file "[ECO] Dữ liệu app", đủ 29 tab, tô màu theo nhóm, khoá mọi tab trừ Cài đặt, thêm sẵn các ban và mức quy chế. Bản cập nhật sau có thêm cột thì app tự thêm, không cần chạy lại. Hàm `setupDataFile` vẫn chạy tay được trong trình sửa Apps Script.

## Đăng nhập

- Ai cũng đăng nhập bằng email đã ghi trong tab Thành viên. Tài khoản chưa đổi mật khẩu thì dùng mật khẩu chung của CLB; đổi rồi thì dùng mật khẩu riêng. Mật khẩu chỉ lưu bản băm (giống app cũ, nên chuyển tài khoản cũ sang vẫn đúng).
- Mật khẩu chung và các phiên đăng nhập nằm trong Thuộc tính dự án của Apps Script, không nằm trong file dữ liệu.
- Được vào khi dòng nhiệm kỳ mới nhất của người đó là Đang ở CLB. BOD là người có ban BOD ở nhiệm kỳ mới nhất; các việc của ban nhân sự đi theo nhãn (NS phụ trách ban, seeding, sinh nhật).
- Đăng nhập bằng Google chỉ hiện khi mở app qua trang vỏ (`pwa/`) và đã điền `google_client_id` trong tab Cài đặt.
- Lần đăng nhập đầu (cột Lần đăng nhập cuối còn trống) hiện ba bước: đồng ý dùng dữ liệu (không bắt buộc), hướng dẫn cài app theo máy, tour.
- Hàm cần đăng nhập nhận mã phiên làm tham số đầu và gọi `requireUser_(token)` (hoặc `requireUser_(token, 'bod')`). Phiên hết hạn thì báo `SESSION_EXPIRED`, trang web tự về màn đăng nhập.

## Trang chủ

- BOD thấy số task, mail chờ xử lý, góp ý chưa đọc, danh sách cần làm hôm nay và gợi ý bước tiếp theo theo giai đoạn.
- Thành viên thấy điểm và hạng trong giai đoạn (cả CLB, BOD không xếp hạng), KPI task, KPI log và số buổi cần thêm. Giai đoạn giao thoa không có điểm và KPI.
- KPI task chỉ tính task đã chấm hoặc Không làm. KPI log của sự kiện chưa chốt dùng chỉ tiêu ban đầu.
- Task hiện Sắp đến hạn khi còn `due_soon_days` ngày (tab Cài đặt, mặc định 2).
- `v2/src/points.gs`, `v2/src/points.html`: trang Cộng điểm và Thang điểm (chỉ BOD).
- `v2/src/log.gs`, `v2/src/log.html`: Kế hoạch năm (sự kiện) và trang Quản lý log: buổi log, chỉ tiêu, điểm danh, chốt và mở chốt.

## Task

- BOD vào trang Quản lý task, thấy task mọi ban. NS phụ trách ban vào trang Ban phụ trách, chỉ thấy và nhập task của ban mình. Chỉ BOD chấm.
- Người được giao phải đang ở CLB và ở đúng ban của task. Task tạo trong giai đoạn giao thoa không tính KPI (cột Được tính là Không).
- Sửa hạn, chấm, xác nhận thay, Nộp đúng hạn, huỷ task, bỏ người khỏi task đều ghi Nhật ký; khung chi tiết task hiện lại thành câu dễ đọc.
- BOD xác nhận thay thì app mở ngay phần chấm. Bỏ một người khỏi task chỉ được khi người đó chưa xác nhận.

## Cộng điểm

- File dữ liệu mới có sẵn thang điểm theo quy chế (tab Hoạt động). React, comment, góp ý và log vượt do app tự cộng; mã của chúng nằm ở Cài đặt (`react_activity_id`...), trang Cộng điểm không cho chọn tay.
- BOD chọn hoạt động, tick người (không có BOD), gắn sự kiện nếu muốn. Mỗi người một dòng Cộng điểm, mức điểm chép từ thang điểm lúc cộng. Giai đoạn giao thoa không cộng được.
- Cộng nhầm thì huỷ cả lần hoặc từng người; dòng vẫn còn, đánh dấu Đã huỷ, ghi Nhật ký. Hoạt động chỉ có một lần thì chọn Hoạt động khác.

## Log

- BOD tạo sự kiện ở Cài đặt, Kế hoạch năm (hoặc nút Kế hoạch năm trong Quản lý log). Mọi task và buổi log thuộc một sự kiện.
- Trong Quản lý log: tạo buổi (90 hoặc 180 phút), đặt chỉ tiêu theo ban, khối, từng người (người thắng khối, khối thắng ban), rồi mỗi buổi chọn Diễn ra (tick người có mặt), Huỷ: hết việc, hoặc Huỷ: lý do khác (tick người đã đăng ký, tính như có mặt). Lưu lại nhiều lần được.
- Chốt khi mọi buổi đã có kết quả và mọi task của sự kiện đã có kết quả. App ghi Kết quả log (giao cuối = thực diễn ra × giao ban đầu ÷ dự kiến) và cộng +20 mỗi buổi vượt. Mở chốt thì huỷ điểm log vượt, chốt lại tính lại.
- Sheet đăng ký log (tạo từ file mẫu, đọc lại khi điểm danh) làm ở PR sau.

Kiểm tra: `npm test` chạy cả test app cũ và test trong `v2/tests` (giả lập Google Sheets, không cần mạng).

Xem thử: tạo một dự án Apps Script riêng (không dùng dự án của app cũ), chép các file trong `v2/src/` vào, triển khai ứng dụng web rồi mở link. Lần đầu sẽ ra trang cài đặt: nhập thông tin BOD đầu tiên và mật khẩu chung của CLB. Nếu trang đòi mã thì bấm Gửi mã và xem hộp thư của tài khoản đã triển khai.
