# App CLB ECO

App quản lý CLB ECO, chạy trên Google Apps Script, viết theo wireframe Van duyệt ngày 18/10/2026. Mọi người mở app ở `https://ecotrandainghia.github.io/internal/`.

## Thư mục

- `src/`: mã app (file `.gs` chạy trên máy chủ Google, file `.html` là giao diện). Mỗi lần gộp vào `main`, GitHub tự đẩy thư mục này lên Apps Script.
- `tests/`: kiểm thử chạy bằng Node, giả lập Google Sheets, không cần mạng.
- `pwa/`: trang vỏ trên GitHub Pages để cài app lên điện thoại và đăng nhập bằng Google.
- `docs/`: tài liệu.
- `.github/workflows/`: việc GitHub tự chạy (kiểm thử, đẩy mã lên Apps Script, đăng trang vỏ).

## Tài liệu

| File | Nội dung |
| --- | --- |
| `docs/yeu-cau.md` | Yêu cầu của app |
| `docs/huong-dan-cai-dat.md` | Cài app lên tài khoản Google của CLB, chuyển từ app trước |
| `docs/huong-dan-cai-app.md` | Trang vỏ, cài lên điện thoại, đăng nhập bằng Google |

## Các file mã

- `src/main.gs`: trang web (`doGet`): chưa cài thì mở trang cài đặt lần đầu, cài rồi thì mở app.
- `src/index.html`: trang vỏ: thanh bên, thanh trên điện thoại, chỗ cho menu avatar và pop-up Cài đặt.
- `src/styles.html`: màu, chữ, bố cục theo design system. Vùng nội dung rộng tối đa 1040 px ở mọi trang.
- `src/shell.html`: màn đăng nhập, ba bước của lần đăng nhập đầu, menu theo vai trò và nhãn, chuyển trang, menu 3 gạch, menu avatar, pop-up Cài đặt, đổi mật khẩu, giao diện sáng/tối.
- `src/schema.gs`: 29 tab dữ liệu với tên cột, kiểu cột, khoá, cách cấp mã, giá trị cố định; đúng như doc "Sheet dữ liệu app ECO". Sửa doc thì sửa file này cho khớp.
- `src/records.gs`: đổi dòng sheet thành bản ghi và ngược lại, cấp mã (T-2627-0042...), kiểm tra trước khi ghi, so trước sau để ghi Nhật ký. Không gọi gì của Google nên chạy thử được bằng Node.
- `src/db.gs`: mở file dữ liệu, tự tạo tab và cột còn thiếu, đọc ghi theo tên tab và tên cột, khoá ghi, Nhật ký, Cài đặt.
- `src/access.gs`: quy tắc đăng nhập và quyền (ai được vào, BOD hay thành viên, nhãn nào còn hạn, nhiệm kỳ của một ngày). Chạy thử được bằng Node.
- `src/auth.gs`: đăng nhập bằng email và mật khẩu hoặc Google, phiên ghi nhớ 60 ngày, đổi mật khẩu, lưu giao diện, đồng ý dùng dữ liệu.
- `src/setup.gs`, `src/setup_view.html`: trang cài đặt lần đầu.
- `src/stats.gs`: cách tính dùng chung (nhiệm kỳ và giai đoạn hiện tại, kết quả task, KPI task, KPI log, điểm, hạng). Không gọi gì của Google nên chạy thử được bằng Node.
- `src/home.gs`, `src/home_view.html`: trang chủ BOD và thành viên.
- `src/tasks.gs`, `src/taskboard.html`: task. Thành viên bấm Đã xong hoặc Huỷ xác nhận; BOD và NS phụ trách ban nhập task, sửa hạn, huỷ task, xác nhận thay, bấm Nộp đúng hạn; BOD chấm.

Tên file, hàm, biến dùng tiếng Anh; chữ hiện cho người dùng dùng tiếng Việt có dấu.

## Tầng dữ liệu

- Đọc: `readTable_('tasks')`, `findRecord_('tasks', 'T-2627-0042')`.
- Thêm: `insertRecords_('tasks', [{ name: 'Poster', ... }], { termId: '2627' })`. Cột khoá để trống thì app tự cấp mã.
- Sửa: `updateRecord_('tasks', 'T-2627-0042', { deadline: ngayMoi }, { actorId, action: 'change_deadline' })`. Có `action` thì mỗi cột đổi ghi một dòng Nhật ký.
- Đọc rồi ghi mà không ai chen vào giữa: bọc trong `withLock_(function () { ... })`.
- Cài đặt: `getSetting_`, `getNumberSetting_`, `setSetting_` (sửa trong app thì ghi Nhật ký).
- Tạo file dữ liệu: trang cài đặt lần đầu làm việc này (xem dưới). App tạo file "[ECO] Dữ liệu app", đủ 29 tab, tô màu theo nhóm, khoá mọi tab trừ Cài đặt, thêm sẵn các ban và mức quy chế. Bản cập nhật sau có thêm cột thì app tự thêm, không cần chạy lại. Hàm `setupDataFile` vẫn chạy tay được trong trình sửa Apps Script.

## Đăng nhập

- Ai cũng đăng nhập bằng email đã ghi trong tab Thành viên. Tài khoản chưa đổi mật khẩu thì dùng mật khẩu chung của CLB; đổi rồi thì dùng mật khẩu riêng. Mật khẩu chỉ lưu bản băm.
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
- `src/points.gs`, `src/points_view.html`: trang Cộng điểm và Thang điểm (chỉ BOD).
- `src/log.gs`, `src/log_view.html`: Kế hoạch năm (sự kiện) và trang Quản lý log: buổi log, chỉ tiêu, điểm danh, chốt và mở chốt.
- `src/feedback.gs`, `src/feedback_view.html`: trang Góp ý (thành viên gửi, BOD đọc và đánh dấu áp dụng).
- `src/signup.gs`: sheet đăng ký log của từng sự kiện: tạo, dán link, đọc người đăng ký khi điểm danh.

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

## Thành viên, KPI, xếp hạng, tổng kết

- KPI của tôi: KPI task (đạt ÷ (đạt + chưa đạt), task chưa xong hoặc chờ chấm chưa tính) và KPI log (đã đi ÷ giao, đơn vị buổi 90 phút), kèm từng task, từng sự kiện và dự báo "cần thêm 2 buổi log" hoặc "thêm 1 task đạt". Thành viên chính thức tính cả nhiệm kỳ, bổ sung tính từ GD2; BOD không tính KPI.
- Điểm và xếp hạng: bảng của GD1 (chỉ thành viên chính thức) và GD2 (tất cả), lọc theo ban, đánh dấu top 15% (làm tròn thông thường, bằng điểm người cuối cũng vào, 0 điểm không vào) và lịch sử cộng điểm của chính mình.
- Trang Thành viên (BOD): bảng tổng hợp Bảng điểm, KPI task, KPI log, lọc theo ban, khối, chính thức hay bổ sung, sự kiện; bấm một dòng để xem từng task, từng sự kiện, lịch sử điểm.
- Tab Tổng kết: khen thưởng top GD1, GD2, cả nhiệm kỳ (tổng GD1 + GD2, chỉ chính thức) và certificate (cấp vì đạt KPI, cấp nhờ bù trừ, chưa cấp). Danh sách được cấp có nút copy Họ tên, Ngày sinh (dd/mm/yyyy), SĐT và Ngày sinh + SĐT để dán vào sheet Đoàn.
- Chụp kết quả và khoá: `snapshotRound_('round_1')` ghi dòng GD1 vào tab Kết quả giai đoạn, `snapshotRound_('round_2')` ghi dòng GD2 và Cả nhiệm kỳ (bước tải sheet đợt 2 và nút Kết thúc nhiệm kỳ ở bước 9 sẽ gọi). Trước lúc chụp, tab Tổng kết hiện kết quả tạm tính. Sau khi chụp, app chặn mở chốt sự kiện, sửa hoặc chấm task, xác nhận task, huỷ điểm thuộc giai đoạn đó. Task thuộc giai đoạn chứa hạn chót; sự kiện thuộc giai đoạn chứa lúc chốt.

## Thông báo (Zalo và app trên điện thoại)

- Mỗi người chọn nhận tin qua Zalo, qua app trên điện thoại hoặc cả hai (cột `notify_zalo`, `notify_app` ở tab Tài khoản, phải giữ ít nhất một). Mọi tin đi theo lựa chọn này; đường này lỗi thì đường kia vẫn gửi. Mỗi tin gửi một người là một dòng ở tab Thông báo, kể cả người chưa cài xong đường nào, để ai cũng xem lại được ở trang Thông báo (menu avatar, hoặc Cài đặt, Thông báo của tôi). Dòng cũ hơn `notify_keep_days` ngày (mặc định 30) bị xoá khi lịch nhắc hằng ngày chạy.
- Zalo: BOD dán mã bot ở Cài đặt, Thông báo của CLB, Bot Zalo. Mã bot cất trong thuộc tính dự án `ZALO_BOT_TOKEN`, không ghi vào sheet; tên bot ghi ở Cài đặt `zalo_bot_name`. Mỗi tài khoản có một mã kết nối 6 ký tự ở tab Kết nối Zalo; nhắn mã cho bot rồi bấm Kiểm tra kết nối là xong. Đổi bot thì mọi người kết nối lại.
- App trên điện thoại: bấm Bật trên máy này trong app đã thêm vào màn hình chính. Trang vỏ (`pwa/`) đăng ký nhận tin rồi gửi địa chỉ máy về, app ghi vào tab Thiết bị và bật luôn đường app. Tin đẩy được mã hoá theo chuẩn Web Push (`webpush.gs`, khoá VAPID tự tạo, cất trong thuộc tính `VAPID_PRIVATE_KEY`). Máy tắt thông báo thì lần gửi sau bị từ chối và app tự gỡ máy đó. Máy bật từ bản cũ (không có khoá mã hoá) hỏi nội dung qua `?tb=<mã máy>`.
- Báo BOD: góp ý mới, thư UCV chờ duyệt (mặc định bật), NS seeding ghi nhận một bài (mặc định tắt); bật tắt ở Cài đặt, Thông báo của CLB, Báo cho BOD (dòng `notify_bod_*`). UCV luôn được báo kết quả duyệt thư.
- BOD xem ai nhận qua đường nào, ai đã kết nối Zalo, có máy nào; đổi đường nhận giúp, gỡ kết nối nhầm, gửi thử cho một người hoặc mọi người.

## Ban phụ trách và lịch nhắc hạn task

- NS phụ trách ban (nhãn `dept_lead`, ban nào cũng gán được, kể cả ban Nhân sự) có trang Ban phụ trách với ba tab. Cần nhắc: theo từng ban, task trễ hạn và sắp đến hạn của từng người chưa bấm Đã xong, kèm tên Facebook (bấm được nếu có link) và lớp để nhắn Messenger; không soạn sẵn tin. Task của ban: cùng danh sách ở trang Quản lý task, trong phạm vi các ban mình phụ trách. Log của ban: số buổi đã đi so với số buổi giao của từng người, theo từng sự kiện.
- Lịch nhắc hạn task (Cài đặt, Thông báo của CLB, Lịch nhắc task): mỗi mốc là một ngày so với ngày hạn chót và một giờ, mặc định 20:30 hôm trước, 6:30 ngày hạn, 6:30 hôm sau (dòng `task_remind_times`). Chỉ nhắc người chưa xác nhận xong. Tin gửi NS phụ trách ban của task; task của BOD gửi thẳng BOD đó; ban chưa có NS phụ trách thì gửi thẳng người được giao; ai bật Tự nhắc hạn task thì nhận thêm task của mình.
- Việc tự chạy `runTaskReminders`: mỗi giờ nhắc một lịch chạy hằng ngày, app tự cài (và cài lại khi lịch đổi) lúc BOD mở Thông báo của CLB hoặc ai đó lưu cách nhận tin. Mỗi lần chạy cũng đọc tin mới của bot Zalo và xoá thông báo cũ. Nút Gửi nhắc ngay gửi mọi mốc của hôm nay.

## Seeding

- NS phụ trách seeding (nhãn `seeding_lead`) có trang Seeding; BOD mở từ Cài đặt, Hoạt động CLB, Báo cáo seeding. Thấy bài mới thì dán link và tự chọn lúc nhắc (có nút nhanh Sau 24 giờ, Sau 48 giờ, không có mức mặc định). Việc tự chạy `runSeedingReminders` (mỗi 15 phút, cài lúc đặt nhắc đầu tiên) nhắc người đặt qua Zalo hoặc app khi tới giờ, nhớ đã nhắc tới đâu để không nhắc lại.
- Đến giờ, dán nguyên đoạn copy react và đoạn copy comment. App dò tên Facebook của thành viên (chưa có thì dò họ tên) và tên fanpage, bỏ dấu, không phân biệt hoa thường. Tên dài dò trước nên tên nằm trong tên khác không bị tính nhầm; tên một chữ chỉ khớp khi đứng riêng một dòng. Trùng tên giữa nhiều người hoặc tên chỉ nằm trong tên dài hơn thì hiện ra để người nhập tick.
- Ghi nhận cộng điểm theo hai hoạt động `react_activity_id` (+1) và `comment_activity_id` (+2) trong Thang điểm, mỗi người một lần cho react và một lần cho comment của mỗi bài, dòng Cộng điểm có nguồn Seeding và mã bài. Giai đoạn giao thoa không cộng được. Huỷ ghi nhận (BOD hoặc người đã ghi nhận) gỡ điểm và đưa bài về Chờ dán.
- Đoạn đã dán được chép nguyên văn sang file "[ECO] Bằng chứng seeding <nhiệm kỳ>" trong thư mục Bằng chứng seeding trên Drive, tab phase_1 hoặc phase_2 theo lúc tạo bài, mỗi bài một hàng, ô quá 50.000 ký tự thì nối xuống hàng dưới. Mã file lưu ở Script Property `SEEDING_EVIDENCE_<nhiệm kỳ>`.
- Fanpage (HS-04): mỗi thành viên thêm fanpage của mình ở Cài đặt, Tài khoản của tôi, Fanpage để seeding. Tên fanpage không trùng fanpage khác hay tên Facebook của thành viên khác.

## Sinh nhật

- NS phụ trách sinh nhật (nhãn `birthday_lead`) có trang Sinh nhật: sinh nhật 30 ngày tới và cả năm theo tháng, kèm ban, lớp, link Facebook; liệt kê người thiếu ngày sinh. BOD mở từ Cài đặt, Tài khoản và phân quyền, Lịch sinh nhật, và sửa cách nhắc ở cuối trang.
- Việc tự chạy `runBirthdayReminders` mỗi ngày vào giờ `birthday_remind_time` (mặc định 07:00): nếu có sinh nhật từ hôm nay tới `birthday_remind_days` ngày sau (mặc định 1, 0 là chỉ đúng ngày) thì gửi một tin cho từng NS phụ trách sinh nhật qua Zalo hoặc app; chưa có ai thì gửi BOD. 29/2 năm không nhuận tính là 28/2.
- Lịch Google (`birthday_calendar_id`, để trống là không dùng): app tạo sự kiện cả ngày lặp hằng năm "Sinh nhật Họ tên (Ban)", mô tả lớp và link Facebook, tắt hết nhắc của Calendar. Sự kiện mang thẻ `eco_member` và `eco_key` để app nhận ra; người đổi ngày sinh, tên, ban, lớp, link thì tạo lại, người rời CLB thì xoá, sự kiện khác trong lịch để yên. Đồng bộ khi BOD lưu lịch mới hoặc bấm Đồng bộ lịch ngay (bước 9 gọi thêm lúc tải danh sách thành viên).

## Cài đặt: Quy tắc CLB, link ghim, ảnh đại diện

- Cơ cấu ban: sửa tên ban, các mảng, tắt Đang dùng, thêm ban mới (mã viết hoa, đúng chữ ở cột Ban của sheet). Ban không xoá được; BOD luôn bật. Muốn đổi mã ban thì thêm ban mã mới, tắt ban cũ, rồi tải danh sách Cập nhật với mã mới.
- Khen thưởng và hạn task, Ngưỡng cảnh báo: các số `top_reward_percent`, `offset_top_percent`, `due_soon_days`, `not_done_after_hours`, `kpi_threshold`, `offset_threshold`, có giới hạn hợp lệ; ngưỡng bù trừ không cao hơn ngưỡng KPI. Thang điểm dùng chung hộp ở trang Cộng điểm.
- Link ghim: tối đa 8 link https, mỗi link một dòng `pinned_link_N` ở tab Cài đặt (Ý nghĩa là tên link).
- Mọi lần sửa ghi Nhật ký (`change_setting`).
- Ảnh đại diện: app cắt ảnh thành hình vuông 256 px trên máy, lưu JPEG vào thư mục Ảnh đại diện trên Drive CLB (ai có link xem được), ghi link vào cột `avatar_url`; ảnh cũ vào thùng rác.

## Tải danh sách thành viên, chuyển giai đoạn, kết thúc nhiệm kỳ

- BOD mở từ Cài đặt, Tài khoản và phân quyền, Tải danh sách thành viên (hoặc nút Mở cạnh dòng Bước tiếp ở trang chủ). Chọn loại đợt, dán link Google Sheets (đã chia sẻ cho tài khoản CLB), bấm Xem trước, rồi Tải lên. Link lần tải gần nhất nhớ ở Cài đặt `roster_sheet_url`.
- Sheet cần cột Họ và tên và Ban (mã ban phải có trong Cơ cấu ban và đang dùng); đọc thêm Ngày sinh, Email, Số điện thoại, Tên Facebook, Link Facebook, Mảng, Lớp, Chức vụ nếu có. Ô trống hay thiếu cột thì giữ thông tin cũ.
- Nhận ra người cũ theo Họ và tên (trùng tên thì so ngày sinh). Tên gần giống (bỏ dấu giống nhau, hoặc khác 1 đến 2 chữ) thì hỏi BOD chọn đúng người hay người mới. Người mới được mã `nhiệm kỳ-đợt-số` theo loại đợt (Cập nhật thì theo giai đoạn đang chạy) và tài khoản chưa có mật khẩu riêng.
- Không xoá ai: người đang ở nhiệm kỳ mà không còn trong sheet thì thành Đã rời (mất tài khoản). Tải Oday, đợt 1 thì người của nhiệm kỳ trước không có trong sheet cũng thành Đã rời; riêng lúc Oday, BOD cũ giữ tới đợt 1. Người tải phải còn ở ban BOD trong sheet.
- Loại đợt: Oday (chỉ ở giai đoạn giao thoa), Đợt 1 (mở GD1), Đợt 2 (chặn khi GD1 còn sự kiện chưa chốt, task chưa có kết quả, bài seeding Chờ dán; chụp kết quả GD1 bằng `snapshotRound_('round_1')` rồi mở GD2), Cập nhật (không đổi giai đoạn).
- Mỗi lần tải: chép sheet vào thư mục Bản sao sheet đã tải trên Drive CLB, thêm tab `_undo` ghi trạng thái trước khi tải, ghi một dòng Lần tải sheet và Nhật ký `upload_sheet`, rồi đồng bộ lịch sinh nhật.
- Hoàn tác: chỉ lần tải danh sách thành viên mới nhất, trong 7 ngày, khi người mới chưa có task, điểm danh, điểm hay nhãn. Hoàn tác đợt 2 bỏ ảnh chụp GD1 (`dropRound_`) và GD1 mở lại.
- Kết thúc nhiệm kỳ (chỉ ở GD2, chặn khi GD2 còn việc như trên): chụp GD2 và cả nhiệm kỳ (`snapshotRound_('round_2')`), file bằng chứng seeding của nhiệm kỳ vào thùng rác, mở nhiệm kỳ mới ở giai đoạn giao thoa. Mọi người vẫn vào app tới lần tải Oday.

## Phân quyền nhân sự, đặt lại mật khẩu, đăng nhập Google

- Phân quyền nhân sự: BOD gán NS phụ trách ban (chọn ban, ban nào cũng được, kể cả HR), NS phụ trách seeding, NS phụ trách sinh nhật cho người đang ở CLB trong nhiệm kỳ đang chạy. Mỗi lần gán là một dòng Nhãn và phân công; gỡ thì ghi Đến ngày, không xoá dòng. Sang nhiệm kỳ mới thì gán lại.
- Đặt lại mật khẩu: xoá mật khẩu riêng của một người, người đó đăng nhập bằng mật khẩu chung rồi tự đổi; các máy đang đăng nhập tài khoản đó phải đăng nhập lại. Cùng hộp có chỗ đổi mật khẩu chung (chỉ cất bản băm trong Script Properties).
- Đăng nhập bằng Google: BOD dán Client ID (dòng Cài đặt `google_client_id`, để trống là tắt), có hướng dẫn tạo Client ID một lần trên Google Cloud.
- Mọi thay đổi ghi Nhật ký (`change_setting`), không bao giờ ghi mật khẩu.

## Core team và UCV

- BOD mở từ Cài đặt, Tài khoản và phân quyền, Core team và UCV; chọn sheet Core team (Họ và tên, Email, Cách vào core team) hoặc UCV (Họ và tên, Email; cột Vị trí ứng cử không đọc), dán link, Xem trước rồi Tải lên.
- Mỗi lần là danh sách đầy đủ hiện tại (CK-08): người mới được gắn nhãn `core_team` hoặc `ucv` ở nhiệm kỳ đang chạy (Core team ghi Cách vào ở cột Chi tiết), người không còn thì nhãn có Đến ngày. Rời UCV là mất hộp thư ngay.
- Nối người bằng Email của thành viên đang ở CLB; Họ và tên phải khớp (bỏ dấu giống nhau cũng được), không thì báo dòng lỗi.
- Như sheet thành viên: chép bản sheet kèm tab `_undo`, ghi Lần tải sheet và Nhật ký; hoàn tác lần tải mới nhất của mỗi loại sheet trong 7 ngày.

## Giao diện theo mùa và ảnh nền đăng nhập

- BOD mở từ Cài đặt, Giao diện theo mùa. Chọn một trong 12 chủ đề (4 mùa, 8 ngày lễ) hoặc Không dùng; hình trang trí hiện ở khung chào trang chủ và màn đăng nhập, cả CLB thấy giống nhau. Không đổi màu app.
- Ảnh nền đăng nhập: BOD chọn ảnh, app thu nhỏ còn rộng 1600 px và lưu JPEG vào thư mục Drive `Ảnh nền đăng nhập`; đổi ảnh thì ảnh cũ vào thùng rác. Máy giữ ảnh và chỉ tải lại khi BOD đổi ảnh.
- Cài đặt dùng: `season_theme`, `login_bg_file_id`, `login_bg_version`. Mỗi lần đổi ghi Nhật ký.

## Hệ thống: việc tự chạy, sao lưu, lưu trữ nhiệm kỳ cũ

- Mỗi đêm lúc 2 giờ (`runNightly`, cài lúc cài đặt lần đầu và mỗi lần BOD mở Tình trạng hệ thống): sao lưu cả file dữ liệu vào thư mục Drive `Sao lưu` (giữ 30 bản, danh sách ở Script Properties `BACKUP_LIST`), chuyển dữ liệu nhiệm kỳ đã kết thúc hơn 365 ngày sang file `[ECO] Lưu trữ nhiệm kỳ ...` trong thư mục `Lưu trữ` (ghi sang trước, đếm đủ dòng rồi mới bỏ ở file chính), dọn phiên đăng nhập hết hạn, kiểm tra dung lượng (từ 70% thì báo BOD, mỗi tuần một lần).
- Mọi việc tự chạy (việc ban đêm, nhắc task, nhắc sinh nhật, nhắc seeding, gửi thư hẹn giờ) ghi lần chạy cuối vào Script Properties `JOB_STATUS`. Chạy lỗi thì báo mọi BOD qua Zalo hoặc app, mỗi việc tối đa một tin mỗi ngày.
- Cài đặt, Hệ thống: Tình trạng hệ thống (các việc tự chạy, dung lượng, file lưu trữ); Sao lưu và khôi phục (Sao lưu ngay, Khôi phục). Khôi phục chép bản sao lưu thành file dữ liệu mới; file đang dùng đổi tên `(trước khôi phục ...)` và giữ lại. Sao lưu tay và khôi phục ghi Nhật ký (việc `backup_restore`).

## Nhật ký, Tab dữ liệu và 5 tab xem

- 5 tab xem đứng đầu file dữ liệu (màu xám, đã khoá): Xem - Thành viên, Xem - Task, Xem - Log, Xem - Điểm và KPI, Xem - Sự kiện, của nhiệm kỳ đang chạy. App tính từ các tab dữ liệu rồi ghi đè cả tab (`datatabs.gs`), chữ tiếng Việt, có tên người.
- Làm mới mỗi đêm (việc ban đêm), mỗi lần có người mở file trên máy tính (lịch tự chạy `onDataFileOpen`, cài lúc cài đặt và cài lại khi khôi phục), và nút Làm mới tab xem trong Cài đặt, Hệ thống, Tab dữ liệu. Vừa làm mới trong 5 phút hoặc đang có người làm mới thì lần mở file bỏ qua.
- Cài đặt, Hệ thống, Nhật ký: mới nhất trước, lọc theo việc, người làm, tìm chữ (không cần dấu), mỗi lần 100 dòng.
- Cài đặt, Hệ thống, Tab dữ liệu: các tab theo nhóm màu, số dòng, tab nào đã khoá, tab Cài đặt sửa tay được.

## Kiểm tra và đưa lên

Kiểm tra: `npm test` chạy mọi test trong `tests/` (giả lập Google Sheets, không cần mạng).

Đưa lên: gộp vào `main` thì workflow `Đẩy code lên Google Apps Script` chạy test, đẩy `src/` lên dự án Apps Script (secret `SCRIPT_ID`, `DEPLOYMENT_ID`) và cập nhật link app. Cài lần đầu xem `docs/huong-dan-cai-dat.md`.
