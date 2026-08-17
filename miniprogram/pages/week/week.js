var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var p2 = function (n) { return (n < 10 ? '0' : '') + n; };

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  data: {
    usedText: '0',
    budgetText: '4.0',
    ringStyle: '',
    ringDeg: 0,
    best: [],
    alt: [],
    highlight: null,
    mines: [],
    nightOwls: []
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var now = new Date();
    var start = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    var endD = new Date(now.getTime() + 7 * 86400000);
    var end = endD.getFullYear() + '-' + p2(endD.getMonth() + 1) + '-' + p2(endD.getDate());

    var app = getApp();
    var followed = app.getFollowed();
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var week = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end;
    });

    var plan = engine.planWeek(week, recMap, rivs, sls, followed, 4.0);
    var mines = engine.minefield(week, recMap, rivs, sls, followed);

    var evs = week.filter(function (m) { return m.st === 'sched'; })
      .map(function (m) {
        var ev = engine.evaluate(m, recMap, rivs, sls, followed);
        return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
      })
      .sort(function (a, b) { return b.index - a.index; });

    function dec(e, withReason) {
      var f = e.m.t.split('T');
      var d = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var meta = data.LEAGUE_META[e.m.l] || {};
      var o = {
        id: e.m.id,
        lgZh: lgZh(e.m.l),
        accent: meta.accent || '#514533',
        pair: data.getTeam(e.m.h).zh + ' vs ' + data.getTeam(e.m.a).zh,
        homeCode: data.getTeam(e.m.h).id,
        md: (d.getMonth() + 1) + '/' + d.getDate(),
        wd: '周' + WEEK[d.getDay()],
        hm: f[1],
        indexText: e.index.toFixed(1),
        costText: '-' + engine.tierOf(e.m).cost + 'h',
        tier: engine.tierOf(e.m).label
      };
      if (withReason) o.reason = e.reason || '';
      return o;
    }

    var used = plan.used;
    var pct = Math.min(1, used / 4.0);

    this.setData({
      usedText: used.toFixed(1),
      budgetText: '4.0',
      ringStyle: 'background: conic-gradient(#FFB224 0% ' + (pct * 100) + '%, #31353B ' + (pct * 100) + '% 100%);',
      ringDeg: Math.round(pct * 360),
      best: plan.best.map(function (e) { return dec(e, false); }),
      alt: plan.alt.map(function (e) { return dec(e, false); }),
      highlight: evs.length ? dec(evs[0], false) : null,
      mines: mines.map(function (e) { return dec(e, true); }),
      nightOwls: evs.filter(function (e) { return engine.tierOf(e.m).cost >= 2.5; }).slice(0, 6)
        .map(function (e) { return dec(e, false); })
    });
  },

  onBudget: function () {
    wx.showToast({ title: '额度调整 v1 上线', icon: 'none' });
  },
  onRemind: function () {
    wx.showToast({ title: '订阅提醒 v1 上线', icon: 'none' });
  },
  onMatch: function () {
    wx.switchTab({ url: '/pages/schedule/schedule' });
  }
});
