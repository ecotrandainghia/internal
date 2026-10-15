/**
 * Cài đặt cơ cấu ban và quy tắc (chỉ BOD). Những gì CLB có thể đổi theo năm đều chỉnh ở đây, không cần sửa code:
 * - Cơ cấu ban: thêm ban, đổi tên, gộp nhóm, chữ viết tắt trong mã thành viên, ban giải thể (giữ để xem dữ liệu cũ).
 * - Quy tắc chỉnh được (CHINH_DUOC trong Logic.gs): % top khen thưởng, số ngày "sắp đến hạn", trễ bao lâu thì
 *   "không hoàn thành", các thời lượng buổi log. Các quy tắc khác cố định theo quy chế.
 * Thang điểm hoạt động lưu ở luuLoaiHoatDong (MayChuDesk.gs).
 */

function luuCoCau(phien, ds) {
  canDangNhap_(phien, 'caidat');
  var kq = chuanHoaCoCau_(ds);
  if (kq.loi) throw new Error(kq.loi);
  var co = {};
  kq.ds.forEach(function (b) { co[b.ma] = b; });
  var thieu = [];
  docThanhVien_().forEach(function (t) { var b = chuanChu_(t.Ban); if (b && !co[b] && thieu.indexOf(b) < 0) thieu.push(b); });
  if (thieu.length) throw new Error('Còn thành viên đang ở ban ' + thieu.join(', ') + '. Muốn bỏ ban, hãy đánh dấu "Đã giải thể" thay vì xoá, hoặc chuyển thành viên sang ban khác trước.');
  // Chữ viết tắt đã dùng trong mã thành viên thì không đổi được (mã không bao giờ đổi).
  var cu = docCoCau_(), daDung = {};
  docBang_('ThanhVien').forEach(function (t) { var m = docMaThanhVien_(t.MaTV); if (m) daDung[m.ban] = true; });
  cu.forEach(function (b) {
    var moi = co[b.ma];
    if (moi && moi.vietTat !== b.vietTat && daDung[b.vietTat]) throw new Error('Ban ' + b.ma + ' đã có mã thành viên dùng chữ ' + b.vietTat + ' nên không đổi chữ viết tắt được.');
  });
  voiKhoa_(function () { ghiCoCau_(kq.ds); });
  xoaBoNhoTam_();
  CacheService.getScriptCache().remove('xephang');
  return kq.ds;
}

/** Lưu các quy tắc chỉnh được. Áp cho nhiệm kỳ đang chạy và các nhiệm kỳ sau; nhiệm kỳ cũ giữ quy tắc cũ. */
function luuQuyTac(phien, yc) {
  canDangNhap_(phien, 'caidat');
  yc = yc || {};
  var qt = chepSau_(quyTac_());
  CHINH_DUOC.forEach(function (k) { if (yc[k] !== undefined) qt[k] = yc[k]; });
  var chuan = chuanHoaQuyTac_(qt);
  CHINH_DUOC.forEach(function (k) {
    if (yc[k] !== undefined && JSON.stringify(chuan[k]) !== JSON.stringify(Array.isArray(yc[k]) ? yc[k].map(Number).sort(function (a, b) { return a - b; }) : Number(yc[k]))) {
      throw new Error({ tiLeTop: 'Phần trăm top phải là số nguyên từ 1 đến 100.', sapDenHanNgay: 'Số ngày "sắp đến hạn" phải từ 0 đến 30.',
        khtSauNgay: 'Số ngày trễ phải từ 0 đến 60.', thoiLuongBuoi: 'Thời lượng buổi log là số phút từ 15 đến 600, không trùng nhau, tối đa 4 loại.' }[k]);
    }
  });
  luuQuyTac_(chuan);
  CacheService.getScriptCache().remove('xephang');
  return chuan;
}
