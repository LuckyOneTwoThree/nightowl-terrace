var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var ics = require('../../utils/ics.js');

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

    // _16 抽屉状态
    showSheet: false,
    sheetBudget: 4.0,
    sheetCoverCount: 2
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
    var settings = wx.getStorageSync('settings') || {};
    var budget = settings.budget || 4.0;
    var minStar = settings.minStar || 1;
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var week = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end;
    });

    var plan = engine.planWeek(week, recMap, rivs, sls, followed, budget);
    var mines = engine.minefield(week, recMap, rivs, sls, followed);

    var evs = week.filter(function (m) { return m.st === 'sched'; })
      .map(function (m) {
        var ev = engine.evaluate(m, recMap, rivs, sls, followed);
        return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
      })
      .sort(function (a, b) { return b.index - a.index; });

    // 跨联赛焦点 Top 5–8
    var focal = evs.filter(function (e) { return e.ev.star >= Math.max(2, minStar); })
      .sort(function (a, b) { return b.ev.star - a.ev.star || b.index - a.index; })
      .slice(0, 8);

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
        tbd: !!e.m.tbd, // 时间待定：S 档与成本为占位值，仅作提示
        indexText: e.index.toFixed(1),
        costText: '-' + engine.tierOf(e.m).cost + 'h',
        tier: engine.tierOf(e.m).label
      };
      if (withReason) o.reason = e.reason || '';
      return o;
    }

    var used = plan.used;
    var pct = Math.min(1, budget > 0 ? used / budget : 0);

    // 周一透支结算（PM 9.1）：按自然周结算，每周只结算一次上周
    var monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * 86400000);
    var mondayStr = engine.dateStr(monday);
    var lastMondayStr = engine.dateStr(new Date(monday.getTime() - 7 * 86400000));
    var settleKey = 'settled_' + mondayStr;
    var overNote = '', suggest = 0;
    if (!wx.getStorageSync(settleKey)) {
      var lastFrom = monday.getTime() - 7 * 86400000;
      var actual = 0;
      var checkins = wx.getStorageSync('checkins') || {};
      Object.keys(checkins).forEach(function (k) {
        var c = checkins[k];
        // 优先用打卡时记录的比赛归属周（凌晨场归前一晚的周），无 wk 时回退时间戳区间
        if (c.wk ? c.wk === lastMondayStr : (c.ts >= lastFrom && c.ts < monday.getTime())) actual += c.cost || 0;
      });
      wx.setStorageSync(settleKey, 1);
      if (actual > budget + 0.01) {
        suggest = Math.max(1, Math.round((budget - (actual - budget) / 2) * 2) / 2);
        wx.setStorageSync('weekSuggest', { budget: budget, suggest: suggest, actual: actual });
      }
    }
    var sug = wx.getStorageSync('weekSuggest');
    if (sug && sug.suggest && sug.suggest < budget) {
      overNote = '上周实际透支 ' + sug.actual.toFixed(1) + 'h，建议本周收紧';
      suggest = sug.suggest;
    }

    this._bestRaw = plan.best.map(function (e) { return e.m; });
    this._allEvs = evs;

    this.setData({
      usedText: used.toFixed(1),
      budgetText: budget.toFixed(1),
      pctText: Math.round(pct * 100) + '%',
      ringStyle: 'background: conic-gradient(#FFB224 0% ' + (pct * 100) + '%, #262A30 ' + (pct * 100) + '% 100%);',
      ringDeg: Math.round(pct * 360),
      best: plan.best.map(function (e) { return dec(e, false); }),
      alt: plan.alt.map(function (e) { return dec(e, false); }),
      focal: focal.map(function (e) {
        var d = dec(e, false);
        d.stars = '★★★'.slice(0, e.ev.star);
        return d;
      }),
      // 本周之最取指数最高且时间已确定的场次（tbd 指数含占位成本，不可比）
      highlight: evs.filter(function (e) { return !e.m.tbd; })[0] ? dec(evs.filter(function (e) { return !e.m.tbd; })[0], false) : null,
      mines: mines.map(function (e) { return dec(e, true); }),
      nightOwls: evs.filter(function (e) { return !e.m.tbd && engine.tierOf(e.m).cost >= 2.5; }).slice(0, 6)
        .map(function (e) { return dec(e, false); }),
      overNote: overNote,
      suggest: suggest,
      sheetBudget: budget,
      sheetCoverCount: plan.best.filter(function(x) { return x.ev.star >= 3; }).length
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
        desc: '熬夜 ' + engine.tierOf(m).cost + 'h · 夜猫看台',
        alarmMin: 30
      };
    });
    ics.share(events, '夜猫看台-本周看球计划', function (ok, msg) {
      wx.showToast({ title: ok ? '已导出 ' + events.length + ' 场，去日历看看' : (msg || '未导出'), icon: 'none' });
    });
  },

  onMatch: function (e) {
    if (e.currentTarget.dataset.id) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
    } else {
      wx.switchTab({ url: '/pages/schedule/schedule' });
    }
  }
});

