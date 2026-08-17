var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var decorate = require('../../utils/decorate.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var p2 = function (n) { return (n < 10 ? '0' : '') + n; };

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

// 展示日归档：<06:00 归前一夜（夜猫视角，PM 3.2）
function displayDay(t) {
  var day = engine.dateOf(t);
  var hm = t.split('T')[1];
  if (Number(hm.split(':')[0]) < 6) {
    var d = new Date(day.replace(/-/g, '/') + ' 00:00:00');
    d.setDate(d.getDate() - 1);
    day = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  return day;
}

function dayLabel(day) {
  var d = new Date(day.replace(/-/g, '/') + ' 00:00:00');
  return {
    md: (d.getMonth() + 1) + '月' + d.getDate() + '日',
    week: '周' + WEEK[d.getDay()],
    short: (d.getMonth() + 1) + '/' + d.getDate(),
    wd: WEEK[d.getDay()]
  };
}

Page({
  data: {
    days: [],          // 日期条
    selDay: '',        // 选中日期（scroll-into-view）
    leagues: [],
    selLg: 'ALL',
    selStar: 0,        // 星级下限筛选（0 = 不限）
    starLabel: '星级不限',
    groups: [],        // { day, label, matches[] }
    viewId: ''
  },

  onLoad: function () {
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    // 按展示日分组
    var byDay = {};
    var groups = [];
    data.matchesAll().forEach(function (m) {
      var day = displayDay(m.t);
      if (!byDay[day]) {
        byDay[day] = { day: day, label: dayLabel(day), matches: [] };
        groups.push(byDay[day]);
      }
      var h = data.getTeam(m.h);
      var a = data.getTeam(m.a);
      var meta = data.LEAGUE_META[m.l] || {};
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      var sc = m.sc ? m.sc.split('-') : null;
      byDay[day].matches.push({
        id: m.id,
        lg: m.l,
        lgZh: lgZh(m.l),
        accent: meta.accent || '#514533',
        hm: m.t.split('T')[1],
        local: decorate.localTime(m),
        tbd: m.tbd,
        st: m.st,
        finished: m.st === 'done',
        scH: sc ? sc[0] : '-',
        scA: sc ? sc[1] : '-',
        star: ev.star,
        stars: '★★★'.slice(0, ev.star),
        home: { zh: h.zh, id: h.id, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
        away: { zh: a.zh, id: a.id, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) }
      });
    });
    groups.sort(function (x, y) { return x.day < y.day ? -1 : 1; });
    groups.forEach(function (g) { g.matches.sort(function (x, y) { return x.hm < y.hm ? -1 : 1; }); });

    // 日期条：含今天的全部日期，今天为默认选中
    var days = groups.map(function (g) {
      return { day: g.day, short: g.label.short, wd: g.label.wd, isToday: g.day === todayStr, count: g.matches.length };
    });
    var selDay = todayStr;
    if (!byDay[selDay]) selDay = (groups.filter(function (g) { return g.day > todayStr; })[0] || groups[0] || {}).day || '';

    // 全量分组留在内存（约 280 日 / 1752 场），仅按需 setData 渲染窗口（前 1 天 + 后 5 天）
    this._groups = groups;
    this.setData({
      days: days,
      selDay: selDay,
      leagues: [{ id: 'ALL', zh: '全部' }].concat(data.LEAGUES),
      viewGroups: this.windowOf(selDay),
      viewId: 'd-' + selDay
    });
  },

  // 渲染窗口：选中日前 1 天起共 7 天（真机性能：单次 setData ≤ ~60 场）
  windowOf: function (day) {
    var gs = this._groups || [];
    var idx = -1;
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].day === day) { idx = i; break; }
    }
    if (idx < 0) return gs.slice(0, 7);
    var from = Math.max(0, idx - 1);
    var to = Math.min(gs.length, from + 7);
    return gs.slice(from, to);
  },

  onPickDay: function (e) {
    var d = e.currentTarget.dataset.day;
    this.setData({ selDay: d, viewGroups: this.windowOf(d) });
  },
  onPickLg: function (e) {
    this.setData({ selLg: e.currentTarget.dataset.lg });
  },
  onStarFilter: function () {
    var next = (this.data.selStar + 1) % 4; // 不限 → ★+ → ★★+ → ★★★
    this.setData({
      selStar: next,
      starLabel: next === 0 ? '星级不限' : next === 1 ? '★ 以上' : next === 2 ? '★★ 以上' : '仅 ★★★'
    });
  },
  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
  onStar: function () {
    wx.showToast({ title: '收藏 v1 上线', icon: 'none' });
  }
});
