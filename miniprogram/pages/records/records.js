var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var crypt = require('../../utils/crypt.js');

var WEEK = decorate.WEEK;

function labelOf(dateStr) {
  var f = dateStr.split('-');
  var d = new Date(Number(f[0]), Number(f[1]) - 1, Number(f[2]));
  return f[1] + '月' + f[2] + '日 周' + WEEK[d.getDay()];
}

// 结算：胜平负 3 分，比分再 +2，命中冷门预警翻倍（PM 9.4）
function settle(pred, m, recMap) {
  if (!m || !m.sc) return null;
  var sc = m.sc.split('-');
  var h = Number(sc[0]), a = Number(sc[1]);
  var fact = h > a ? 'h' : h < a ? 'a' : 'd';
  var hit = pred.pick === fact;
  var pts = hit ? 3 : 0;
  if (hit && pred.scoreH !== '' && Number(pred.scoreH) === h && Number(pred.scoreA) === a) pts += 2;
  var rec = (recMap || {})[m.id];
  if (hit && rec && rec.upset) pts *= 2; // 冷门翻倍
  return { hit: hit, pts: pts, sc: m.sc, upset: hit && rec && !!rec.upset };
}

Page({
  data: { groups: [], empty: false },

  onShow: function () {
    getApp().applyTheme(this); this.refresh(); },

  refresh: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var boasts = wx.getStorageSync('boasts') || {};
    var checkins = wx.getStorageSync('checkins') || {};
    var recMap = data.getRecMap();

    var rows = [];
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid], m = data.getMatch(mid);
      if (!m) return;
      // commit-reveal 校验（PM 八节）：哈希不一致或开球后才封存 → 作废不计分
      var tampered = !crypt.verify(p);
      var late = !!p.ts && p.ts > engine.ts(m.t) + 60000; // 1 分钟宽容（客户端时钟偏差）
      var r = (tampered || late) ? null : settle(p, m, recMap);
      var pickZh = p.pick === 'h' ? '主胜' : p.pick === 'd' ? '平局' : '客胜';
      var hTeam = data.getTeam(m.h) || {};
      var aTeam = data.getTeam(m.a) || {};
      rows.push({
        key: 'pred-' + mid,
        label: labelOf(m.t.split('T')[0]),
        sort: p.ts || 0, type: 'pred',
        names: (hTeam.zh || m.h) + ' vs ' + (aTeam.zh || m.a),
        logo: hTeam.logo || '',
        sub: tampered ? '封存校验失败 · 已作废'
          : late ? '开球后封存 · 已作废'
          : '预测: ' + pickZh + (p.scoreH !== '' ? ' (' + p.scoreH + '-' + p.scoreA + ')' : '') + (r && r.upset ? ' · 冷门×2' : ''),
        finished: tampered || late ? true : !!r,
        hit: r ? r.hit : false,
        pts: r ? r.pts : 0,
        tampered: tampered || late
      });
    });
    Object.keys(boasts).forEach(function (mid) {
      var b = boasts[mid];
      rows.push({
        key: 'boast-' + mid,
        label: b.md, sort: b.ts || 0, type: 'boast',
        names: b.names, sub: b.text,
        finished: b.result !== null, hit: b.result === 'hit', pts: 0
      });
    });
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid];
      rows.push({
        key: 'ci-' + mid,
        label: c.md, sort: c.ts || 0, type: 'checkin',
        names: c.names, sub: '夜猫打卡', cost: c.cost,
        finished: true, hit: true, pts: 0
      });
    });

    rows.sort(function (a, b) { return b.sort - a.sort; });
    var seen = {}, groups = [];
    rows.forEach(function (r) {
      if (!seen[r.label]) { seen[r.label] = { label: r.label, rows: [] }; groups.push(seen[r.label]); }
      seen[r.label].rows.push(r);
    });

    this.setData({ groups: groups, empty: !rows.length });
  },

  goToday: function () { wx.switchTab({ url: '/pages/today/today' }); }
});
