/**
 * commit-reveal 加盐哈希（PM 八节权限规则 / 9.4 盲评封存）
 * SHA-256 为标准实现，与云函数 node:crypto 结果一致——云版本上线后校验逻辑无需改动。
 * 本地降级方案：明文 + 盐 + 哈希同存本地，结算时校验；云版本仅把存储换云数据库（客户端只写不读）。
 */

// 纯 JS SHA-256（输入 UTF-8 字符串，输出小写十六进制）
function sha256(str) {
  var msg = unescape(encodeURIComponent(str));
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  var len = msg.length;
  var words = [];
  for (var i = 0; i < len; i++) words[i >> 2] = (words[i >> 2] || 0) | (msg.charCodeAt(i) << (24 - (i % 4) * 8));
  words[len >> 2] = (words[len >> 2] || 0) | (0x80 << (24 - (len % 4) * 8));
  var bitLen = len * 8;
  var total = (((bitLen + 64) >> 9) << 4) + 15;
  for (var j = (len >> 2) + 1; j <= total; j++) words[j] = 0;
  words[total - 1] = Math.floor(bitLen / 4294967296); // 64 位长度高 32 位（大端）
  words[total] = bitLen;                              // 低 32 位

  var w = new Array(64);
  var a, b, c, d, e, f, g, h, t1, t2;
  function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }

  for (i = 0; i < words.length; i += 16) {
    a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
    for (j = 0; j < 64; j++) {
      if (j < 16) w[j] = words[i + j] || 0;
      else w[j] = (rrot(w[j - 2], 17) ^ rrot(w[j - 2], 19) ^ (w[j - 2] >>> 10)) +
                  (rrot(w[j - 15], 7) ^ rrot(w[j - 15], 18) ^ (w[j - 15] >>> 3)) + w[j - 16] + w[j - 7];
      t1 = h + (rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j];
      t2 = (rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  var out = '';
  for (i = 0; i < 8; i++) {
    var hex = (H[i] >>> 0).toString(16);
    out += '00000000'.slice(hex.length) + hex;
  }
  return out;
}

// 生成盐（wx.getRandomValues 异步；onSeal 已在用户点击链路内，降级 Math.random 亦可）
function genSalt() {
  var z = '0000';
  var s = '';
  for (var i = 0; i < 4; i++) {
    var h = Math.floor(Math.random() * 0x10000).toString(16);
    s += z.slice(h.length) + h;
  }
  return s;
}

/**
 * 组装 commit 哈希载荷
 * @param p { pick, scoreH, scoreA, salt }
 */
function commitHash(p) {
  return sha256(p.pick + '|' + (p.scoreH || '-') + ':' + (p.scoreA || '-') + '|' + p.salt);
}

/**
 * 校验 reveal 是否与封存一致
 * @returns true 一致 / false 载荷被改
 */
function verify(p) {
  if (!p || !p.salt || !p.hash) return true; // 旧数据无哈希，按原值结算
  return commitHash(p) === p.hash;
}

module.exports = { sha256: sha256, genSalt: genSalt, commitHash: commitHash, verify: verify };
