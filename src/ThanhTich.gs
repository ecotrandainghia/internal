/**
 * Ảnh thành tích để đăng story: số liệu của chính người đang đăng nhập (điểm, hạng, top, KPI, hoạt động).
 * Ảnh được vẽ trên trình duyệt; máy chủ chỉ trả số liệu. BOD không có điểm và KPI nên không dùng.
 */
function layThanhTich(phien) {
  var tk = canDangNhap_(phien);
  if (String(tk.VaiTro) === 'BOD') throw new Error('BOD không có điểm và KPI nên không tạo ảnh thành tích.');
  var ten = String(tk.HoVaTen), k = ten.toLowerCase();
  var tv = docThanhVien_().filter(function (t) { return String(t.HoVaTen).toLowerCase() === k; })[0];
  if (!tv) throw new Error('Không thấy bạn trong danh sách thành viên nhiệm kỳ này.');
  var board = duLieuBoard_(), ky = board.ky;
  var xh = board.thanhVien.filter(function (p) { return p.diem !== null && p.diem !== undefined; });
  var toi = board.thanhVien.filter(function (p) { return p.ten.toLowerCase() === k; })[0] || { diem: 0, top: false, gd: [], topGd: [] };
  var hang = 1 + xh.filter(function (p) { return p.diem > toi.diem; }).length;
  var kpi = kpiCuaNguoi_(tv, docTask_(), mocGiaiDoanNay_(), docSuKienLog_());
  // Hoạt động được cộng điểm trong nhiệm kỳ, nhiều nhất trước.
  var dem = {}, soLan = 0;
  if (ky) docBang_('LichSuDiem').forEach(function (d) {
    if (String(d.HoVaTen).toLowerCase() !== k || String(d.NhiemKy) !== String(ky.nhiemKy)) return;
    var l = String(d.LoaiHoatDong);
    dem[l] = (dem[l] || 0) + 1; soLan++;
  });
  return {
    ten: ten, maTV: String(tv.MaTV || ''), ban: String(tv.Ban || ''), ky: ky, tiLeTop: board.quyTac.tiLeTop,
    diem: toi.diem || 0, caKy: toi.caKy === undefined ? null : toi.caKy, hang: toi.diem ? hang : null, soNguoi: xh.length,
    top: !!toi.top, topGd: toi.topGd || [], topCaKy: !!toi.topCaKy,
    log: kpi.log.tiLe, task: phanTramTaskCert_(kpi),
    soLan: soLan,
    hoatDong: Object.keys(dem).map(function (l) { return { ten: l, so: dem[l] }; }).sort(function (a, b) { return b.so - a.so; }).slice(0, 3)
  };
}
