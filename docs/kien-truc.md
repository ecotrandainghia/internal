# Kiến trúc hệ thống

## Tổng thể

- **Mã** nằm ở một dự án Apps Script riêng (thư mục `src/`), không gắn vào file dữ liệu. Dự án được triển khai thành **ứng dụng web**, chạy dưới quyền tài khoản CLB, ai có link cũng mở được (nhưng phải đăng nhập mới xem được gì).
- **Dữ liệu** nằm trong file Google Sheet **"CLB ECO - Dữ liệu"** trong thư mục Drive **"CLB ECO - App"** của tài khoản CLB. Mỗi tab là một bảng. Cùng thư mục có các thư mục con Sao lưu, Lưu trữ, Đính kèm mail, Ảnh nền. Thư mục hay thư mục con bị xoá thì app tự tạo lại.
- App mở file dữ liệu theo ID lưu trong thuộc tính của dự án (`IdFileDuLieu`). Chưa có ID thì mở link app sẽ ra trang **Cài đặt lần đầu** (`CaiDatLanDau.gs`, `TrangCaiDatLanDau.html`).
- Không có menu hay hộp thoại nào trong Google Sheet. Mọi việc, kể cả tải danh sách thành viên, đều làm trong app. Người dùng không cần mở file dữ liệu.
- Mã bot Zalo và mật khẩu chung của CLB (đã băm) cất trong thuộc tính của dự án (`layBiMat_`, `datBiMat_`), không nằm trong file dữ liệu. Ai được chia sẻ file dữ liệu cũng không đọc được.

## Cài đặt lần đầu (`src/CaiDatLanDau.gs`)

- Chỉ chủ dự án (tài khoản CLB đã triển khai app) làm được. Ứng dụng web mở cho mọi người không cần đăng nhập nên Google có thể không cho biết ai đang mở trang; khi đó người cài đặt bấm gửi mã 6 số tới email tài khoản CLB (`guiMaCaiDat`, mã dùng 30 phút, sai 5 lần thì phải gửi mã mới) và nhập mã đó.
- **Tạo mới** (`caiDatTaoMoi`): tạo thư mục "CLB ECO - App", file "CLB ECO - Dữ liệu", mọi bảng với dữ liệu mặc định (thang điểm theo quy chế, cơ cấu ban, quy tắc), tài khoản BOD đầu tiên, mật khẩu chung và mọi lịch chạy tự động.
- **Dùng file có sẵn** (`caiDatDungFileCo`): dán link một file dữ liệu cũ (bản sao lưu, hoặc khi chuyển app sang tài khoản CLB khác). App kiểm tra file có tab TaiKhoan, ThanhVien, thêm bảng và cột còn thiếu, rồi cài lịch chạy. File chưa có BOD hay mật khẩu chung thì tạo thêm.

## Tầng dữ liệu (`src/DuLieu.gs`)

- **Đọc, ghi:** `docBang_` đọc cả bảng thành danh sách đối tượng, `themDong_` thêm dòng, `ghiDeBang_` ghi đè cả bảng, `layCaiDat_`/`datCaiDat_` đọc ghi bảng CaiDat. Các file khác không gọi thẳng Google Sheet.
- **Khoá ghi:** mọi chỗ ghi chạy trong khoá chung (`voiKhoa_`, hoặc `layKhoa_`/`traKhoa_`). Hai người bấm lưu cùng lúc thì lần lượt từng người ghi, không ai ghi đè hay chen vào dòng của người kia. Việc đọc rồi sửa phải nằm trọn trong một khoá. Gọi lồng nhau vẫn được. Chờ quá 30 giây thì báo "Đang có nhiều người lưu cùng lúc". Việc chạy lâu (gửi thư hẹn giờ, nhắc việc) chỉ khoá lúc ghi.
- **Nhớ tạm trên máy chủ:** mỗi bảng chỉ đọc một lần trong một lần chạy. Các bảng ít đổi (`BANG_NHO_TAM`: CaiDat, TaiKhoan, ThanhVien, LoaiHoatDong, Ban, NhiemKy, GiaiDoan) còn được nhớ 10 phút giữa các lần chạy. Ghi vào bảng nào thì bản nhớ của bảng đó bị bỏ ngay. Ai sửa tay trên file dữ liệu thì app thấy sau tối đa 10 phút, hoặc ngay khi BOD bấm **Làm mới dữ liệu** ở Cài đặt, Hệ thống.
- **Tự thêm bảng và cột:** cấu trúc bảng nằm ở `BANG` trong `Logic.gs`. Bản cập nhật thêm bảng hay cột thì `damBaoCauTrucBang_` tự thêm vào file dữ liệu ở lần dùng đầu tiên.
- **Cấu hình:** `napCauHinh_` nạp cơ cấu ban (bảng Ban) và quy tắc của nhiệm kỳ đang chạy vào `CO_CAU`, `QUY_TAC`. Máy chủ đọc quy tắc qua `quyTac_()`, không đọc thẳng giá trị mặc định.
- **Mở app nhanh:** app hỏi máy chủ một lần (`moDesk`: người dùng và trang chào). Máy nhớ kết quả lần mở trước (`eco_lan_mo`) nên lần sau hiện ngay rồi mới cập nhật. Dữ liệu đọc của vài trang (`DOC_NHANH`) được giữ 60 giây trên máy, và bị bỏ hết ngay khi người dùng lưu, sửa hay xoá bất cứ gì.

## Các bảng dữ liệu

Tên cột viết tiếng Việt không dấu, không cách. Danh sách đầy đủ các cột nằm ở `BANG` trong `src/Logic.gs`. Dữ liệu chỉ thêm, không xoá: người rời CLB chỉ đổi trạng thái; mỗi dòng điểm, task đều ghi nhiệm kỳ và mã thành viên để nhiều năm sau vẫn tra được.

| Bảng | Dùng để |
|---|---|
| ThanhVien | Mọi người từng ở CLB, kể cả người đã rời. Có mã thành viên (MaTV), hồ sơ, LoaiThanhVien (Chính thức, Bổ sung), GiaiDoanVao, TrangThai (Đang hoạt động, Đã rời), NgayVao, NgayRoi. Không giữ số điện thoại phụ huynh và nơi sống. |
| ThanhVienGiaiDoan | Ai ở CLB trong mỗi giai đoạn, ở ban nào, chức vụ gì. Ghi khi mở giai đoạn. |
| NhiemKy | Mỗi nhiệm kỳ một dòng: lúc bắt đầu, bản quy tắc riêng của nhiệm kỳ (QuyTac), file lưu trữ (IdLuuTru, NgayLuuTru). |
| GiaiDoan | Mỗi giai đoạn một dòng: nhiệm kỳ, số giai đoạn, lúc bắt đầu, kiểu tải đã mở nó. Dòng cuối là giai đoạn đang chạy. |
| KetQuaNhiemKy | Kết quả của từng người mỗi nhiệm kỳ: điểm từng giai đoạn, điểm cả kỳ, top, KPI task, KPI log, chứng nhận. Giữ mãi ở file chính. |
| Ban | Cơ cấu ban: mã, tên đầy đủ, nhóm, chữ viết tắt, ban điều hành, có HR phụ trách, đang dùng, thứ tự. |
| LanTai | Mỗi lần tải danh sách thành viên một dòng: nhiệm kỳ, kiểu chọn, kiểu thực tế, số thêm, sửa, rời, người tải. |
| DoiBan | Ai đổi ban, từ ban nào sang ban nào, lúc nào. |
| SinhNhat | Sự kiện sinh nhật app đã tạo trong Google Lịch của từng nhiệm kỳ. |
| LichSuDiem | Mỗi lần cộng điểm một dòng, kèm mã thành viên, nhiệm kỳ, giai đoạn. Điểm ghi tại lúc cộng nên đổi thang điểm không làm đổi lịch sử. |
| LoaiHoatDong | Thang điểm: tên loại, điểm, cộng tay hay tự cộng, giới hạn mỗi giai đoạn, gắn với chức năng tự cộng nào (DungCho). |
| BangGhim | Link ghim hiện ở trang chủ thành viên. |
| GopY | Góp ý. Họ tên trống là ẩn danh. DaDung là lúc BOD xác nhận góp ý được dùng (app cộng điểm). |
| BaoCaoSeeding | Báo cáo seeding: link bài, tên react, comment, tên không khớp, trạng thái. |
| TaiKhoan | Tài khoản đăng nhập: email, mã thành viên, vai trò, mật khẩu đã băm, cách nhận thông báo, giao diện, ban HR phụ trách, nhóm HR, tự nhắc. |
| CaiDat | Các cài đặt dạng khoá và giá trị. |
| Task | Mỗi người phụ trách một dòng: hạn chót, trạng thái, ngày nộp, gia hạn, chất lượng, người đánh giá, HR phụ trách. |
| NhacSeeding | Hẹn nhắc điền báo cáo seeding sau 48 giờ. |
| AnhDaiDien | Ảnh đại diện nhỏ (data URL, khoảng 30 KB). |
| KetNoiZalo | Ai đã kết nối bot Zalo. |
| ViecMail | Mỗi thao tác mail của UCV (nháp, chờ duyệt, đã duyệt…). |
| DanhBa | Danh bạ gửi hàng loạt (CLB khác, đối tác). |
| LichGui | Thư hàng loạt đã gửi hoặc hẹn giờ. |
| FileLog | Các file đăng ký log đã tạo. |
| SuKienLog | Đợt log: tên, số buổi dự kiến, chỉ tiêu chung và riêng, trạng thái, lúc chốt. |
| BuoiLog | Buổi của một đợt log: ngày, thời lượng, trạng thái, người đăng ký, người có mặt. |
| ThietBi | Máy đã bật thông báo của app. |
| ThongBao | Thông báo app đã gửi, để máy lấy nội dung. Tự xoá sau 30 ngày. |
| NhatKyHeThong | Nhật ký các việc chạy tự động và lỗi. Giữ 3000 dòng gần nhất. |

## Cơ cấu ban và quy tắc (`src/Logic.gs`, `src/CaiDat.gs`)

- Giá trị mặc định nằm ở đầu `Logic.gs`: `CO_CAU_MAC_DINH` (các ban) và `QUY_TAC_MAC_DINH` (quy tắc). Khi app chạy, giá trị BOD đã lưu đè lên. Không ai phải sửa code để đổi quy tắc.
- **BOD chỉnh được** trong Cài đặt, nhóm Quy tắc CLB:
  - **Cơ cấu ban** (`luuCoCau`): thêm ban, đổi tên, gộp nhóm (ví dụ PR Caption, PR Design, PR Photo cùng nhóm PR), chữ viết tắt dùng trong mã thành viên, ban giải thể (bỏ chọn Đang dùng, dữ liệu cũ vẫn xem được). Phải có đúng một ban điều hành. Không xoá được ban còn thành viên. Chữ viết tắt đã có trong mã thành viên thì không đổi được.
  - **Thang điểm** (`luuLoaiHoatDong`): các loại hoạt động và số điểm.
  - **Khen thưởng, hạn task và buổi log** (`luuQuyTac`, các mục ở `CHINH_DUOC`): top bao nhiêu % được khen thưởng (mặc định 15), còn bao nhiêu ngày thì task "sắp đến hạn" (mặc định 2), trễ quá bao nhiêu ngày thì "không hoàn thành" (mặc định 1), các thời lượng buổi log (mặc định 90 và 180 phút).
- **Cố định theo quy chế:** KPI task và KPI log đạt từ 80%; bù trừ khi mỗi phần từ 60% và lọt top 40%; 2 giai đoạn mỗi nhiệm kỳ; điểm về 0 mỗi giai đoạn; bảng kết quả task; xin gia hạn trước hạn ít nhất 24 giờ; seeding trong 48 giờ.
- **Mỗi nhiệm kỳ giữ một bản quy tắc** (bảng NhiemKy, cột QuyTac), chép lúc nhiệm kỳ bắt đầu. Đổi quy tắc chỉ áp cho nhiệm kỳ đang chạy và các nhiệm kỳ sau. Nhiệm kỳ cũ vẫn xem lại đúng như lúc đó.
- Thứ tự ban ở mọi chỗ liệt kê (nút lọc, danh sách chọn người, báo cáo, danh bạ, file log) theo thứ tự trong cơ cấu (`thuTuBan_`). Nhóm đứng ở chỗ ban đầu tiên của nhóm. Ban lạ cùng nhóm đứng ngay sau nhóm đó, ban lạ hẳn đứng cuối.

## Mã thành viên

- Dạng **YY-G-BAN-SS** (`maThanhVienMoi_`, `docMaThanhVien_`). Ví dụ `26-1-PG-07`: vào nhiệm kỳ 2026-2027, đợt tuyển 1, ban PG, người thứ 7.
  - YY: hai số cuối năm đầu nhiệm kỳ lúc vào CLB.
  - G: đợt vào, 0 là Oday, 1 là đợt tuyển 1, 2 là đợt tuyển 2.
  - BAN: chữ viết tắt của ban lúc vào (theo cơ cấu ban).
  - SS: số thứ tự trong cùng năm, đợt, ban.
- Mã do app cấp khi người đó lần đầu có trong danh sách. Mã **không bao giờ đổi** và không cấp lại cho người khác, kể cả khi người đó đổi ban hay rời CLB. Người quay lại dùng lại mã cũ.

## Tải danh sách thành viên (`src/Code.gs`, Cài đặt → Tài khoản → Tải danh sách thành viên)

1. BOD chọn kiểu tải, nhiệm kỳ (app gợi ý), dán link sheet nguồn và tên tab. Sheet nguồn phải chia sẻ cho tài khoản CLB.
2. App đọc tab nguồn, tìm dòng tiêu đề, nhận cột theo **tên** (bỏ dấu, không phân biệt hoa thường), nên đổi thứ tự cột vẫn chạy. Bắt buộc có "Họ và tên" và "Ban". Cột nào không có thì giữ thông tin cũ.
3. Nhận ra từng người theo mã thành viên (nếu sheet có cột "Mã thành viên"), rồi theo email, rồi theo họ tên. Trùng tên mà khác email là hai người khác nhau.
4. Kiểu tải (`KIEU_TAI`). Oday, đợt 1, đợt 2 mỗi nhiệm kỳ chỉ làm một lần, theo thứ tự đó. Chọn lại một kiểu đã làm thì tự tính là Cập nhật.
   - **Sau Oday**: đầu nhiệm kỳ, mở nhiệm kỳ mới. Chưa mở giai đoạn.
   - **Sau tuyển đợt 1**: mở giai đoạn 1 (và nhiệm kỳ mới nếu chưa có Oday). Người mới là chính thức.
   - **Sau tuyển đợt 2**: mở giai đoạn 2. Người mới là thành viên bổ sung.
   - **Cập nhật**: sửa thông tin, thêm người bị sót, đánh dấu người đã rời; không đổi giai đoạn. Đổi ban giữa nhiệm kỳ dùng kiểu này, app ghi vào bảng DoiBan.
   - Lần tải đầu của nhiệm kỳ: mọi người ở lại đều thành chính thức của nhiệm kỳ mới.
5. **Xem trước** (`xemTruocTaiDanhSach`): báo kiểu tải thực sự, giai đoạn sẽ mở, người thêm (kèm mã mới), sửa, đổi ban, quay lại, đã rời, số tài khoản mới. Có ban chưa có trong cơ cấu thì BOD chọn thêm luôn vào cơ cấu hoặc sửa sheet nguồn. Danh sách mới không có chính người đang tải trong ban điều hành thì không cho tải.
6. **Tải lên** (`taiDanhSachThanhVien`): ghi bảng ThanhVien (người không còn trong danh sách đổi thành "Đã rời", không xoá), ghi NhiemKy, GiaiDoan, ThanhVienGiaiDoan, LanTai, DoiBan, đồng bộ tài khoản (mọi thành viên có email đều có tài khoản; ban điều hành là BOD; HR, UCV giữ nguyên; người rời bị bỏ tài khoản). Tài khoản mới đăng nhập bằng mật khẩu chung.
7. Nếu bật **Ghi mã thành viên vào sheet nguồn**, app ghi mã vào cột "Mã thành viên" của sheet nguồn (thêm cột nếu chưa có), để lần sau nhận đúng người dù đổi tên hay đổi email.
8. Lịch sinh nhật: BOD đặt Google Lịch của nhiệm kỳ ở Cài đặt, Tài khoản, Lịch sinh nhật. Mỗi lần tải, app đồng bộ sự kiện sinh nhật cả ngày lặp lại hằng năm.

## Thành viên qua các năm (Cài đặt → Tài khoản)

- `layDanhSachThanhVien`: mọi người từng ở CLB, cả người đã rời, lọc được theo năm vào.
- `layHoSoThanhVien`: hồ sơ một người theo mã: thông tin liên lạc, các giai đoạn đã tham gia (ban, chức vụ, loại thành viên), các lần đổi ban, kết quả từng nhiệm kỳ (từ KetQuaNhiemKy).

## Việc tự chạy (`src/DuLieu.gs`, `src/HeThong.gs`)

| Lịch chạy | Khi nào | Làm gì |
|---|---|---|
| `chayHangDem` | 2 giờ sáng mỗi ngày | Sao lưu, lưu kết quả nhiệm kỳ, chuyển nhiệm kỳ cũ sang file lưu trữ, dọn phiên đăng nhập hết hạn và nhật ký cũ, kiểm tra dung lượng |
| `nhacViecHangNgay` | Các giờ BOD chọn ở Lịch nhắc task | Nhắc hạn task |
| `guiThuDaLenLich` | Mỗi 10 phút | Gửi thư hàng loạt đã hẹn giờ |
| `nhacSeedingTheoGio` | Mỗi giờ | Nhắc điền báo cáo seeding |

- Mọi lịch được cài lúc cài đặt lần đầu (`caiLichChay_`). Thiếu lịch nào thì BOD bấm **Sửa lịch chạy** ở Cài đặt, Hệ thống.
- Mỗi việc chạy qua `chayViec_`: ghi nhật ký vào NhatKyHeThong và lúc chạy gần nhất. Lỗi thì mail cho BOD, mỗi việc tối đa một mail mỗi ngày, để không ai phải mở code mới biết app có chạy đều không.
- Lịch chạy chỉ nhận lời gọi từ chính lịch của dự án (`laLichChay_`), người ngoài không gọi thẳng từ trang web được.

## Sao lưu và lưu trữ (`src/HeThong.gs`)

- **Sao lưu:** mỗi đêm app chép file dữ liệu vào thư mục Sao lưu, giữ 30 bản gần nhất. BOD bấm được **Sao lưu ngay**.
- **Khôi phục** (`khoiPhucSaoLuu`): chép một bản sao lưu thành file dữ liệu mới và dùng file đó. File đang dùng được đổi tên "(trước khôi phục …)" và để lại, không xoá.
- **Lưu trữ nhiệm kỳ cũ:** nhiệm kỳ đã kết thúc hơn 365 ngày (`LUU_TRU_SAU_NGAY`) thì các dòng của nó trong các bảng ở `BANG_LUU_TRU` (điểm, task, góp ý, seeding, log, mail, thông báo, lần tải, đổi ban, thành viên theo giai đoạn) được chuyển sang file "CLB ECO - Lưu trữ nhiệm kỳ …" riêng trong thư mục Lưu trữ. File chính nhẹ lại.
- **Kết quả nhiệm kỳ** (`luuKetQuaNhiemKy_`): mỗi đêm app chép kết quả nhiệm kỳ đang chạy vào KetQuaNhiemKy. Khi sang nhiệm kỳ mới, bản cuối của nhiệm kỳ cũ vẫn còn. Bảng này luôn ở file chính, nên nhiều năm sau vẫn xem lại được dù dữ liệu chi tiết đã chuyển sang file lưu trữ.
- **Dung lượng:** Google Sheet chứa tối đa 10 triệu ô. Dùng quá 70% thì app mail báo BOD (tối đa mỗi tuần một lần).
- Trang **Cài đặt → Hệ thống**: Tình trạng hệ thống (lịch chạy, lần chạy gần nhất, nhật ký, dung lượng, Sửa lịch chạy, Làm mới dữ liệu) và Lưu trữ và sao lưu (bản sao lưu, khôi phục, file lưu trữ từng nhiệm kỳ, link thư mục app).

## Đăng nhập và phân quyền (`src/MayChuDesk.gs`)

- Ai cũng phải đăng nhập. Đăng nhập bằng email và mật khẩu (mật khẩu chung của CLB hoặc mật khẩu riêng), hoặc bằng Google. Mật khẩu lưu dạng băm SHA-256 lặp 300 lần kèm chuỗi muối riêng cho từng tài khoản.
- Sai mật khẩu 8 lần liên tiếp thì khoá email đó 15 phút.
- Đăng nhập thành công tạo một mã phiên ngẫu nhiên lưu trong thuộc tính của dự án, hạn 60 ngày và tự gia hạn mỗi lần mở app. Phiên hết hạn được dọn mỗi đêm.
- Mỗi lần gọi máy chủ đều kiểm tra lại tài khoản trong bảng TaiKhoan, nên gỡ tài khoản là mất quyền ngay.
- Quyền theo vai trò (`QUYEN` trong `Logic.gs`), bậc thang thành viên < HR < UCV < BOD. Tài khoản BOD đi theo ban điều hành trong danh sách thành viên. HR, UCV do BOD cấp trong Cài đặt, Tài khoản, Phân quyền.

## Menu

- Mỗi mục cha là một thư mục: trên menu chỉ có mục cha, bấm vào mới thấy mục con (`THU_MUC` trong `DeskChung.html`; các nhóm của Cài đặt cũng vậy, `SET` trong `DeskViec.html`). Trang con có nút quay lại thư mục cha ở đầu trang. Thanh tab dưới trên điện thoại mở thẳng 4 mục vào nhanh.
- **BOD** (`NAV_BOD`): Trang chủ, Quản lý task, Quản lý log, Cộng điểm, Hộp thư, Góp ý, Thành viên (KPI gồm KPI task và KPI log; Bảng điểm; Chứng nhận), Cài đặt.
- **Cài đặt của BOD**:
  - Quy tắc CLB: Cơ cấu ban, Thang điểm, Khen thưởng, hạn task và buổi log.
  - Thông báo: Thông báo của thành viên (kèm nút Bot Zalo), Lịch nhắc task, Thông báo khác.
  - Hoạt động CLB: File mẫu log, Báo cáo seeding, Ghim và quy chế.
  - Hộp thư: Danh bạ, Chữ ký.
  - Tài khoản: Tải danh sách thành viên, Thành viên qua các năm, Mật khẩu chung, Lịch sinh nhật, Phân quyền, Đặt lại mật khẩu, Ảnh nền đăng nhập, Đăng nhập bằng Google.
  - Hệ thống: Tình trạng hệ thống, Lưu trữ và sao lưu.
  - Giao diện theo mùa và sự kiện; Của tôi.
- **Thành viên** (và UCV, HR không có quyền nào thêm): Trang chủ, KPI của tôi (Task, Log), Điểm và xếp hạng, Góp ý, Cài đặt (thông báo, mật khẩu, ảnh đại diện, giao diện sáng tối). UCV có thêm Hộp thư. KPI chỉ hiện con số; kết quả chứng nhận chỉ có ở trang Chứng nhận của BOD.
- **HR phụ trách ban**: thêm thư mục Ban phụ trách: Task (nhập, sửa, gia hạn, đổi trạng thái giúp BOD; KPI task) và Log (KPI log), cho thành viên các ban ở cột BanQuanLy.
- **HR phụ trách seeding** (`SUP-SEED`): thêm thư mục Seeding: Hẹn nhắc 48 giờ và Báo cáo.
- Bảng dữ liệu nhiều người (KPI, Bảng điểm, Chứng nhận, danh sách task) lọc được theo ban và theo khối (số đầu cột Lớp, `khoiLop_`).

## Cộng điểm

- BOD chọn một loại hoạt động và nhiều người. Mỗi người thành một dòng LichSuDiem với điểm của loại tại lúc cộng, kèm mã thành viên, nhiệm kỳ, giai đoạn. Người cộng lấy từ tài khoản đăng nhập, thời gian lấy lúc bấm.
- Xoá một lần cộng nhầm: nhận diện dòng bằng thời gian cộng và họ tên.
- Loại có `CongTay` = `khong` là loại tự cộng, BOD không chọn khi cộng tay. Cột `DungCho` gắn loại với chức năng tự cộng: `react`, `comment` (seeding), `gopy` (góp ý được dùng), `log90`, `log180`… (buổi log dư chỉ tiêu, một loại cho mỗi thời lượng buổi trong quy tắc). Mỗi chức năng gắn với tối đa một loại.

## Xếp hạng và khen thưởng

- `tongHopBangDiem_`: mỗi giai đoạn một bảng xếp hạng, điểm tính lại từ 0. Giai đoạn 1 chỉ có thành viên chính thức; giai đoạn 2 có mọi người đã vào từ giai đoạn 2 trở về trước. "Cả nhiệm kỳ" là tổng mọi giai đoạn của người đã có từ giai đoạn 1.
- Số người trong top = số người được xếp hạng × tỉ lệ top trong quy tắc (mặc định 15%), làm tròn thông thường (`soNguoiTop_`). Người bằng điểm với người cuối top cũng được tính; người 0 điểm không được tính.
- `danhSachKhenThuong_`: top từng giai đoạn, top cả nhiệm kỳ, và người lọt top ở mọi giai đoạn.

## KPI task (`src/Kpi.gs`)

- Quyền task (`quyenTask_`): BOD xem, giao, sửa task của mọi người trừ BOD. HR phụ trách ban làm giúp BOD với thành viên các ban mình phụ trách (trừ chính mình). Người khác chỉ xem task của mình.
- Sheet chỉ lưu trạng thái Đã giao, Đã xong, Đã huỷ. "Sắp đến hạn", "Trễ hạn" và "Không hoàn thành" được tính mỗi lần xem, theo số ngày trong quy tắc.
- Xác nhận xong: BOD hoặc HR chọn Đúng hạn hay Trễ hạn (`ngayNopTheoKieu_`). Task đã bị tính không hoàn thành vẫn xác nhận xong được.
- Kết quả từng task (`ketQuaTask_`): đúng hạn so ngày nộp với hạn chót (gia hạn chỉ ghi được khi xin trước hạn ít nhất 24 giờ), chất lượng do BOD chấm, theo bảng 3 × 3 của quy chế. Không hoàn thành là Chưa đạt.
- KPI task (`tongKpiTask_`): số task đạt ÷ số task đã có kết quả, làm tròn. Thành viên vào ở giai đoạn 2 chỉ tính task giao từ lúc giai đoạn 2 bắt đầu.
- HR quản lý theo ban (`boLocTaskHr_`): HR đã phân ban chỉ thấy, tạo, sửa và được nhắc task của các ban mình quản lý, cộng task của chính mình. Ban chưa có HR nào quản lý thì mọi HR đều thấy. HR chưa phân ban và BOD thấy mọi task.

## Quản lý log (`src/KpiLog.gs`, `src/EcoLog.html`)

- Log là các buổi ở lại trường tô màu, chuẩn bị dụng cụ cho sự kiện của CLB. Mỗi sự kiện cần làm log là một **đợt log** (bảng SuKienLog; tên bảng và hàm vẫn dùng chữ "SuKien").
- BOD tạo đợt log: số buổi dự kiến, **chỉ tiêu** (số buổi giao) chung, và chỉ tiêu riêng theo khối lớp (ưu tiên, đọc từ cột Lớp) hoặc theo ban, nhóm ban.
- BOD thêm từng buổi (ngày, thời lượng theo quy tắc), nhập người đăng ký tay hoặc từ file đăng ký log (`nhapDangKyLog`), và **điểm danh** mỗi buổi. Buổi có trạng thái Chưa diễn ra, Đã diễn ra, Huỷ vì hết việc, Huỷ vì lý do khác.
- Chỉ tiêu cuối = số buổi thực diễn × chỉ tiêu ÷ số buổi dự kiến, không lớn hơn chỉ tiêu (`giaoCuoi_`). Đã tham gia = buổi đã diễn ra có mặt + buổi huỷ vì lý do khác đã đăng ký.
- Ai đi nhiều hơn chỉ tiêu thì app hiện số buổi dư ngay sau mỗi lần điểm danh.
- **Chốt đợt log** (`chotSuKienLog`): cộng điểm cho các buổi dư (các buổi có mặt muộn nhất vượt chỉ tiêu cuối, buổi huỷ không tính), theo loại điểm gắn với thời lượng buổi đó ở Thang điểm. **Mở lại** (`moLaiSuKienLog`) gỡ các dòng điểm đó; chốt lại sẽ cộng lại.
- KPI log = tổng tham gia ÷ tổng chỉ tiêu cuối, làm tròn %, đạt từ 80%. Thành viên vào ở giai đoạn 2 chỉ tính đợt log tạo từ lúc giai đoạn 2 bắt đầu.

## Chứng nhận (`src/TongKet.gs`, `src/EcoTongKet.html`)

- Trang Chứng nhận (BOD): KPI log, KPI task và kết quả chứng nhận của từng thành viên, danh sách khen thưởng theo từng giai đoạn; xuất Excel (tab Chứng nhận, tab Khen thưởng). Mọi phần trăm lấy từ quy tắc của nhiệm kỳ.
- `xetCertificate_`: log và task đều đạt 80% thì cấp. Mỗi phần từ 60% thì xét bù trừ: người vào ở giai đoạn g được xếp hạng theo điểm từ giai đoạn g trở đi, cùng mọi người đã có mặt từ giai đoạn g trở về trước; lọt top 40% thì cấp. Phần chưa được giao việc gì coi như đạt.
- Trang báo các task chờ đánh giá và đợt log chưa chốt, vì kết quả lúc đó còn tạm tính. Ở giai đoạn 1, chứng nhận chỉ là tạm tính.
- Tab **Nhiệm kỳ trước** đọc kết quả đã lưu trong KetQuaNhiemKy (`layKetQuaNhiemKy`).

## Thông báo (`src/ThongBao.gs`)

- Nhắc hạn task và nhắc seeding gửi theo cách mỗi người chọn (ít nhất một): Zalo, app trên điện thoại, mail (`guiThongBao_`). HR phụ trách ban được nhắc task của thành viên các ban đó. Ai muốn tự nhận nhắc task của mình thì bật "Tự nhắc task của tôi" (cột TaiKhoan `TuNhac`).
- Các thông báo khác chỉ gửi qua mail (`guiMailThongBao_`): góp ý mới, thư UCV chờ duyệt, báo cáo seeding mới (cho BOD, bật tắt ở Cài đặt, Thông báo khác), kết quả duyệt thư (cho UCV).
- Thông báo trên app (Web Push chuẩn, không qua dịch vụ ngoài): máy chủ tự tạo cặp khoá VAPID P-256 lần đầu, ký JWT ES256 bằng code thuần (`kyP256_` trong `Logic.gs`), rồi gửi một yêu cầu không có nội dung tới địa chỉ đẩy tin của trình duyệt (chỉ máy chủ của Google, Apple, Mozilla, Microsoft). Service worker của trang vỏ nhận tin, hỏi `exec?tb=<mã máy>` để lấy nội dung rồi hiện thông báo. Địa chỉ báo 404/410 thì xoá khỏi ThietBi. iPhone cần iOS 16.4 trở lên và phải mở app từ màn hình chính.

## Nhắc việc qua Zalo (`src/Zalo.gs`)

- Gọi Zalo Bot API (`getMe`, `getUpdates`, `sendMessage`). Tin dài hơn 2000 ký tự được chia nhỏ.
- Kết nối: mỗi tài khoản có một mã 6 ký tự. Họ nhắn mã đó cho bot; app đọc tin mới bằng `getUpdates` (khi bấm Kiểm tra, và trước mỗi lần nhắc) rồi lưu ID Zalo.
- Lịch nhắc gồm nhiều mốc, mỗi mốc là một ngày so với hạn chót và một giờ (CaiDat `LichNhac`). Chưa ai chỉnh thì dùng lịch trong tài liệu training HR: 20:00 trước hạn 1 ngày, 07:00 ngày hạn, 07:00 sau hạn 1 ngày. Mỗi giờ là một lịch chạy `nhacViecHangNgay`. Lịch chạy cả khi chưa có bot Zalo (gửi theo mail, app).
- Đổi sang mã bot mới thì mọi kết nối cũ bị xoá, mọi người nhắn mã lại cho bot mới.

## Mail (`src/Mail.gs`)

- Mọi thư gửi bằng Gmail của tài khoản CLB.
- Mọi thao tác thay đổi hộp thư của UCV (soạn, trả lời, chuyển tiếp, lưu trữ, xoá, báo thư rác, gắn và bỏ nhãn) thành một dòng ViecMail. BOD chọn Đã duyệt (thực hiện ngay trên Gmail), Cần sửa lại, hoặc Từ chối, kèm ghi chú.
- Tệp UCV đính kèm được lưu ở thư mục con "Đính kèm mail" của thư mục app.
- Nội dung thư đến hiển thị trong khung riêng không chạy được mã (sandbox).
- BOD không viết thư trong app. Thư mẫu là thư nháp trong Gmail của CLB; app liệt kê, xem trước và mở thẳng thư nháp trong Gmail.
- UCV viết thư trong app (khung soạn có định dạng, đính kèm, trích dẫn thư cũ, chữ ký CLB) rồi gửi BOD duyệt. Chữ ký lấy từ chữ ký mặc định trong Gmail của CLB; Cài đặt chỉ bật hay tắt (CaiDat `DungChuKy`).
- **Gửi hàng loạt:** chọn một thư nháp Gmail, người nhận (thành viên lọc theo ban, danh bạ, nhập tay, hoặc Google Sheet), xem trước rồi gửi ngay hoặc hẹn giờ. `{Tên cột}` hoặc `{{Tên cột}}` được thay bằng thông tin người nhận, so khớp không phân biệt dấu, hoa thường, khoảng trắng; thiếu cột thì không cho gửi. Kiểm tra số thư còn gửi được trong ngày trước khi gửi. Mỗi đợt (gửi ngay hay hẹn giờ) đều ghi vào LichGui.

## Báo cáo điểm (`src/BaoCao.gs`)

- Chọn khoảng thời gian: tháng, giai đoạn, nhiệm kỳ (từ bảng GiaiDoan), hoặc tự chọn. Xem theo thành viên, theo ban (gộp theo nhóm), hoặc cả CLB. Chỉ tính thành viên, không tính BOD.
- Chỉ số: điểm, số lần mỗi loại hoạt động, task đã xong, task trễ hạn. Biểu đồ chia mốc theo ngày, tuần hoặc tháng tuỳ độ dài khoảng.
- Xuất Excel: tạo Google Sheet tạm, tải về dạng .xlsx rồi chuyển sheet tạm vào thùng rác.

## File đăng ký log

- Cài đặt có link Google Sheet mẫu (`LinkMauLog`) và thư mục Drive để lưu (`LinkThuMucLog`).
- File tạo ra mở cho "bất kỳ ai có link" với quyền chỉnh sửa; tab Đăng ký log đã khoá, chỉ chừa ô tích và Ghi chú.
- Mẫu có tab "Đăng ký log": người được chọn xếp theo ban, mỗi buổi một cột ô tích, dòng 3 đếm số người tích. Mẫu khác: app tìm dòng tiêu đề có cột Họ và tên, điền người được chọn, thêm mỗi buổi một cột ô đánh dấu.

## Báo cáo seeding (`src/Seeding.gs`)

- BOD đánh dấu HR "Phụ trách seeding" ở Cài đặt, Phân quyền HR (cột `NhomHr`, mã `SUP-SEED`).
- Mỗi báo cáo: link bài, danh sách tên react và comment. Tên khớp Tên Facebook trước, không có thì khớp Họ và tên (bỏ dấu, chữ thường). BOD không được cộng.
- Mỗi bài chỉ một báo cáo. Chưa đủ 48 giờ hoặc quá 7 ngày thì chỉ cảnh báo. Người gửi hoặc BOD huỷ được báo cáo: điểm của báo cáo bị gỡ, rồi điền lại được.

## Ảnh thành tích (`src/ThanhTich.gs`, `src/EcoAnh.html`)

- Mọi người trừ BOD. `layThanhTich` trả điểm giai đoạn, hạng, top, KPI log, KPI task, số lần được cộng điểm và 3 hoạt động nhiều nhất của chính người đăng nhập. Ảnh 1080 × 1920 vẽ bằng canvas trên trình duyệt, tải về hoặc chia sẻ trực tiếp nếu máy hỗ trợ.

## Trang vỏ (`pwa/`) và đăng nhập Google

- `pwa/app/` là trang có manifest để cài app. Trang mở ứng dụng web Apps Script toàn màn hình trong một khung (iframe); link ứng dụng web ở `pwa/config.js`. `pwa/home/`, `pwa/board/`, `pwa/desk/` chỉ chuyển sang `app/`. Trang gốc để dành cho website của CLB sau này, hiện chỉ chuyển sang `app/`.
- Địa chỉ từng trang: app báo trang vỏ mỗi lần đổi trang, trang vỏ ghi vào địa chỉ dạng `app/#/task`; bấm quay lại thì trang vỏ báo app mở lại trang đó. Mở app thẳng trên script.google.com thì dùng `google.script.history`.
- `pwa/sw.js` giữ sẵn file của trang vỏ (cần cho việc cài app); dữ liệu luôn lấy trực tiếp từ Apps Script.
- Đăng nhập Google: app (trong khung) chào trang vỏ bằng `postMessage`; nếu CLB đã nhập Client ID (CaiDat `GoogleClientId`), màn hình đăng nhập có nút Google. Trang vỏ hiện nút đăng nhập chính thức của Google, nhận ID token rồi gửi vào app. Máy chủ hỏi lại Google (`oauth2.googleapis.com/tokeninfo`), kiểm tra đúng Client ID, email đã xác minh, còn hạn, rồi tìm tài khoản theo email.
- Ghi nhớ đăng nhập: phiên lưu cả trong khung lẫn ở trang vỏ (`eco_phien_vo`), vì điện thoại hay xoá bộ nhớ của khung bên trong; trang vỏ gửi lại phiên khi app mở.
- Khoảng an toàn (tai thỏ, thanh điều hướng): trang vỏ đo bằng `env(safe-area-inset-*)` rồi gửi vào app. App gửi màu thanh tiêu đề để trang vỏ tô phần tai thỏ và thanh vuốt cùng màu.
- Icon: `tab-eco.png` cho tab trình duyệt; `apple-eco.png` cho iPhone; `eco-192.png`, `eco-512.png` cho Android; `badge-96.png` cho thanh trạng thái Android.
- Trang vỏ chỉ trao đổi với trang thuộc `script.google.com` hoặc `*.googleusercontent.com`.

## Giao diện

- Mở app là vào Trang chủ: khung chào có bầu trời đổi theo buổi và một câu hỏi thăm ngẫu nhiên (`CAU_HOI` trong `DungChung.html`), thêm các ô tóm tắt theo vai trò (`layTrangChu`). Màn chờ có lá bay kèm câu đùa (`CAU_CHO`).
- Lưới ô chia đều bằng `chiaDeu` trong `DeskChung.html`: ít hàng nhất, số ô mỗi hàng chênh tối đa 1.
- Thẻ người dùng: BOD hiện chức vụ lấy từ danh sách thành viên, vai trò khác hiện BOD/HR/UCV.
- Cài đặt nhớ vị trí cuộn và nội dung ô tìm khi mở một mục rồi quay lại (`CUON_CAI_DAT`).
- **Giao diện theo mùa và ngày lễ:** BOD chọn ở Cài đặt (CaiDat `ChuDe`). Danh sách mã ở `CHU_DE` (Logic.gs) và `DS_CHU_DE` (ChuDe.html); test `tests/chude.test.js` bắt hai bên phải khớp. `doGet` gắn `data-chude` vào thẻ html ngay khi tạo trang nên không bị nháy màu. Mỗi người tắt được hiệu ứng rơi trên máy mình.

## Các cài đặt khác lưu ở đâu

| Mục | Lưu ở |
|---|---|
| Cơ cấu ban | bảng Ban |
| Quy tắc chỉnh được | CaiDat `QuyTac` (mặc định cho nhiệm kỳ sau) và bảng NhiemKy cột QuyTac (bản của từng nhiệm kỳ) |
| Thang điểm | bảng LoaiHoatDong |
| Quy chế (link file Docs) | CaiDat `QuyChe` |
| Link ghim | bảng BangGhim |
| Mail báo BOD | CaiDat `BaoGopYQuaMail`, `BaoThuChoDuyet`, `BaoSeedingMoi` |
| Ảnh nền trang đăng nhập | CaiDat `AnhNenId` (file trong thư mục con Ảnh nền), `AnhNenPhienBan` |
| Chữ ký Gmail trong thư UCV | CaiDat `DungChuKy` |
| Client ID đăng nhập Google | CaiDat `GoogleClientId` |
| Lịch nhắc task | CaiDat `LichNhac`, `LichNhacTheoMa` |
| Bot Zalo | mã bot trong thuộc tính dự án; CaiDat `ZaloTenBot`, `ZaloLanNhacCuoi`; người nhận ở bảng KetNoiZalo |
| Mật khẩu chung | thuộc tính dự án (chỉ bản băm) |
| Lịch sinh nhật | CaiDat `LichSinhNhat` (ID lịch theo từng nhiệm kỳ) |
| Link sheet danh sách thành viên lần trước | CaiDat `LinkSheetThanhVien` |
| HR, UCV, phân ban, cách nhận thông báo | bảng TaiKhoan |
| Danh bạ gửi hàng loạt | bảng DanhBa; thành viên có email luôn có sẵn |
| Sheet mẫu và thư mục file đăng ký log | CaiDat `LinkMauLog`, `LinkThuMucLog` |
| Giao diện theo mùa | CaiDat `ChuDe` |

## Kiểm thử và triển khai

- `tests/` kiểm thử các hàm thuần trong `Logic.gs` và một phần máy chủ (chạy `npm test`).
- `.github/workflows/day-len-gas.yml`: khi gộp vào `main`, chạy `npm test`, rồi `clasp push` mã trong `src/` lên dự án có ID ở secret `SCRIPT_ID`, và cập nhật bản triển khai `DEPLOYMENT_ID` (link app giữ nguyên). Cần thêm secret `CLASPRC_JSON`. Xem `docs/huong-dan-cai-dat.md`.
