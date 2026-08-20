/**
 * 队徽图标工具（云存储版）
 * 96 支五大联赛球队队徽存放于云存储 crests/ 目录（源头：luukhopman/football-logos，
 * tools/fetch_crests.js 下载 + tools/compress_crests.js 压缩后上传）
 *
 * <image> 组件 src 原生支持 cloud:// fileID（基础库 2.2.3+，自动下载+CDN 缓存），
 * 不受 downloadFile 域名白名单约束；包内已不打包队徽（体验评分静态资源 ≤200KB 达标）
 *
 * 使用：crest.getUrl('ARS') → 'cloud://<env>.<bucket>/crests/ARS.png'
 *       crest.getUrl('XXX') → null（未收录时页面回退纯色三字码圆标）
 *
 * 新赛季更新流程：tools/fetch_crests.js 下载 → tools/compress_crests.js png 压缩 →
 * 云存储上传到 crests/ 目录 → BUNDLED 表加三字码
 */

// 云存储 fileID 前缀（cloud://<envId>.<bucket>）：上传后在云存储面板任一文件详情里复制
var ENV = 'cloudbase-d3gvu54t8fbbb6b3f';
var BUCKET = '636c-cloudbase-d3gvu54t8fbbb6b3f-1470591947'; // 云存储已上传 crests/ 目录（96 张）

// 已收录队徽的三字码（与云存储 crests/ 目录文件一一对应，共 96 支）
var BUNDLED = {
  // ── 英超 ──
  ARS: 1, AVL: 1, BOU: 1, BRE: 1, BHA: 1, CHE: 1, COV: 1, CRY: 1, EVE: 1, FUL: 1,
  HUL: 1, IPS: 1, LEE: 1, LIV: 1, MCI: 1, MUN: 1, NEW: 1, NFO: 1, SUN: 1, TOT: 1,
  // ── 西甲 ──
  RMA: 1, BAR: 1, ATM: 1, ATH: 1, BET: 1, CEL: 1, ELC: 1, ESP: 1, DEP: 1, LEV: 1,
  MAL: 1, OSA: 1, RAY: 1, RAC: 1, RSO: 1, SEV: 1, VAL: 1, VIL: 1, GET: 1, ALA: 1,
  // ── 意甲 ──
  INT: 1, MIL: 1, JUV: 1, NAP: 1, ROM: 1, LAZ: 1, FIO: 1, ATA: 1, BOL: 1, TOR: 1,
  UDI: 1, GEN: 1, CAG: 1, PAR: 1, COM: 1, LEC: 1, SAS: 1, FRO: 1, VEN: 1, MZA: 1,
  // ── 德甲 ──
  FCB: 1, BVB: 1, B04: 1, RBL: 1, SGE: 1, VFB: 1, SCF: 1, TSG: 1, FCU: 1, SVW: 1,
  MAI: 1, BMG: 1, FCA: 1, KOE: 1, HSV: 1, S04: 1, SCP: 1, ELV: 1,
  // ── 法甲 ──
  PSG: 1, OM: 1, MCO: 1, LIL: 1, OL: 1, NIC: 1, LEN: 1, STR: 1, REN: 1, TOU: 1,
  BRT: 1, AUX: 1, ANG: 1, HAV: 1, LOR: 1, PAC: 1, TRO: 1, LEM: 1
};

function getUrl(code) {
  if (!code || !BUNDLED[code]) return null;
  // 云端模式：image 组件原生支持 cloud:// fileID；未配置 BUCKET 时本地包兜底（过渡期）
  if (BUCKET) return 'cloud://' + ENV + '.' + BUCKET + '/crests/' + code + '.png';
  return '/images/crests/' + code + '.png';
}

module.exports = { getUrl: getUrl, ENV: ENV, setBucket: function (b) { BUCKET = b; } };
