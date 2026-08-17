var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');

function shortTime(t) {
  var parts = t.split('T');
  var d = new Date(parts[0].replace(/-/g, '/') + ' 00:00:00');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + parts[1];
}

Page({
  data: {
    budget: 4.0,
    used: 0,
    best: [],
    alt: [],
    top: [],
    mines: [],
    nightOwls: []
  },

  onShow: function () {
    var now = new Date();
    var weekEnd = new Date(now.getTime() + 7 * 86400000);
    var fmt = function (d) {
      return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
    };
    var nowStr = fmt(now);
    var endStr = fmt(weekEnd);

    var all = data.matchesAll().filter(function (m) {
      var day = m.t.split('T')[0];
      return day >= nowStr && day <= endStr;
    });

    var app = getApp();
    var followed = app.getFollowed();
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var plan = engine.planWeek(all, recMap, rivs, sls, followed, 4.0);
    var mines = engine.minefield(all, recMap, rivs, sls, followed);

    var evs = all.filter(function (m) { return m.st === 'sched'; })
      .map(function (m) {
        var ev = engine.evaluate(m, recMap, rivs, sls, followed);
        return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
      })
      .sort(function (a, b) { return b.index - a.index; });

    var decorate = function (e) {
      var h = data.getTeam(e.m.h);
      var a = data.getTeam(e.m.a);
      var d = new Date(e.m.t.split('T')[0].replace(/-/g, '/') + ' 00:00:00');
      return {
        id: e.m.id,
        lg: e.m.l,
        lgZh: (data.LEAGUES.filter(function (x) { return x.id === e.m.l; })[0] || {}).zh || e.m.l,
        pair: h.zh + ' v ' + a.zh,
        timeText: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + e.m.t.split('T')[1],
        stars: '★★★'.slice(0, e.ev.star) + '☆☆☆'.slice(0, 3 - e.ev.star),
        star: e.ev.star,
        indexText: e.index.toFixed(1),
        cost: engine.tierOf(e.m).cost,
        tier: engine.tierOf(e.m).label,
        reason: e.reason || '',
        storyNames: e.ev.stories.map(function (s) { return s.name; })
      };
    };

    // 修仙场：S2 及以上
    var nightOwls = evs.filter(function (e) { return engine.tierOf(e.m).cost >= 2.5; }).slice(0, 8);

    this.setData({
      used: plan.used,
      best: plan.best.map(decorate),
      alt: plan.alt.map(decorate),
      top: evs.slice(0, 6).map(decorate),
      mines: mines.map(decorate),
      nightOwls: nightOwls.map(decorate)
    });
  },

  onBudget: function () {
    wx.showToast({ title: '额度调节 v1.5 上线', icon: 'none' });
  }
});
