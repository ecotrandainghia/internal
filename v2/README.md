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
- `v2/src/feedback.gs`, `v2/src/feedback.html`: trang Góp ý (thành viên gửi, BOD đọc và đánh dấu áp dụng).
- `v2/src/signup.gs`: sheet đăng ký log của từng sự kiện: tạo, dán link, đọc người đăng ký khi điểm danh.

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

## Sheet đăng ký log

- Mỗi sự kiện một Google Sheet để thành viên tích buổi mình đi được. Link lưu ở Cài đặt, dòng `log_signup_<mã sự kiện>`.
- Nút Sheet đăng ký trong Quản lý log: tạo sheet mới hoặc dán link sheet có sẵn. Sheet mới có tên thành viên (không có BOD, không có số điện thoại) xếp theo ban, mỗi buổi một cột ô tích, dòng đếm số người đăng ký và tab Kế hoạch (thời gian, địa điểm, mục tiêu, trạng thái từng buổi). Ai có link đều tích được; tên, ban và tiêu đề khoá dạng cảnh báo.
- Có file mẫu (`log_template_url`, mẫu của tool cũ có tab Đăng ký log) thì app chép mẫu rồi điền như tool cũ. Sheet lưu vào thư mục `log_folder_url`, để trống là thư mục [ECO] Đăng ký log. Sửa ở Cài đặt, Hoạt động CLB, File mẫu log.
- Khi mở một buổi để điểm danh, app đọc cột trùng tên buổi (không phân biệt dấu, hoa thường) và tick sẵn người đã đăng ký; tên trong sheet không khớp thành viên nào thì app liệt kê ra. Buổi tạo sau khi đã có sheet thì bấm Thêm cột vào sheet.

## Góp ý

- Thành viên gửi góp ý có tên hoặc ẩn danh (mặc định ẩn danh). Ẩn danh thì không lưu mã người gửi và chỉ ghi ngày, không ghi giờ. BOD không gửi góp ý.
- Một BOD mở trang Góp ý là các góp ý chưa đọc chuyển sang đã đọc; lần xem đó vẫn hiện chữ Mới.
- BOD đánh dấu góp ý có tên là đã áp dụng thì người gửi được cộng điểm (hoạt động `feedback_activity_id`, +10), tối đa 2 lần mỗi giai đoạn; giai đoạn giao thoa không đánh dấu được. Bấm nhầm thì Bỏ đánh dấu, dòng điểm bị huỷ. Mọi lần đánh dấu ghi Nhật ký.

## Hộp thư

- Người có nhãn UCV có trang Hộp thư: đọc Gmail của CLB theo thư mục và nhãn, tìm thư, tải tệp đính kèm. UCV soạn thư mới, trả lời, trả lời tất cả, chuyển tiếp, hoặc xin lưu trữ, về hộp thư đến, gắn hay bỏ nhãn, xoá, báo thư rác. Mọi việc đều thành yêu cầu ở tab Yêu cầu mail và chỉ chạy khi BOD duyệt.
- Khung soạn thư: ô người nhận gợi ý từ danh bạ (thành viên CLB theo ban và tab Danh bạ), lấy email từ một Google Sheet, chữ đậm, nghiêng, danh sách, liên kết, chèn hoặc dán ảnh (tối đa 2 MB mỗi ảnh), tệp từ máy (10 MB mỗi tệp, 20 MB tổng) hoặc từ Drive. Tự lưu nháp mỗi 20 giây. Tệp và ảnh lưu vào thư mục Drive "ECO - Đính kèm mail"; ảnh trong thư ghi là `drive:<mã>` và được nhúng vào thư khi gửi.
- Trang Hộp thư của BOD, tab Duyệt thư: yêu cầu chờ duyệt lên đầu. BOD xem thư, thư gốc, rồi Duyệt và gửi, Trả lại UCV sửa hoặc Từ chối (hai cách sau phải ghi chú). BOD tự sửa người nhận, tiêu đề, nội dung rồi duyệt được; chỗ sửa ghi Nhật ký và UCV thấy chữ "BOD đã sửa". Gmail báo lỗi thì yêu cầu chuyển sang Lỗi kèm lý do.
- Chữ ký lấy từ Gmail của CLB, bật tắt ở Cài đặt, Hộp thư, Chữ ký (dòng `mail_signature`). Cần bật dịch vụ nâng cao Gmail trong `appsscript.json`, Google sẽ hỏi quyền Gmail ở lần triển khai tới.

## Gửi hàng loạt, hẹn giờ, danh bạ

- BOD soạn thư nháp trong Gmail của CLB, để chỗ điền như `{Tên}` hoặc `{{Họ và tên}}`. Tab Thư nháp liệt kê 60 thư nháp mới sửa nhất, có link soạn và sửa trong Gmail; thư nháp đã ghi người nhận thì hẹn giờ gửi nguyên thư được.
- Tab Gửi hàng loạt: chọn thư nháp, chọn người nhận từ Thành viên CLB (chỗ điền Họ và tên, Tên, Ban, Lớp, Chức vụ, Email, Ngày sinh), Danh bạ (Tên, Email, Nhóm, Ghi chú), Google Sheet (mỗi cột một chỗ điền, tối đa 2000 dòng) hoặc nhập tay (không có chỗ điền). Bấm Kiểm tra: chỗ điền không có trong nguồn thì chặn, người nhận trống ô thì cảnh báo; xem trước thư của người đầu tiên. Ảnh chèn và tệp đính kèm của thư nháp được gửi kèm.
- Hạn mức: app hiện số người Gmail còn gửi được hôm nay (khoảng 100). Vượt thì chặn, trừ khi chọn Chia đợt: gửi phần còn được, phần sau tự gửi lúc 7 giờ sáng các ngày kế tiếp (hẹn giờ thì cùng giờ các ngày sau), mỗi đợt một dòng ở Lịch gửi. Đến giờ mà hết hạn mức thì đợt đó tự dời sang 7 giờ sáng hôm sau.
- Thư hẹn giờ: đến giờ app mới đọc thư nháp, nên sửa trong Gmail trước giờ gửi vẫn kịp. Việc tự chạy `runScheduledSends` mỗi 10 phút, app tự cài khi có thư hẹn đầu tiên. Tab Lịch gửi: thư chờ gửi (kể cả từ nhiệm kỳ trước) để đổi giờ hoặc huỷ, và kết quả các lần gửi (ví dụ "Đã gửi 38/40 thư").
- Danh bạ ở Cài đặt, Hộp thư, Danh bạ: thêm, sửa, xoá liên hệ theo nhóm. Thành viên CLB có sẵn, không cần thêm.

Kiểm tra: `npm test` chạy cả test app cũ và test trong `v2/tests` (giả lập Google Sheets, không cần mạng).

Xem thử: tạo một dự án Apps Script riêng (không dùng dự án của app cũ), chép các file trong `v2/src/` vào, triển khai ứng dụng web rồi mở link. Lần đầu sẽ ra trang cài đặt: nhập thông tin BOD đầu tiên và mật khẩu chung của CLB. Nếu trang đòi mã thì bấm Gửi mã và xem hộp thư của tài khoản đã triển khai.
