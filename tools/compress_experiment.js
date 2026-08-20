// 一次性实验：队徽压缩参数对比（node tools/compress_experiment.js）
var sharp = require('sharp');
var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, 'crests_src');
var files = fs.readdirSync(SRC).filter(function (f) { return f.slice(-4) === '.png'; });

// 各档位：宽度上限 + palette quality（996 张全部参与统计）
var PLANS = [
  { name: '现状 139px q90', w: 300, q: 90 },
  { name: '120px q80', w: 120, q: 80 },
  { name: '96px q80', w: 96, q: 80 },
  { name: '96px q60', w: 96, q: 60 },
  { name: '80px q70', w: 80, q: 70 },
  { name: '128px q90', w: 128, q: 90 },
  { name: '112px q85', w: 112, q: 85 }
];

(async function () {
  var budgets = {};
  for (var pi = 0; pi < PLANS.length; pi++) {
    var plan = PLANS[pi];
    var total = 0, max = 0, maxF = '';
    for (var i = 0; i < files.length; i++) {
      var buf = await sharp(path.join(SRC, files[i]))
        .resize({ width: plan.w, height: plan.w, fit: 'inside', withoutEnlargement: true })
        .png({ palette: true, quality: plan.q, compressionLevel: 9 })
        .toBuffer();
      total += buf.length;
      if (buf.length > max) { max = buf.length; maxF = files[i]; }
    }
    budgets[plan.name] = { total: Math.round(total / 1024), max: Math.round(max / 1024 * 10) / 10, maxF: maxF };
    console.log(plan.name.padEnd(16) + ' 总 ' + (Math.round(total / 1024) + 'KB').padStart(6) + '  最大单张 ' + (Math.round(max / 1024) + 'KB').padStart(7) + ' (' + maxF + ')');
  }
})();
