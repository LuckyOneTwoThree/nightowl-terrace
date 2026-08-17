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
    ringStyle: '',
    ringDeg: 0,
    best: [],
    alt: [],
    focal: [],
    highlight: null,
    mines: [],
    nightOwls: [],
    overNote: '',      // 周一透支结算提示（PM 9.1）
    suggest: 0
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

    // 跨联赛焦点 Top 5–8（PM 第四节：星级降序 + 指数排序，星级下限可筛）
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
        indexText: e.index.toFixed(1),
        costText: '-' + engine.tierOf(e.m).cost + 'h',
        tier: engine.tierOf(e.m).label
      };
      if (withReason) o.reason = e.reason || '';
      return o;
    }

    var used = plan.used;
    var pct = Math.min(1, used / budget);

    // 周一透支结算（PM 9.1）：每周首个 onShow 结算一次，超支自动收紧建议额度
    var settleKey = 'settled_' + start;
    var overNote = '', suggest = 0;
    if (!wx.getStorageSync(settleKey)) {
      var lastWeekFrom = now.getTime() - 7 * 86400000;
      var actual = 0;
      var checkins = wx.getStorageSync('checkins') || {};
      Object.keys(checkins).forEach(function (k) {
        var c = checkins[k];
        if (c.ts >= lastWeekFrom && c.ts < now.getTime()) actual += c.cost || 0;
      });
      wx.setStorageSync(settleKey, 1);
      if (actual > budget + 0.01) {
        suggest = Math.max(1, Math.round((budget - (actual - budget) / 2) * 2) / 2);
        wx.setStorageSync('weekSuggest', { budget: budget, suggest: suggest, actual: actual });
      }
    }
    var sug = wx.getStorageSync('weekSuggest');
    if (sug && sug.suggest && sug.suggest < budget) {
      overNote = '上周实际透支 ' + sug.actual.toFixed(1) + 'h，超支 ' + (sug.actual - sug.budget).toFixed(1) + 'h';
      suggest = sug.suggest;
    }

    // 保留原始记录供 ICS 批量导出（dec 产物不含原始 t）
    this._bestRaw = plan.best.map(function (e) { return e.m; });

    this.setData({
      usedText: used.toFixed(1),
      budgetText: budget.toFixed(1),
      ringStyle: 'background: conic-gradient(#FFB224 0% ' + (pct * 100) + '%, #31353B ' + (pct * 100) + '% 100%);',
      ringDeg: Math.round(pct * 360),
      best: plan.best.map(function (e) { return dec(e, false); }),
      alt: plan.alt.map(function (e) { return dec(e, false); }),
      focal: focal.map(function (e) {
        var d = dec(e, false);
        d.stars = '★★★'.slice(0, e.ev.star);
        return d;
      }),
      highlight: evs.length ? dec(evs[0], false) : null,
      mines: mines.map(function (e) { return dec(e, true); }),
      nightOwls: evs.filter(function (e) { return engine.tierOf(e.m).cost >= 2.5; }).slice(0, 6)
        .map(function (e) { return dec(e, false); }),
      overNote: overNote,
      suggest: suggest
    });
  },

  // 页内调额（PM 9.1「调额即时重算」）
  onBudgetStep: function (e) {
    var dir = Number(e.currentTarget.dataset.d);
    var settings = wx.getStorageSync('settings') || {};
    var budget = Math.min(12, Math.max(1, Math.round(((settings.budget || 4.0) + dir * 0.5) * 2) / 2));
    settings.budget = budget;
    wx.setStorageSync('settings', settings);
    this.refresh();
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
  // 开球提醒：订阅消息未过审前的 ICS 兜底（PM 十一），一键导出最优组合
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
