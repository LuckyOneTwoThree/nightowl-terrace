var data = require('../../utils/data.js');
var decorate = require('../../utils/decorate.js');
var crypt = require('../../utils/crypt.js');

var WEEK = decorate.WEEK;

function labelOf(dateStr) {
  var f = dateStr.split('-');
  var d = new Date(Number(f[0]), Number(f[1]) - 1, Number(f[2]));
  return f[1] + '月' + f[2] + '日 周' + WEEK[d.getDay()];
}

// 结算：胜平负 3 分，比分再 +2（PM 9.4）
function settle(pred, m) {
  if (!m || !m.sc) return null;
  var sc = m.sc.split('-');
  var h = Number(sc[0]), a = Number(sc[1]);
  var fact = h > a ? 'h' : h < a ? 'a' : 'd';
  var hit = pred.pick === fact;
  var pts = hit ? 3 : 0;
  if (hit && pred.scoreH !== '' && Number(pred.scoreH) === h && Number(pred.scoreA) === a) pts += 2;
  return { hit: hit, pts: pts, sc: m.sc };
}

Page({
  data: { groups: [], empty: false },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var boasts = wx.getStorageSync('boasts') || {};
    var checkins = wx.getStorageSync('checkins') || {};

    var rows = [];
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid], m = data.getMatch(mid);
      if (!m) return;
      // commit-reveal 校验（PM 八节）：reveal 与封存哈希不一致 → 不计分
      var tampered = !crypt.verify(p);
      var r = tampered ? null : settle(p, m);
      var pickZh = p.pick === 'h' ? '主胜' : p.pick === 'd' ? '平局' : '客胜';
      rows.push({
        key: 'pred-' + mid,
        label: labelOf(m.t.split('T')[0]),
        sort: p.ts || 0, type: 'pred',
        names: data.getTeam(m.h).zh + ' vs ' + data.getTeam(m.a).zh,
        sub: tampered ? '封存校验失败 · 已作废' : '预测: ' + pickZh + (p.scoreH !== '' ? ' (' + p.scoreH + '-' + p.scoreA + ')' : ''),
        finished: tampered ? true : !!r,
        hit: r ? r.hit : false,
        pts: r ? r.pts : 0,
        tampered: tampered
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
