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
  onShow: function () { getApp().applyTheme(this); },
  data: {
    days: [],          // 日期条
    selDay: '',        // 选中日期（scroll-into-view）
    leagues: [],
    selLg: 'ALL',
    selStar: 0,        // 星级下限筛选（0 = 不限）
    starLabel: '星级不限',
    groups: [],        // { day, label, matches[] }
    viewId: '',
    viewMode: 'day',   // 'day' 日历视图 | 'round' 轮次视图（PM T7）
    rounds: [],        // 当前联赛可用轮次
    selRound: 0
  },

  onLoad: function () {
    var now = new Date();
    // 夜猫口径「今日」：凌晨场归前一晚，默认选中正在过的这一夜
    var todayStr = engine.nightOf(now);

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    // 关注球队参与星级评定（PM 7.4：关注球队提至最高 ★★，赛程页同步生效）
    var followed = getApp().getFollowed();

    // 按展示日分组
    var byDay = {};
    var groups = [];
    var byRound = {}; // lg -> { r: [cards] }（轮次视图）
    data.matchesAll().forEach(function (m) {
      var day = displayDay(m.t);
      if (!byDay[day]) {
        byDay[day] = { day: day, label: dayLabel(day), matches: [] };
        groups.push(byDay[day]);
      }
      var h = data.getTeam(m.h);
      var a = data.getTeam(m.a);
      var meta = data.LEAGUE_META[m.l] || {};
      var ev = engine.evaluate(m, recMap, rivs, sls, followed);
      var sc = m.sc ? m.sc.split('-') : null;
      var card = {
        id: m.id,
        lg: m.l,
        r: m.r,
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
        followed: followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0, // 主队角标（PM 7.4）
        home: { zh: h.zh, id: h.id, logo: h.logo, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
        away: { zh: a.zh, id: a.id, logo: a.logo, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) }
      };
      byDay[day].matches.push(card);
      byRound[m.l] = byRound[m.l] || {};
      byRound[m.l][m.r] = byRound[m.l][m.r] || [];
      byRound[m.l][m.r].push(card);
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
    this._byRound = byRound;
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
    this.setData({ selDay: d, viewGroups: this.windowOf(d), viewId: 'd-' + d });
  },
  onPickLg: function (e) {
    var lg = e.currentTarget.dataset.lg;
    // 轮次视图必须选定联赛：ALL 不适用，回落英超
    if (this.data.viewMode === 'round' && lg === 'ALL') lg = 'PL';
    this.setData({ selLg: lg });
    if (this.data.viewMode === 'round') this.enterRoundView(lg, 0);
  },

  // ---------- 轮次视图（PM T7：按联赛轮次浏览） ----------
  onSwitchView: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.viewMode) return;
    if (mode === 'round') {
      var lg = this.data.selLg === 'ALL' ? 'PL' : this.data.selLg;
      this.setData({ viewMode: 'round', selLg: lg });
      this.enterRoundView(lg, 0);
    } else {
      this.setData({ viewMode: 'day', viewGroups: this.windowOf(this.data.selDay) });
    }
  },

  // rounds：该联赛可用轮次；selRound=0 时自动定位最近一轮（首个含未赛场）
  enterRoundView: function (lg, forceRound) {
    var byLg = this._byRound[lg] || {};
    var rounds = Object.keys(byLg).map(Number).sort(function (a, b) { return a - b; });
    if (!rounds.length) {
      this.setData({ rounds: [], selRound: 0, viewGroups: [] });
      return;
    }
    var sel = forceRound || 0;
    if (!sel) {
      sel = rounds[rounds.length - 1];
      for (var i = 0; i < rounds.length; i++) {
        var hasSched = byLg[rounds[i]].some(function (c) { return c.st === 'sched'; });
        if (hasSched) { sel = rounds[i]; break; }
      }
    }
    this.setData({
      rounds: rounds,
      selRound: sel,
      viewGroups: [this.roundGroup(lg, sel)]
    });
  },

  roundGroup: function (lg, r) {
    var cards = (this._byRound[lg] || {})[r] || [];
    return {
      day: 'round-' + lg + '-' + r,
      label: { md: lgZh(lg) + ' · 第' + r + '轮', week: cards.length + ' 场' },
      matches: cards.slice().sort(function (x, y) { return x.hm < y.hm ? -1 : 1; })
    };
  },

  onPickRound: function (e) {
    var r = Number(e.currentTarget.dataset.r);
    this.setData({ selRound: r, viewGroups: [this.roundGroup(this.data.selLg, r)] });
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
