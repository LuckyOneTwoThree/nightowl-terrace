// 海报数据链路 + 布局几何校验（诊断脚本：node tools/poster_check.js）
var path = require('path');
var ROOT = path.join(__dirname, '..') + '/miniprogram/';
var data = require(ROOT + 'utils/data.js');
var decorate = require(ROOT + 'utils/decorate.js');

// 取三场代表性场次：英超揭幕 / 德国超级杯 / 一场西甲
var all = data.matchesAll();
var picks = all.filter(function (m) {
  return (m.h === 'ARS' && m.a === 'COV') || m.l === 'SCG' || (m.h === 'RMA' && m.a === 'BAR');
}).slice(0, 3);

picks.forEach(function (raw) {
  var m = decorate.dec(raw, null, { followed: [] });
  console.log('==== ' + m.home.id + ' vs ' + m.away.id + ' (' + m.lgZh + ')');
  console.log('  home.logo = ' + m.home.logo);
  console.log('  away.logo = ' + m.away.logo);
  console.log('  points = ' + JSON.stringify(m.points.slice(0, 3)));
  console.log('  dateHeader = ' + m.dateHeader + ' | hm = ' + m.hm + ' | local = ' + m.local);

  // ---- 几何校验：复刻 poster.js _paint 的所有绘制元素包围盒 ----
  var W = 1080, H = 1920;
  var boxes = [];
  var cn = function (s) { return (String(s).match(/[\u2E80-\u9FFF\uF900-\uFDFF★·]/g) || []).length; };
  var monoW = function (s, size) { var ascii = s.length - cn(s); return ascii * size * 0.6 + cn(s) * size; };
  var bodyW = function (s, size) { return (s.length - cn(s)) * size * 0.55 + cn(s) * size; };
  function add(name, x0, y0, x1, y1) { boxes.push({ name: name, x0: x0, y0: y0, x1: x1, y1: y1 }); }

  add('联赛章', W / 2 - monoW(m.lgEn.toUpperCase(), 58) / 2, 150 - 29, W / 2 + monoW(m.lgEn.toUpperCase(), 58) / 2, 150 + 29);
  add('标语', W / 2 - bodyW('今晚哪场值得熬', 100) / 2, 250, W / 2 + bodyW('今晚哪场值得熬', 100) / 2, 350);
  add('副标语', W / 2 - monoW('MIDNIGHT MATCH PREMIUM', 46) / 2, 379, W / 2 + monoW('MIDNIGHT MATCH PREMIUM', 46) / 2, 425);
  add('主队圆', W * .25 - 174, 456, W * .25 + 174, 804);
  add('客队圆', W * .75 - 174, 456, W * .75 + 174, 804);
  add('VS', 474, 586, 606, 686);
  add('主队名', W * .25 - bodyW(m.home.zh, 68) / 2, 840, W * .25 + bodyW(m.home.zh, 68) / 2, 908);
  add('客队名', W * .75 - bodyW(m.away.zh, 68) / 2, 840, W * .75 + bodyW(m.away.zh, 68) / 2, 908);
  add('时间面板', 130, 1000, 950, 1400);
  add('日期头', W / 2 - bodyW(m.dateHeader, 52) / 2, 1040, W / 2 + bodyW(m.dateHeader, 52) / 2, 1092);
  add('时间大字', W / 2 - monoW(m.hm, 150) / 2, 1115, W / 2 + monoW(m.hm, 150) / 2, 1265);
  add('北京/当地', W / 2 - 240, 1281, W / 2 + 240, 1319);
  add('分隔线', 450, 1437, 630, 1443);
  add('星级', 441, 1453, 639, 1519);
  add('夜猫指数', W / 2 - monoW('夜猫指数 ' + m.indexText, 60) / 2, 1524, W / 2 + monoW('夜猫指数 ' + m.indexText, 60) / 2, 1584);
  var pts = m.points.length ? m.points.slice(0, 3) : ['x', 'y', 'z'];
  pts.forEach(function (p, i) {
    var w = bodyW(p, 54); // 以最大字号估算（fitText 只会缩不会放）
    add('看点' + (i + 1), 202, 1640 + i * 62 - 27, 202 + w, 1640 + i * 62 + 27);
  });
  add('品牌位', W / 2 - 420, 1847, W / 2 + 420, 1897);

  var issues = [];
  boxes.forEach(function (b) {
    if (b.x0 < 0 || b.x1 > W || b.y0 < 0 || b.y1 > H) issues.push('越界: ' + b.name + ' [' + b.x0.toFixed(0) + ',' + b.y0.toFixed(0) + ',' + b.x1.toFixed(0) + ',' + b.y1.toFixed(0) + ']');
  });
  for (var i = 0; i < boxes.length; i++) {
    for (var j = i + 1; j < boxes.length; j++) {
      var a = boxes[i], b = boxes[j];
      // 时间面板是背景卡片，其内部文字（日期头/时间大字/北京当地）为预期包含关系，不计重叠
      if (a.name === '时间面板' || b.name === '时间面板') {
        var innerA = a.name !== '时间面板' && a.y0 >= 1000 && a.y1 <= 1400;
        var innerB = b.name !== '时间面板' && b.y0 >= 1000 && b.y1 <= 1400;
        if (innerA || innerB) continue;
      }
      var ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      var oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 2 && oy > 2) issues.push('重叠: ' + a.name + ' × ' + b.name + ' (交叠 ' + ox.toFixed(0) + '×' + oy.toFixed(0) + 'px)');
    }
  }
  console.log(issues.length ? '  ❌ ' + issues.join('\n     ') : '  ✅ 布局无越界、无重叠');
  // 看点在 54px 下是否触发缩字（maxW = 1080-202-60 = 818）
  pts.forEach(function (p, i) {
    var w = bodyW(p, 54);
    if (w > 818) console.log('  ⚠ 看点' + (i + 1) + ' 54px 宽 ' + w.toFixed(0) + 'px 超过 818px → fitText 将缩号至 ' + Math.max(42, Math.floor(54 * 818 / w)) + 'px');
  });
});
