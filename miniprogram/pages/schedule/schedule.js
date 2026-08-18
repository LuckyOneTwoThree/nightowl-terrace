var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var decorate = require('../../utils/decorate.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
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
    theme: '',
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

  onShow: function () {
    getApp().applyTheme(this);
    var curFollowed = JSON.stringify(getApp().getFollowed());
    if (this._lastFollowed !== curFollowed) {
      this.onLoad();
    }
  },

  onLoad: function () {
    this._lastFollowed = JSON.stringify(getApp().getFollowed());
    var now = new Date();
    // 按照北京时间自然日展示赛程
    var todayStr = engine.dateStr(now);

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    // 关注球队参与星级评定（PM 7.4：关注球队提至最高 ★★，赛程页同步生效）
    var followed = getApp().getFollowed();

    // 按北京时间自然日分组
    var byDay = {};
    var groups = [];
    var byRound = {}; // lg -> { r: [cards] }（轮次视图）
    data.matchesAll().forEach(function (m) {
      var day = m.t.split('T')[0];
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
        t: m.t,
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
    groups.forEach(function (g) { g.matches.sort(function (x, y) { return x.t < y.t ? -1 : 1; }); });

    // 日期条：按北京时间自然日，今天为默认选中
    var days = groups.map(function (g) {
      return { day: g.day, short: g.label.short, wd: g.label.wd, isToday: g.day === todayStr, count: g.matches.length };
    });
    var selDay = todayStr;
    if (!byDay[selDay]) selDay = (groups.filter(function (g) { return g.day >= todayStr; })[0] || groups[0] || {}).day || '';

    // 全量分组留在内存（约 280 日 / 1752 场），仅按需 setData 渲染窗口（从选中日起展示 7 天）
    this._groups = groups;
    this._byRound = byRound;
    this.setData({
      days: days,
      selDay: selDay,
      dchipId: 'dchip-' + selDay,
      leagues: [{ id: 'ALL', zh: '全部' }].concat(data.LEAGUES),
      viewGroups: this.windowOf(selDay)
    });
  },

  // 渲染窗口：从选中日当天开始向后渲染 7 天（首个展示组即为所选日期）
  windowOf: function (day) {
    var gs = this._groups || [];
    var idx = -1;
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].day === day) { idx = i; break; }
    }
    if (idx < 0) return gs.slice(0, 7);
    var from = idx; // 严格从选中日当天开始
    var to = Math.min(gs.length, from + 7);
    return gs.slice(from, to);
  },

  onPickDay: function (e) {
    var d = e.currentTarget.dataset.day;
    this.setData({
      selDay: d,
      dchipId: 'dchip-' + d,
      viewGroups: this.windowOf(d)
    });
    // 切换日期后重置页面滚动高度至顶部，使所选日期置顶显示
    if (wx.pageScrollTo) {
      wx.pageScrollTo({ scrollTop: 0, duration: 150 });
    }
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
      matches: cards.slice().sort(function (x, y) { return x.t < y.t ? -1 : 1; })
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
