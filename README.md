# App CLB ECO

Mã nguồn của app quản lý CLB ECO (CLB Môi trường của trường). App chạy trên Google Apps Script, dữ liệu nằm trong một file Google Sheet trên Drive của tài khoản Google chung của CLB. App được làm để dùng khoảng 10 năm mà không cần ai biết code.

- Ai cũng phải đăng nhập mới xem được, kể cả bảng điểm. Mọi thành viên có email trong danh sách đều đăng nhập được (mật khẩu chung của CLB, mật khẩu riêng, hoặc Google).
- Quyền theo bậc thang: thành viên < HR < UCV < BOD. Người bậc trên có cả chức năng của bậc dưới.
- Menu của BOD: Trang chủ, Quản lý task, Quản lý log, Cộng điểm, Hộp thư, Góp ý, Thành viên (KPI, Bảng điểm, Chứng nhận), Cài đặt.
- Thành viên: Trang chủ, KPI của tôi (Task, Log), Điểm và xếp hạng, Góp ý, Cài đặt của tôi. HR phụ trách ban có thêm Ban phụ trách, HR phụ trách seeding có thêm Seeding, UCV có thêm Hộp thư.
- Những gì CLB hay đổi (cơ cấu ban, thang điểm, phần trăm khen thưởng, hạn task, thời lượng buổi log) BOD chỉnh trong Cài đặt. Các quy tắc còn lại cố định theo quy chế.
- App tự chạy: tự sao lưu mỗi đêm, tự chuyển dữ liệu nhiệm kỳ cũ sang file lưu trữ, tự báo BOD qua mail khi có lỗi.
- Cài được lên điện thoại như app nhờ trang vỏ trong `pwa/`, địa chỉ `https://ecotrandainghia.github.io/internal/`. GitHub tự đẩy `src/` lên Apps Script và tự đăng `pwa/` mỗi lần gộp vào `main`.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/yeu-cau.md](docs/yeu-cau.md) | Yêu cầu đã chốt với CLB |
| [docs/huong-dan-cai-dat.md](docs/huong-dan-cai-dat.md) | Cài app lên tài khoản Google của CLB, từng bước |
| [docs/huong-dan-cai-app.md](docs/huong-dan-cai-app.md) | Cài app lên điện thoại, bật đăng nhập Google |
| [docs/kien-truc.md](docs/kien-truc.md) | Cách app được tổ chức, các bảng dữ liệu |

## Cấu trúc thư mục

```
src/                  Mã chạy trên Google Apps Script (một dự án riêng, không gắn vào file dữ liệu)
  appsscript.json     Cấu hình dự án: múi giờ, ứng dụng web, dịch vụ Gmail
  Code.gs             Trang web, tải danh sách thành viên, thành viên qua các năm, lịch sinh nhật, bảng điểm, góp ý
  DuLieu.gs           Tầng dữ liệu: mở file dữ liệu, đọc ghi bảng, khoá ghi, nhớ tạm, cấu hình, nhật ký, lịch chạy
  Logic.gs            Hàm tính toán thuần và giá trị mặc định (cơ cấu ban, quy tắc, cấu trúc bảng); có kiểm thử
  CaiDatLanDau.gs     Cài đặt lần đầu: tạo mới hoặc dùng file dữ liệu có sẵn
  TrangCaiDatLanDau.html  Trang cài đặt lần đầu
  CaiDat.gs           Lưu cơ cấu ban và quy tắc CLB
  HeThong.gs          Việc ban đêm, sao lưu, khôi phục, lưu trữ nhiệm kỳ cũ, trang Hệ thống
  MayChuDesk.gs       Đăng nhập, phân quyền, cộng điểm, task, góp ý, các cài đặt khác
  Kpi.gs              KPI task: đánh giá, gia hạn, KPI theo ban phụ trách
  KpiLog.gs           Quản lý log: đợt log, buổi log, điểm danh, chốt đợt
  TongKet.gs          Chứng nhận, khen thưởng, kết quả các nhiệm kỳ
  ThanhTich.gs        Số liệu cho ảnh thành tích
  Seeding.gs          Báo cáo seeding trong app
  BaoCao.gs           Báo cáo điểm, xuất Excel, tạo file đăng ký log
  ThongBao.gs         Gửi thông báo theo cách mỗi người chọn: Zalo, app trên điện thoại, mail
  Zalo.gs             Bot Zalo và lịch nhắc hạn task
  Mail.gs             Hộp thư UCV, BOD duyệt, thư mẫu, gửi hàng loạt, hẹn giờ
  Eco.html            Khung trang của app, ghép các file giao diện bên dưới
  DeskGiaoDien.html   Kiểu dáng (CSS) chung
  ChuDe.html          Giao diện theo mùa và ngày lễ
  DungChung.html      Hàm giao diện dùng chung, màn chờ, khung chào
  DeskChung.html      Đăng nhập, menu, thư mục, điều hướng
  DeskTrangChu.html   Trang chủ và trang thông báo
  DeskViec.html       Task, cộng điểm, góp ý, danh sách Cài đặt và các mục cài đặt
  DeskCaiDat.html     Cài đặt mới: cơ cấu ban, quy tắc, tải danh sách, thành viên qua các năm, hệ thống, sao lưu
  DeskMail.html       Hộp thư, duyệt thư, gửi hàng loạt
  EcoXepHang.html     Bảng điểm và xếp hạng
  EcoKpi.html         Trang KPI
  EcoLog.html         Quản lý log và KPI log
  EcoTongKet.html     Chứng nhận và khen thưởng, tab Nhiệm kỳ trước
  EcoSeeding.html     Báo cáo seeding và hẹn nhắc
  EcoAnh.html         Ảnh thành tích
  LogoEco.html        Logo CLB
pwa/                  Trang vỏ trên GitHub Pages để cài app và đăng nhập Google (app ở pwa/app/)
tests/                Kiểm thử tự động (chạy: npm test)
docs/                 Tài liệu
.github/workflows/    Tự kiểm thử rồi đẩy mã lên Apps Script khi gộp vào main
```
