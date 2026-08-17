var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    filter: 'ALL',
    leagues: [],
    groups: []
  },

  onLoad: function () {
    this.setData({
      leagues: [{ id: 'ALL', zh: '全部' }].concat(data.LEAGUES)
    });
    this.refresh();
  },

  refresh: function () {
    var filter = this.data.filter;
    var all = data.matchesAll().slice().sort(function (a, b) { return a.t < b.t ? -1 : 1; });

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    // 按北京时间日期分组（凌晨场归属前一晚，与今日页口径一致）
    var groups = [];
    var byDay = {};
    all.forEach(function (m) {
      if (filter !== 'ALL' && m.l !== filter) return;
      var day = engine.dateOf(m.t);
      var hm = m.t.split('T')[1].split(':');
      if (Number(hm[0]) < 6) {
        var d = new Date(day.replace(/-/g, '/') + ' 00:00:00');
        d.setDate(d.getDate() - 1);
        var mm = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
        var dd = (d.getDate() < 10 ? '0' : '') + d.getDate();
        day = d.getFullYear() + '-' + mm + '-' + dd;
      }
      if (!byDay[day]) {
        byDay[day] = { date: day, label: '', matches: [] };
        groups.push(byDay[day]);
      }
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      var h = data.getTeam(m.h);
      var a = data.getTeam(m.a);
      byDay[day].matches.push({
        id: m.id,
        lg: m.l,
        lgZh: (data.LEAGUES.filter(function (x) { return x.id === m.l; })[0] || {}).zh || m.l,
        pair: h.zh + ' v ' + a.zh,
        home: { id: h.id, color: h.color },
        away: { id: a.id, color: a.color },
        hm: m.t.split('T')[1],
        tbd: m.tbd,
        st: m.st,
        sc: m.sc,
        stars: '★★★'.slice(0, ev.star) + '☆☆☆'.slice(0, 3 - ev.star),
        star: ev.star,
        tier: engine.tierOf(m).label
      });
    });

    groups.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    groups.forEach(function (g) {
      var d = new Date(g.date.replace(/-/g, '/') + ' 00:00:00');
      g.label = (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WEEK[d.getDay()];
    });

    this.setData({ groups: groups });
  },

  onFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.lg });
    this.refresh();
  }
});
