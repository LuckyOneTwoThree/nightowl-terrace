// 一次性脚本：压缩队徽（node tools/compress_crests.js [png|webp]）
// 不带参数：只统计两种格式体积；带参数：输出到 miniprogram/images/crests/
var sharp = require('sharp');
var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, 'crests_src');
var OUT = path.join(__dirname, '..', 'miniprogram', 'images', 'crests');
var fmt = process.argv[2];
var files = fs.readdirSync(SRC).filter(function (f) { return f.slice(-4) === '.png'; });

var MAX = 300; // 海报圆标绘制盒 348px，300px 源图足够（无放大需求的不放大）

function pipeline(input) {
  return sharp(input).resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
}

(async function () {
  var totals = { png: 0, webp: 0 };
  if (fmt && !fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  for (var i = 0; i < files.length; i++) {
    var f = files[i], code = f.slice(0, -4), input = path.join(SRC, f);
    var pngBuf = await pipeline(input).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    var webpBuf = await pipeline(input).webp({ quality: 88 }).toBuffer();
    totals.png += pngBuf.length; totals.webp += webpBuf.length;
    if (fmt === 'png') fs.writeFileSync(path.join(OUT, code + '.png'), pngBuf);
    if (fmt === 'webp') fs.writeFileSync(path.join(OUT, code + '.webp'), webpBuf);
  }
  console.log('源文件 ' + files.length + ' 个 | palette PNG 总计 ' + (totals.png / 1024).toFixed(0) + 'KB | webp 总计 ' + (totals.webp / 1024).toFixed(0) + 'KB');
  if (fmt) console.log('已输出 ' + fmt + ' → ' + OUT);
})();
