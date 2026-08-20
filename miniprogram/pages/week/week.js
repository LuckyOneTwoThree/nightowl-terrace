var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var ics = require('../../utils/ics.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  data: {
    theme: data.getInitTheme(),
    usedText: '0',
    budgetText: '4.0',
    pctText: '0%',
    ringStyle: '',
    ringDeg: 0,
    best: [],
    alt: [],
    focal: [],
    highlight: null,
    mines: [],
    nightOwls: [],
    overNote: '',      // 周一透支结算提示（PM 9.1）
    suggest: 0,

    // 3视角药丸分栏状态 ('plan' | 'focal' | 'radar')
    curTab: 'plan',

    // _16 抽屉状态
    showSheet: false,
    sheetBudget: 4.0,
    sheetCoverCount: 2
  },

  onLoad: function () {
    getApp().applyTheme(this);
    var settings = wx.getStorageSync('settings') || {};
    this._lastFollowed = JSON.stringify(getApp().getFollowed());
    this._lastBudget = settings.budget || 4.0;
    this._lastMinStar = settings.minStar || 1;
    this._lastTodayStr = engine.nightOf(new Date());
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    var curFollowed = JSON.stringify(getApp().getFollowed());
    var settings = wx.getStorageSync('settings') || {};
    var curBudget = settings.budget || 4.0;
    var curMinStar = settings.minStar || 1;
    var curTodayStr = engine.nightOf(new Date());

    if (this._lastFollowed !== curFollowed ||
        this._lastBudget !== curBudget ||
        this._lastMinStar !== curMinStar ||
        this._lastTodayStr !== curTodayStr) {
      this._lastFollowed = curFollowed;
      this._lastBudget = curBudget;
      this._lastMinStar = curMinStar;
      this._lastTodayStr = curTodayStr;
      this.refresh();
    }
  },

  onSwitchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab && tab !== this.data.curTab) {
      this.setData({ curTab: tab });
    }
  },

  refresh: function () {
    var now = new Date();
    // 夜猫口径「本周」：起点为今晚（凌晨 00:00–06:00 归前一晚，与今日页一致）
    var start = engine.nightOf(now);
    var endD = new Date(now.getTime() + 7 * 86400000);
    var end = engine.nightOf(endD);

    var app = getApp();
    var followed = app.getFollowed();
    var settings = wx.getStorageSync('settings') || {};
    var budget = settings.budget || 4.0;
    var minStar = settings.minStar || 1;
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var week = data.matchesAll().filter(function (m) {
      var d = engine.owlDay(m.t); // 与今日页一致：凌晨场归前一晚
      return d >= start && d <= end;
    });

    var plan = engine.planWeek(week, recMap, rivs, sls, followed, budget);
    var mines = engine.minefield(week, recMap, rivs, sls, followed);

    // 复用 planWeek 已算好的评估（index 降序，tbd 场次已排除），避免同批场次二次全量 evaluate
    var evs = plan.evs;

    // 跨联赛焦点 Top 5–8
    var focal = evs.filter(function (e) { return e.ev.star >= Math.max(2, minStar); })
      .sort(function (a, b) { return b.ev.star - a.ev.star || b.index - a.index; })
      .slice(0, 8);

    function dec(e, withReason) {
      if (!e || !e.m) return {};
      var f = e.m.t.split('T');
      var d = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var meta = data.LEAGUE_META[e.m.l] || {};
      var hTeam = data.getTeam(e.m.h) || { id: e.m.h, zh: e.m.h, color: '#334155' };
      var aTeam = data.getTeam(e.m.a) || { id: e.m.a, zh: e.m.a, color: '#334155' };
      var tier = engine.tierOf(e.m);
      var idx = (e.index !== undefined && e.index !== null) ? e.index : (e.ev ? engine.owlIndex(e.ev, e.m) : 0);
      
      var o = {
        id: e.m.id,
        lgZh: lgZh(e.m.l),
        accent: meta.accent || '#1E293B',
        pair: hTeam.zh + ' vs ' + aTeam.zh,
        homeCode: hTeam.id,
        homeLogo: hTeam.logo || '',
        homeBg: data.tint(hTeam.color, .2),
        homeBd: data.tint(hTeam.color, .35),
        md: (d.getMonth() + 1) + '/' + d.getDate(),
        wd: '周' + WEEK[d.getDay()],
        hm: f[1],
        tbd: !!e.m.tbd, // 时间待定：S 档与成本为占位值，仅作提示
        indexText: idx ? idx.toFixed(1) : '—',
        costText: '-' + tier.cost + 'h',
        tier: tier.label
      };
      if (withReason) o.reason = e.reason || (e.ev && e.ev.star <= 1 ? '凌晨档看点有限，建议睡觉' : '');
      return o;
    }

    var used = plan.used || 0;
    var pct = Math.min(1, budget > 0 ? used / budget : 0);

    // 周一透支结算（PM 9.1）：按北京自然周结算，每周只结算一次上周（设备时区无关）
    var thisWeek = engine.weekStartBJ(Date.now());
    var lastWeek = engine.weekStartBJ(Date.now() - 7 * 86400000);
    var settleKey = 'settled_' + thisWeek.str;
    var overNote = '', suggest = 0;
    if (!wx.getStorageSync(settleKey)) {
      var actual = 0;
      var checkins = wx.getStorageSync('checkins') || {};
      Object.keys(checkins).forEach(function (k) {
        var c = checkins[k];
        // 优先用打卡时记录的比赛归属周（凌晨场归前一晚的周），无 wk 时回退时间戳区间
        if (c.wk ? c.wk === lastWeek.str : (c.ts >= lastWeek.ts && c.ts < thisWeek.ts)) actual += c.cost || 0;
      });
      wx.setStorageSync(settleKey, 1);
      if (actual > budget + 0.01) {
        suggest = Math.max(1, Math.round((budget - (actual - budget) / 2) * 2) / 2);
        // 带 week 归属：仅对「刚结算的上周」的建议有效，跨周自动过期
        wx.setStorageSync('weekSuggest', { week: lastWeek.str, budget: budget, suggest: suggest, actual: actual });
      }
    }
    var sug = wx.getStorageSync('weekSuggest');
    if (sug && sug.week === lastWeek.str && sug.suggest && sug.suggest < budget) {
      overNote = '上周实际透支 ' + sug.actual.toFixed(1) + 'h，建议本周收紧';
      suggest = sug.suggest;
    }

    this._bestRaw = plan.best.map(function (e) { return e.m; });
    this._allEvs = evs;

    var bestList = plan.best.map(function (e) { return dec(e, false); });
    // 如果最优组合按背包算法正好为空（比如场次较少或成本限制），降级取焦点战前两场
    if (!bestList.length && evs.length) {
      bestList = evs.slice(0, 2).map(function (e) { return dec(e, false); });
    }

    var hlItem = evs.filter(function (e) { return !e.m.tbd; })[0] || evs[0] || null;

    this.setData({
      usedText: used.toFixed(1),
      budgetText: budget.toFixed(1),
      pctText: Math.round(pct * 100) + '%',
      ringStyle: 'background: conic-gradient(#FFB224 0% ' + (pct * 100) + '%, #262A30 ' + (pct * 100) + '% 100%);',
      ringDeg: Math.round(pct * 360),
      best: bestList,
      alt: plan.alt.map(function (e) { return dec(e, false); }),
      focal: focal.map(function (e) {
        var d = dec(e, false);
        d.stars = '★★★'.slice(0, (e.ev ? e.ev.star : 2));
        return d;
      }),
      highlight: hlItem ? dec(hlItem, false) : null,
      mines: mines.map(function (e) { return dec(e, true); }),
      nightOwls: evs.filter(function (e) { return !e.m.tbd && engine.tierOf(e.m).cost >= 2.0; }).slice(0, 6)
        .map(function (e) { return dec(e, false); }),
      overNote: overNote,
      suggest: suggest,
      sheetBudget: budget,
      sheetCoverCount: plan.best.filter(function(x) { return x.ev && x.ev.star >= 3; }).length
    });
  },

  // 打开 _16 额度调整抽屉
  openSheet: function () {
    this.setData({ showSheet: true, sheetBudget: parseFloat(this.data.budgetText) });
  },

  closeSheet: function () {
    this.setData({ showSheet: false });
  },

  onSliderChange: function (e) {
    var val = parseFloat(e.detail.value);
    var count = Math.max(1, Math.floor(val / 2));
    this.setData({
      sheetBudget: val,
      sheetCoverCount: count
    });
  },

  saveSheet: function () {
    var settings = wx.getStorageSync('settings') || {};
    settings.budget = this.data.sheetBudget;
    wx.setStorageSync('settings', settings);
    this.setData({ showSheet: false });
    this.refresh();
    wx.showToast({ title: '额度已保存', icon: 'success' });
  },

  // 采纳透支收紧建议
  onAdoptSuggest: function () {
    var settings = wx.getStorageSync('settings') || {};
    settings.budget = this.data.suggest;
    wx.setStorageSync('settings', settings);
    wx.removeStorageSync('weekSuggest');
    wx.showToast({ title: '本周额度已收紧', icon: 'none' });
    this.refresh();
  },

  // 开球提醒
  onRemind: function () {
    var raws = (this._bestRaw || []).filter(function (m) { return !m.tbd && m.st === 'sched'; });
    if (!raws.length) {
      wx.showToast({ title: '本周暂无可提醒的场次', icon: 'none' });
      return;
    }
    var events = raws.map(function (m) {
      return {
        t: m.t,
        title: '⚽ ' + data.getTeam(m.h).zh + ' vs ' + data.getTeam(m.a).zh + ' · ' + lgZh(m.l),
        desc: '熬夜 ' + engine.tierOf(m).cost + 'h · 夜猫追球',
        alarmMin: 30
      };
    });
    ics.share(events, '夜猫追球-本周看球计划', function (ok, msg) {
      wx.showToast({ title: ok ? '已导出 ' + events.length + ' 场，去日历看看' : (msg || '未导出'), icon: 'none' });
    });
  },

  onMatch: function (e) {
    if (e.currentTarget.dataset.id) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
    } else {
      wx.switchTab({ url: '/pages/schedule/schedule' });
    }
  },

  onShareAppMessage: function () {
    var used = this.data.usedText || '0';
    var count = this.data.best ? this.data.best.length : 0;
    return {
      title: '本周看球熬夜预算已生成：精选 ' + count + ' 场最优组合，预计耗时 ' + used + 'h',
      path: '/pages/week/week'
    };
  }
});

