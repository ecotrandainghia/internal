/**
 * Thông báo đẩy lên app trên điện thoại (Web Push), làm theo app cũ.
 * Apps Script không có sẵn mã hoá đường cong P-256 nên app tự tính bằng BigInt: ký JWT VAPID (ES256, RFC 6979)
 * và mã hoá nội dung (RFC 8291, aes128gcm) để điện thoại hiện thông báo ngay, không phải hỏi lại máy chủ.
 * Cặp khoá VAPID của CLB tự tạo lần đầu, cất trong thuộc tính dự án. Đổi khoá thì mọi máy phải bật lại thông báo.
 */

var VAPID_PROP = 'VAPID_PRIVATE_KEY';

/* ---------- Byte và base64url ---------- */

function signedBytes_(b) { return b.map(function (x) { x = x & 255; return x > 127 ? x - 256 : x; }); }
function unsignedBytes_(b) { return b.map(function (x) { return x & 255; }); }
function hmacSha256_(key, data) { return unsignedBytes_(Utilities.computeHmacSha256Signature(signedBytes_(data), signedBytes_(key))); }
function textBytes_(s) { return unsignedBytes_(Utilities.newBlob(String(s)).getBytes()); }
function asciiBytes_(s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return b; }

/** base64url không có dấu = từ mảng byte. */
function base64Url_(b) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', s = '';
  for (var i = 0; i < b.length; i += 3) {
    var n = ((b[i] & 255) << 16) | (((b[i + 1] || 0) & 255) << 8) | ((b[i + 2] || 0) & 255);
    s += A.charAt((n >> 18) & 63) + A.charAt((n >> 12) & 63) + (i + 1 < b.length ? A.charAt((n >> 6) & 63) : '') + (i + 2 < b.length ? A.charAt(n & 63) : '');
  }
  return s;
}
function base64UrlBytes_(s) {
  var t = String(s).replace(/=+$/, '');
  while (t.length % 4) t += '=';
  return unsignedBytes_(Utilities.base64DecodeWebSafe(t));
}
function randomBytes_(n) {
  var out = [];
  while (out.length < n) out = out.concat(unsignedBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now())));
  return out.slice(0, n);
}

/* ---------- Đường cong P-256 ---------- */

var P256_ = null;
function p256_() {
  if (P256_) return P256_;
  var B = function (h) { return BigInt('0x' + h); };
  P256_ = {
    p: B('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: B('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    G: [B('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), B('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')],
    ZERO: BigInt(0), ONE: BigInt(1), TWO: BigInt(2), THREE: BigInt(3)
  };
  return P256_;
}
function modP_(a, m) { var r = a % m; return r < p256_().ZERO ? r + m : r; }
function invP_(a, m) {
  var c = p256_(), t = c.ZERO, t2 = c.ONE, r = m, r2 = modP_(a, m);
  while (r2 !== c.ZERO) { var q = r / r2, x = t - q * t2; t = t2; t2 = x; x = r - q * r2; r = r2; r2 = x; }
  return modP_(t, m);
}
function addPoint_(A, B) {
  var c = p256_();
  if (!A) return B;
  if (!B) return A;
  var l;
  if (A[0] === B[0]) {
    if (modP_(A[1] + B[1], c.p) === c.ZERO) return null;
    l = modP_(c.THREE * A[0] * A[0] - c.THREE, c.p) * invP_(c.TWO * A[1], c.p);
  } else {
    l = modP_(B[1] - A[1], c.p) * invP_(B[0] - A[0], c.p);
  }
  l = modP_(l, c.p);
  var x = modP_(l * l - A[0] - B[0], c.p);
  return [x, modP_(l * (A[0] - x) - A[1], c.p)];
}
function mulPoint_(k, P) {
  var c = p256_(), R = null, Q = P;
  while (k > c.ZERO) { if (k & c.ONE) R = addPoint_(R, Q); Q = addPoint_(Q, Q); k = k >> c.ONE; }
  return R;
}
function bigToBytes_(x, len) {
  var h = x.toString(16);
  while (h.length < len * 2) h = '0' + h;
  var b = [];
  for (var i = 0; i < len * 2; i += 2) b.push(parseInt(h.substr(i, 2), 16));
  return b;
}
function bytesToBig_(b) {
  var h = '';
  for (var i = 0; i < b.length; i++) h += ((b[i] & 255) + 256).toString(16).slice(1);
  return BigInt('0x' + (h || '0'));
}

/** Khoá công khai 65 byte (04 || X || Y) từ khoá riêng 32 byte. */
function p256PublicKey_(priv) {
  var c = p256_(), d = bytesToBig_(priv);
  if (d <= c.ZERO || d >= c.n) throw new Error('Khoá riêng không hợp lệ.');
  var Q = mulPoint_(d, c.G);
  return [4].concat(bigToBytes_(Q[0], 32), bigToBytes_(Q[1], 32));
}

/** Ký ECDSA P-256 (RFC 6979, số k sinh từ khoá và nội dung). hash: 32 byte SHA-256. Trả về 64 byte r || s. */
function p256Sign_(hash, priv) {
  var c = p256_(), d = bytesToBig_(priv), z = bytesToBig_(hash);
  var x = bigToBytes_(d, 32), h1 = bigToBytes_(modP_(z, c.n), 32);
  var V = [], K = [], i;
  for (i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmacSha256_(K, V.concat([0], x, h1)); V = hmacSha256_(K, V);
  K = hmacSha256_(K, V.concat([1], x, h1)); V = hmacSha256_(K, V);
  for (var round = 0; round < 100; round++) {
    V = hmacSha256_(K, V);
    var k = bytesToBig_(V);
    if (k > c.ZERO && k < c.n) {
      var R = mulPoint_(k, c.G), r = modP_(R[0], c.n);
      if (r !== c.ZERO) {
        var s = modP_(invP_(k, c.n) * modP_(z + r * d, c.n), c.n);
        if (s !== c.ZERO) return bigToBytes_(r, 32).concat(bigToBytes_(s, 32));
      }
    }
    K = hmacSha256_(K, V.concat([0])); V = hmacSha256_(K, V);
  }
  throw new Error('Không ký được.');
}

/** Khoá riêng 32 byte hợp lệ trên P-256. */
function newP256Key_() {
  for (var i = 0; i < 5; i++) {
    var b = randomBytes_(32);
    try { p256PublicKey_(b); return b; } catch (e) { /* thử số khác */ }
  }
  throw new Error('Không tạo được khoá.');
}

/* ---------- AES-128-GCM ---------- */

var AES_SBOX_ = null;
function aesSbox_() {
  if (AES_SBOX_) return AES_SBOX_;
  var sbox = [], x = 1, y = 1;
  do {
    x = (x ^ ((x << 1) & 255) ^ (x & 128 ? 0x1b : 0)) & 255;
    y ^= (y << 1) & 255; y ^= (y << 2) & 255; y ^= (y << 4) & 255; y &= 255; if (y & 128) y ^= 0x09;
    var b = y ^ ((y << 1) | (y >> 7)) ^ ((y << 2) | (y >> 6)) ^ ((y << 3) | (y >> 5)) ^ ((y << 4) | (y >> 4));
    sbox[x] = (b ^ 0x63) & 255;
  } while (x !== 1);
  sbox[0] = 0x63;
  AES_SBOX_ = sbox;
  return sbox;
}
function xtime_(a) { return ((a << 1) ^ (a & 128 ? 0x1b : 0)) & 255; }
function aesExpandKey_(key) {
  var S = aesSbox_(), w = key.slice(0, 16), rcon = 1;
  for (var i = 16; i < 176; i += 4) {
    var t = w.slice(i - 4, i);
    if (i % 16 === 0) { t = [S[t[1]] ^ rcon, S[t[2]], S[t[3]], S[t[0]]]; rcon = xtime_(rcon); }
    for (var j = 0; j < 4; j++) w.push(w[i - 16 + j] ^ t[j]);
  }
  return w;
}
function aesBlock_(w, input) {
  var S = aesSbox_(), s = [], r, c, i;
  for (i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
  for (r = 1; r <= 10; r++) {
    var t = [];
    for (i = 0; i < 16; i++) t[i] = S[s[(i + 4 * (i % 4)) % 16]];
    if (r < 10) {
      for (c = 0; c < 16; c += 4) {
        var a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3], e = a0 ^ a1 ^ a2 ^ a3;
        t[c] ^= e ^ xtime_(a0 ^ a1); t[c + 1] ^= e ^ xtime_(a1 ^ a2); t[c + 2] ^= e ^ xtime_(a2 ^ a3); t[c + 3] ^= e ^ xtime_(a3 ^ a0);
      }
    }
    for (i = 0; i < 16; i++) s[i] = t[i] ^ w[16 * r + i];
  }
  return s;
}
function gfMul_(X, Y) {
  var Z = [], V = Y.slice(), i, j;
  for (i = 0; i < 16; i++) Z[i] = 0;
  for (i = 0; i < 128; i++) {
    if ((X[i >> 3] >> (7 - (i & 7))) & 1) for (j = 0; j < 16; j++) Z[j] ^= V[j];
    var low = V[15] & 1;
    for (j = 15; j > 0; j--) V[j] = ((V[j] >> 1) | ((V[j - 1] & 1) << 7)) & 255;
    V[0] >>= 1;
    if (low) V[0] ^= 0xe1;
  }
  return Z;
}
/** Bản mã nối thẻ xác thực 16 byte. Nonce 12 byte, không có AAD. */
function aesGcmEncrypt_(key, nonce, data) {
  var w = aesExpandKey_(key), H = aesBlock_(w, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  var counter = function (n) { return nonce.slice(0, 12).concat([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); };
  var out = [], g = [], i, j;
  for (i = 0; i < 16; i++) g[i] = 0;
  for (i = 0; i < data.length; i += 16) {
    var k = aesBlock_(w, counter(2 + i / 16)), block = [];
    for (j = 0; j < 16 && i + j < data.length; j++) { var m = (data[i + j] ^ k[j]) & 255; out.push(m); block.push(m); }
    while (block.length < 16) block.push(0);
    for (j = 0; j < 16; j++) g[j] ^= block[j];
    g = gfMul_(g, H);
  }
  var bits = data.length * 8, lens = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255];
  for (j = 0; j < 16; j++) g[j] ^= lens[j];
  g = gfMul_(g, H);
  var e0 = aesBlock_(w, counter(1));
  for (j = 0; j < 16; j++) out.push((g[j] ^ e0[j]) & 255);
  return out;
}

/**
 * Thân tin Web Push đã mã hoá (RFC 8291). data: byte nội dung; deviceKey: 65 byte p256dh; auth: 16 byte;
 * priv: 32 byte khoá tạm của máy chủ; salt: 16 byte ngẫu nhiên.
 */
function encryptPush_(data, deviceKey, auth, priv, salt) {
  if (deviceKey.length !== 65 || deviceKey[0] !== 4 || auth.length !== 16) throw new Error('Khoá của máy không hợp lệ.');
  var pub = p256PublicKey_(priv);
  var shared = mulPoint_(bytesToBig_(priv), [bytesToBig_(deviceKey.slice(1, 33)), bytesToBig_(deviceKey.slice(33, 65))]);
  if (!shared) throw new Error('Khoá của máy không hợp lệ.');
  var secret = bigToBytes_(shared[0], 32);
  var ikm = hmacSha256_(hmacSha256_(auth, secret), asciiBytes_('WebPush: info').concat([0], deviceKey, pub, [1]));
  var prk = hmacSha256_(salt, ikm);
  var cek = hmacSha256_(prk, asciiBytes_('Content-Encoding: aes128gcm').concat([0, 1])).slice(0, 16);
  var nonce = hmacSha256_(prk, asciiBytes_('Content-Encoding: nonce').concat([0, 1])).slice(0, 12);
  var cipher = aesGcmEncrypt_(cek, nonce, data.concat([2]));
  return salt.slice(0, 16).concat([0, 0, 16, 0, 65], pub, cipher);
}

/* ---------- Gửi ---------- */

/** Phần gốc https://máy-chủ của địa chỉ nhận tin; '' nếu không phải https. */
function pushOrigin_(url) {
  var m = /^https:\/\/[^\/?#]+/i.exec(String(url || ''));
  return m ? m[0] : '';
}

/** Chỉ gửi tới máy chủ thông báo đẩy của Google, Apple, Mozilla, Microsoft. */
function pushEndpointValid_(url) {
  var o = pushOrigin_(url).toLowerCase();
  return !!o && String(url).length < 1000 &&
    /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(o);
}

/** Cặp khoá VAPID của CLB: { priv: 32 byte, pub: chuỗi base64url của khoá công khai }. */
function vapidKeys_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(VAPID_PROP), priv = raw ? JSON.parse(raw) : null;
  if (!priv) { priv = newP256Key_(); props.setProperty(VAPID_PROP, JSON.stringify(priv)); }
  return { priv: priv, pub: base64Url_(p256PublicKey_(priv)) };
}

/** JWT VAPID cho một máy chủ thông báo, nhớ 11 giờ (JWT sống 12 giờ). */
function vapidJwt_(origin, keys) {
  var cache = CacheService.getScriptCache(), k = 'vapid_' + origin, hit = cache.get(k);
  if (hit) return hit;
  var part = function (o) { return base64Url_(textBytes_(JSON.stringify(o))); };
  var head = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud: origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + clubEmail_() });
  var hash = unsignedBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, head, Utilities.Charset.UTF_8));
  var jwt = head + '.' + base64Url_(p256Sign_(hash, keys.priv));
  cache.put(k, jwt, 11 * 3600);
  return jwt;
}

/**
 * Gửi một thông báo tới các máy. Nội dung theo dạng trang vỏ đang đọc ({ tieuDe, noiDung }).
 * Trả về { sent: số máy nhận, report: [câu], gone: [endpoint máy đã tắt thông báo] }.
 */
function pushToDevices_(devices, title, body) {
  var out = { sent: 0, report: [], gone: [] };
  if (!devices.length) { out.report.push('App: chưa có máy nào bật thông báo.'); return out; }
  var keys = vapidKeys_();
  var payload = textBytes_(JSON.stringify({ tieuDe: String(title).slice(0, 100), noiDung: String(body).slice(0, 900) }));
  devices.forEach(function (d) {
    var name = 'App (' + (d.device_name || 'máy') + ')', url = String(d.endpoint), code = 0, text = '';
    if (!pushEndpointValid_(url)) { out.report.push(name + ': địa chỉ nhận tin không hợp lệ.'); return; }
    try {
      var opts = { method: 'post', payload: '', muteHttpExceptions: true,
        headers: { Authorization: 'vapid t=' + vapidJwt_(pushOrigin_(url), keys) + ', k=' + keys.pub, TTL: '86400', Urgency: 'high' } };
      // Máy có khoá mã hoá thì gửi kèm nội dung để hiện ngay; máy không có thì tự hỏi lại nội dung (doGet ?tb=).
      if (d.p256dh && d.auth) {
        opts.payload = signedBytes_(encryptPush_(payload, base64UrlBytes_(d.p256dh), base64UrlBytes_(d.auth), newP256Key_(), randomBytes_(16)));
        opts.contentType = 'application/octet-stream';
        opts.headers['Content-Encoding'] = 'aes128gcm';
      }
      var res = UrlFetchApp.fetch(url, opts);
      code = res.getResponseCode();
      text = String(res.getContentText() || '').replace(/\s+/g, ' ').slice(0, 160);
    } catch (e) { out.report.push(name + ': lỗi mạng ' + e.message); return; }
    if (code >= 200 && code < 300) { out.sent++; out.report.push(name + ': đã gửi.'); }
    else {
      var gone = code === 404 || code === 410;
      out.report.push(name + ': bị từ chối, mã ' + code + (text ? ' · ' + text : '') + (gone ? ' (máy đã tắt thông báo, đã gỡ khỏi danh sách)' : ''));
      if (gone) out.gone.push(url);
    }
  });
  return out;
}
