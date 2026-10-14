# Yêu cầu hệ thống quản lý CLB (LÀM LẠI 14/10/2026)

Chốt lần đầu: 30/09/2026. Làm lại để dùng 10 năm: 14/10/2026. Đây là các chức năng lớn; chức năng nhỏ khai thác thêm khi làm.

## 1. Tổng quan
- Một app duy nhất: **app CLB ECO**, chạy trên Google Apps Script, mã nguồn lưu trên GitHub.
- Dữ liệu lưu trên Google Sheets trong Google Drive của tài khoản Google chung của CLB, tách riêng khỏi mã.
- Mọi người (thành viên, HR, UCV, BOD) dùng chung một app, phải đăng nhập. Mỗi người thấy chức năng theo quyền của mình.
- Dùng được trên **web máy tính** và cài như **app trên điện thoại (PWA)** ở `ecotdn.github.io/app/`.

## 2. Nguyên tắc thiết kế
- Chạy được khoảng **10 năm** mà không cần bảo trì, vì sau này có thể không ai biết code hay dùng AI thành thạo (xem mục 11).
- Mọi thứ hay thay đổi đều làm trên giao diện app: cơ cấu ban, thang điểm, phần trăm khen thưởng, hạn task, thời lượng buổi log, quy chế, link ghim, người được quyền, lịch nhắc, mã bot Zalo, link file mẫu log, tải danh sách thành viên.
- Nhiệm kỳ, giai đoạn: app tự xác định theo kiểu tải danh sách thành viên, không cần cài đặt tay.
- Người dùng không mở sheet, không sửa code. Sheet chỉ là nơi hệ thống cất dữ liệu. Không còn menu hay nút nào trong Google Sheet.
- Mọi cài đặt trong app đều do BOD sửa được.
- Có tài liệu hướng dẫn bằng lời dễ hiểu.

## 3. Người dùng
| Nhóm | Số người | Được làm gì |
|---|---|---|
| Thành viên CLB | 60–80 | Xem điểm và xếp hạng, KPI của mình, bảng ghim, quy chế, góp ý, ảnh thành tích |
| Ban nhân sự (HR) | 6–10 | Như thành viên, thêm task và log của các ban mình phụ trách; HR phụ trách seeding thêm báo cáo seeding |
| UCV | chưa biết | Như thành viên, thêm hộp thư CLB (mọi thao tác thay đổi phải chờ BOD duyệt) |
| BOD (ban điều hành) | 7 | Cộng điểm, task, log, duyệt và gửi mail, góp ý, KPI, bảng điểm, chứng nhận, báo cáo, mọi cài đặt |

- Quyền theo bậc thang: thành viên < HR < UCV < BOD. Người bậc trên có cả chức năng của bậc dưới.
- UCV là thành viên CLB đăng ký ứng tuyển qua Google Form.

## 4. Chức năng cho thành viên
- Trang chủ có 4 ô vào nhanh, link ghim và quy chế (BOD sửa trong Cài đặt).
- KPI của tôi: Task và Log, chỉ hiện con số.
- Điểm và xếp hạng của giai đoạn đang chạy, lịch sử cộng điểm. Lọc theo ban, theo tên; sắp xếp điểm cao → thấp hoặc ngược lại.
- Chỉ hiện thông tin không nhạy cảm: họ tên, lớp, ban, điểm. Không hiện ngày sinh, số điện thoại, Facebook.
- Góp ý (ẩn danh, hoặc ghi tên để được cộng điểm khi góp ý được dùng). BOD đọc ở mục Góp ý.
- Cài đặt của tôi: thông báo, mật khẩu, ảnh đại diện, giao diện sáng tối.

## 5. Chức năng cho BOD, HR, UCV

Menu của BOD: Trang chủ, Quản lý task, Quản lý log, Cộng điểm, Hộp thư, Góp ý, Thành viên (KPI, Bảng điểm, Chứng nhận), Cài đặt.

### 5.1 Cộng điểm (chỉ BOD, cho mọi thành viên)
- Mỗi loại hoạt động có số điểm cố định; BOD chỉ chọn loại, không nhập điểm. BOD thêm, sửa loại và số điểm ở Cài đặt, Thang điểm.
- Mỗi lần cộng ghi: loại hoạt động, người được cộng, người cộng (tự lấy từ tài khoản đăng nhập), thời gian (tự lấy lúc bấm gửi), tên hoạt động (không bắt buộc).
- Chọn được nhiều người một lần; danh sách chọn người có tìm theo tên và lọc theo ban.
- Vài loại được app tự cộng: react, comment (báo cáo seeding), góp ý được dùng, buổi log dư chỉ tiêu.

### 5.2 Task (BOD và HR phụ trách ban)
- Mục đích: nhắc việc, và để HR nhắc thủ công thành viên ban mình phụ trách qua Messenger.
- HR hoặc BOD đều tạo, sửa, đánh dấu hoàn thành, huỷ được. Tạo hàng loạt: một lần tạo cùng một task cho nhiều người.
- Trạng thái: **Đã giao**, **Sắp đến hạn**, **Trễ hạn**, **Không hoàn thành**, **Đã xong**, **Đã huỷ**. Còn bao nhiêu ngày thì "sắp đến hạn", trễ bao nhiêu ngày thì "không hoàn thành" đặt trong Cài đặt.
- BOD đánh giá chất lượng task đã xong; app ra Đạt hay Chưa đạt theo bảng của quy chế. Gia hạn chỉ ghi được khi xin trước hạn ít nhất 24 giờ.
- Nhắc theo cách mỗi người chọn: **bot Zalo**, app trên điện thoại, mail. Thời điểm nhắc cài trong app.
- Mỗi năm Head HR tạo bot bằng tài khoản Zalo của mình và dán mã bot vào Cài đặt. Có hướng dẫn từng bước trong app.

### 5.3 Mail (UCV và BOD)
- Mọi mail gửi dưới danh nghĩa Gmail chung của CLB.
- UCV chưa được vào tài khoản CLB nên dùng hộp thư trong app, gần đủ tính năng như Gmail thật: soạn, gửi, trả lời, chuyển tiếp, thư nháp, hộp thư đến, đã gửi.
- Đọc thư không cần duyệt. Mọi thao tác làm thay đổi hộp thư phải được BOD duyệt trước. BOD gắn trạng thái (đã duyệt, cần sửa lại, từ chối) để UCV biết và sửa.
- BOD **không** soạn thư trong app. Phần mail của BOD gồm:
  - **Duyệt việc của UCV.**
  - **Thư mẫu**: thư nháp trong Gmail của CLB.
  - **Gửi hàng loạt** từ một thư mẫu, có cá nhân hoá. Người nhận: thành viên CLB, danh bạ (CLB khác, đối tác), nhập tay, hoặc một Google Sheet. Chỗ nào trong thư ghi {Tên cột} thì tự thay bằng dữ liệu của người nhận.
  - **Đã lên lịch**: quản lý các đợt gửi đã hẹn giờ (xem, sửa, huỷ).
- Giới hạn của Google: Gmail thường gửi được khoảng 100 người nhận mỗi ngày qua app.

### 5.4 Quản lý log (BOD; HR xem KPI log của ban phụ trách)
- Log là các buổi ở lại trường tô màu, chuẩn bị dụng cụ cho sự kiện của CLB.
- Mỗi sự kiện cần làm log là một **đợt log**, có số buổi dự kiến và **chỉ tiêu** (số buổi mỗi người phải đi) chung, riêng theo ban, nhóm ban hoặc khối lớp.
- BOD thêm từng buổi (hoặc nhập từ file đăng ký log) và điểm danh mỗi buổi. Ai đi dư chỉ tiêu thì app hiện ngay.
- **Chốt đợt log**: chỉ tiêu cuối tính theo số buổi thực diễn ra; điểm cho buổi dư được cộng tự động theo thời lượng buổi (Cài đặt, Thang điểm). **Mở lại** thì gỡ điểm đó.
- KPI log của từng người tính theo các đợt log của nhiệm kỳ.

### 5.5 Thành viên: KPI, Bảng điểm, Chứng nhận (BOD)
- **KPI**: KPI task và KPI log của mọi thành viên, lọc theo ban và khối.
- **Bảng điểm**: mỗi giai đoạn một bảng xếp hạng, điểm tính lại từ 0. Có cả bảng cả nhiệm kỳ.
- **Chứng nhận**: KPI task và KPI log đều đạt 80% thì cấp. Mỗi phần từ 60% thì xét bù trừ, lọt top 40% thì cấp. Khen thưởng top theo phần trăm trong Cài đặt (mặc định 15%) mỗi giai đoạn. Xuất Excel.
- Tab **Nhiệm kỳ trước** xem lại kết quả của các nhiệm kỳ đã qua.

### 5.6 Báo cáo (BOD)
- Nội dung: điểm; task đã xong, trễ hạn; số lần mỗi loại hoạt động.
- Xem theo: từng thành viên, từng ban (gộp theo nhóm), cả CLB.
- Chọn khoảng thời gian: tháng, giai đoạn, nhiệm kỳ, hoặc tự chọn. Có bảng tổng và biểu đồ. Xuất ra file **Excel**.

## 6. Dữ liệu thành viên
- Sheet nguồn có các cột: Họ và tên, Lớp, Ban, Chức vụ, Ngày sinh, Số điện thoại, Email, Link Facebook, Tên Facebook. Có thể có thêm cột Mã thành viên (app tự ghi).
- App nhận diện theo **tên cột**: đổi thứ tự vẫn chạy. Cột lạ (ví dụ Ghi chú) không tải lên. App không giữ số điện thoại phụ huynh và nơi sống.
- Mỗi người có một **mã thành viên** không bao giờ đổi (xem mục 11).
- Ban hiện có: BOD, PG, PR CAP, PR DES, PR PHO, AD, HR. PR có 3 mảng, gộp thành nhóm PR khi lọc và thống kê. Cơ cấu ban do BOD sửa trong Cài đặt.
- Chức vụ hiện có: Pres, Vice pres, Head PG, Head PR CAP, Head PR DES, Head PR PHO, Head HR, Head AD, Mem.
- Thành viên sửa thông tin của mình trên sheet nguồn; BOD tải lại danh sách kiểu Cập nhật.

## 7. Tải danh sách, đăng nhập và phân quyền
- BOD tải danh sách thành viên ngay trong app: **Cài đặt → Tài khoản → Tải danh sách thành viên**. Xem trước rồi mới tải lên.
- Chọn 1 trong 4 kiểu:
  1. **Sau Oday**: bắt đầu nhiệm kỳ mới.
  2. **Sau tuyển đợt 1**: bắt đầu giai đoạn 1. Điểm về 0.
  3. **Sau tuyển đợt 2**: bắt đầu giai đoạn 2. Điểm về 0. Người mới là thành viên bổ sung.
  4. **Cập nhật**: sửa thông tin, thêm người bị sót, không đổi giai đoạn.
- Người không còn trong danh sách mới được đánh dấu "Đã rời", không bao giờ bị xoá. Hồ sơ, điểm, kết quả vẫn xem được ở Cài đặt, Tài khoản, Thành viên qua các năm.
- Mọi thành viên có email đều có tài khoản. Ban điều hành có quyền BOD. HR, UCV do BOD chọn trong app.
- Đăng nhập bằng **Google**, hoặc email + mật khẩu.
- Mật khẩu chung của CLB do BOD đặt, dùng cho người chưa tự đổi mật khẩu, không bắt buộc đổi. Mỗi người tự đổi mật khẩu của mình; BOD đặt lại được mật khẩu của mọi người.
- Rủi ro Van đã biết và chấp nhận: ai biết mật khẩu chung thì vào được tài khoản chưa đổi mật khẩu.

## 8. Cách tổ chức dữ liệu (database)
- Không dồn vào 1 tab. Chia nhiều tab, tổ chức chuyên nghiệp như app thương mại.
- Tên cột: tiếng Việt không dấu, không cách (vd: HoVaTen, SoDienThoai, ThoiGian).
- Thành viên phân biệt bằng mã thành viên. Các bản ghi khác (task, mail, góp ý) phân biệt bằng thời gian tạo, không thêm cột mã rườm rà.
- Mỗi dòng điểm, task ghi nhiệm kỳ, giai đoạn và mã thành viên, để nhiều năm sau vẫn tra được.

## 9. Tính năng tạo file đăng ký làm log (BOD)
- BOD tạo file đăng ký làm log từ một **Google Sheet mẫu**; link file mẫu nhập trong cài đặt.
- App tự lấy từ danh sách thành viên: họ tên, ban, số điện thoại.
- BOD bấm nút thêm hoặc xoá buổi rồi điền tên từng buổi.
- File tạo ra lưu vào thư mục Google Drive đặt trong cài đặt; tạo xong app hiện link ngay.

## 10. Giao diện
- Màu chủ đạo: **#274e13** (xanh lá đậm). Dùng logo CLB.
- Menu và cài đặt làm chuyên nghiệp, chia nhóm rõ ràng. Mỗi mục cha là một thư mục, bấm vào mới thấy mục con. Có ô tìm kiếm trong cài đặt.
- Có giao diện theo mùa và ngày lễ, BOD chọn trong Cài đặt.

## 11. Dùng 10 năm
- **Chỉnh mọi thứ trên giao diện, trong phạm vi Van đã duyệt.** Trong Cài đặt, nhóm Quy tắc CLB, BOD chỉnh được:
  - Cơ cấu ban: thêm ban, đổi tên, gộp nhóm, chữ viết tắt, giải thể ban (dữ liệu cũ vẫn xem được).
  - Thang điểm: các loại hoạt động và số điểm.
  - Khen thưởng, hạn task và buổi log: top bao nhiêu % (mặc định 15), còn bao nhiêu ngày là "sắp đến hạn" (mặc định 2), trễ bao nhiêu ngày là "không hoàn thành" (mặc định 1), thời lượng buổi log (mặc định 90 và 180 phút).
  - Các quy tắc khác cố định theo quy chế: KPI đạt 80%, bù trừ từ 60% và top 40%, 2 giai đoạn mỗi nhiệm kỳ, điểm về 0 mỗi giai đoạn, bảng kết quả task, gia hạn trước 24 giờ, seeding 48 giờ.
  - Mỗi nhiệm kỳ giữ bản quy tắc của mình. Đổi quy tắc không làm sai kết quả nhiệm kỳ cũ.
- **Tự chạy.** Cài đặt lần đầu ngay trong app (tạo thư mục, file dữ liệu, tài khoản BOD đầu tiên, mật khẩu chung, lịch chạy). Sau đó app tự sao lưu, tự nhắc việc, tự gửi thư hẹn giờ. Có lỗi thì tự mail cho BOD (mỗi việc tối đa một mail mỗi ngày). Trang Cài đặt, Hệ thống cho biết app có chạy đều không và sửa được lịch chạy bằng một nút.
- **Lưu trữ lâu dài.** Mỗi đêm app sao lưu file dữ liệu, giữ 30 bản; BOD khôi phục được bằng một nút. Nhiệm kỳ đã xong hơn một năm được chuyển sang file lưu trữ riêng để file chính không đầy. Kết quả từng nhiệm kỳ của từng người được giữ mãi. File gần đầy thì app báo BOD.
- **Mã thành viên thông minh.** Dạng YY-G-BAN-SS, ví dụ `26-1-PG-07` là vào năm 2026, đợt tuyển 1 (0 là Oday), ban PG, người thứ 7. Nhìn mã là biết người đó vào lúc nào, ban nào. Mã không bao giờ đổi, kể cả khi đổi ban, đổi tên, đổi email hay rời rồi quay lại. App ghi mã vào sheet nguồn để lần tải sau nhận đúng người.

## 12. Còn để sau
- Cấu trúc sheet danh sách UCV và cách tải lên.
- Website của CLB ở trang gốc `ecotdn.github.io`.
- Các chức năng nhỏ của từng phần.
