/**
 * Báo cáo seeding trong app eco, thay cho Google Form seeding.
 * HR nhóm SUP-SEED (BOD chọn trong Cài đặt, Tài khoản HR) dán link bài đăng, giờ đăng và tên những người
 * đã react, comment trong 48 giờ. App dò tên với danh sách thành viên và tự cộng điểm theo loại hoạt động
 * đang gắn với react, comment. Mỗi bài chỉ có một báo cáo; BOD huỷ được để điền lại.
 */

var SO_BAO_CAO_SEEDING_HIEN = 30;

function canBaoCaoSeeding_(tk) {
  if (!duocBaoCaoSeeding_(tk)) throw new Error('Chỉ HR nhóm SUP-SEED và BOD điền được báo cáo seeding.');
  return tk;
}

/** Trang Báo cáo seeding: mức điểm đang dùng và các báo cáo gần đây của nhiệm kỳ này. */
function layBaoCaoSeeding(phien) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  var ky = layKyHienTai_();
  var loai = docBang_('LoaiHoatDong');
  var muc = function (dc) { var l = loaiDungCho_(loai, dc); return l ? { ten: String(l.TenLoai), diem: Number(l.Diem) || 0 } : null; };
  var tv = docBang_('ThanhVien').filter(khongPhaiBod_);
  return {
    ky: ky ? { nhiemKy: String(ky.NhiemKy), hocKy: Number(ky.HocKy) } : null,
    react: muc(DUNG_CHO.REACT),
    comment: muc(DUNG_CHO.COMMENT),
    thieuFb: tv.filter(function (t) { return !chuanTenFb_(t.TenFacebook); }).length,
    laBod: String(tk.VaiTro) === 'BOD',
    nhac: cacNhacSeedingCua_(tk.Email),
    ds: docBangNhiemKy_('BaoCaoSeeding', 'ThoiGian').map(function (b) {
      return {
        thoiGian: new Date(b.ThoiGian).getTime(), nguoiNop: String(b.NguoiNop), link: String(b.LinkBai),
        lucDang: b.LucDang ? new Date(b.LucDang).getTime() : 0,
        react: tachDanhSach_(b.React), comment: tachDanhSach_(b.Comment), khongKhop: tachDanhSach_(b.KhongKhop),
        daHuy: String(b.TrangThai) === 'Đã huỷ', nguoiHuy: String(b.NguoiHuy || '')
      };
    }).sort(function (a, b) { return b.thoiGian - a.thoiGian; }).slice(0, SO_BAO_CAO_SEEDING_HIEN)
  };
}

function tachDanhSach_(s) {
  return String(s == null ? '' : s).split(',').map(function (x) { return x.trim(); }).filter(String);
}

function chuanBiBaoCaoSeeding_(tk, yc, bayGio) {
  return taoBaoCaoSeeding_(yc, docBang_('ThanhVien').filter(khongPhaiBod_), docBang_('LoaiHoatDong'), layKyHienTai_(),
    String(tk.HoVaTen), bayGio, docBangNhiemKy_('BaoCaoSeeding', 'ThoiGian'), docBang_('LichSuDiem'));
}

/** Xem trước: ai được cộng, tên nào không khớp, cảnh báo 48 giờ. Chưa ghi gì. */
function xemTruocBaoCaoSeeding(phien, yc) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  var kq = chuanBiBaoCaoSeeding_(tk, yc, new Date());
  if (kq.loi) throw new Error(kq.loi);
  var diem = 0;
  kq.dong.forEach(function (d) { diem += Number(d.Diem) || 0; });
  return { react: kq.react, comment: kq.comment, khongKhop: kq.khongKhop, canhBao: kq.canhBao, soLuot: kq.dong.length, diem: diem };
}

/** Gửi báo cáo và cộng điểm. */
function guiBaoCaoSeeding(phien, yc) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  return voiKhoa_(function () {
    var kq = chuanBiBaoCaoSeeding_(tk, yc, new Date());
    if (kq.loi) throw new Error(kq.loi);
    themDong_('BaoCaoSeeding', [kq.bao]);
    themDong_('LichSuDiem', kq.dong);
    xoaBoNhoTam_();
    return { soNguoi: kq.react.concat(kq.comment.filter(function (t) { return kq.react.indexOf(t) < 0; })).length, soLuot: kq.dong.length };
  });
}

/**
 * Huỷ một báo cáo (BOD, hoặc chính người đã gửi): xoá các lần cộng điểm của báo cáo đó, báo cáo giữ lại với trạng thái Đã huỷ.
 * Sau khi huỷ, điền lại được báo cáo cho bài đó.
 */
function huyBaoCaoSeeding(phien, thoiGianMs) {
  var tk = canBaoCaoSeeding_(canDangNhap_(phien));
  return voiKhoa_(function () {
    var sh = bangDuLieu_('BaoCaoSeeding');
    var v = sh.getDataRange().getValues(), td = v[0];
    var cT = td.indexOf('ThoiGian'), cN = td.indexOf('NguoiNop'), cS = td.indexOf('TrangThai'), cH = td.indexOf('NguoiHuy');
    for (var r = 1; r < v.length; r++) {
      if (new Date(v[r][cT]).getTime() !== Number(thoiGianMs)) continue;
      if (String(v[r][cS]) === 'Đã huỷ') throw new Error('Báo cáo này đã được huỷ trước đó.');
      if (String(tk.VaiTro) !== 'BOD' && String(v[r][cN]) !== String(tk.HoVaTen)) throw new Error('Bạn chỉ huỷ được báo cáo của mình. Báo cáo của người khác nhờ BOD huỷ.');
      sh.getRange(r + 1, cS + 1).setValue('Đã huỷ');
      sh.getRange(r + 1, cH + 1).setValue(String(tk.HoVaTen));
      var ls = bangDuLieu_('LichSuDiem');
      var w = ls.getDataRange().getValues();
      var lT = w[0].indexOf('ThoiGian'), lN = w[0].indexOf('NguoiCong'), xoa = 0;
      for (var i = w.length - 1; i >= 1; i--) {
        if (new Date(w[i][lT]).getTime() === Number(thoiGianMs) && String(w[i][lN]).indexOf('Seeding: ') === 0) { ls.deleteRow(i + 1); xoa++; }
      }
      xoaBoNhoTam_();
      return xoa;
    }
    throw new Error('Không tìm thấy báo cáo này.');
  });
}
