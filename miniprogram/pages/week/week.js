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
    currentTab: 'best', // 'best' (精选计划) | 'focal' (焦点备选) | 'mine' (避坑雷区) | 'all' (全部赛程)
    tabCounts: {
      best: 0,
      focal: 0,
      mine: 0,
      all: 0
    },
    usedText: '0.0',
    budgetText: '4.0',
    pctText: '0%',
    pctNumber: 0,
    isOverBudget: false,
    
    // 焦点战役与时间线数据
    highlight: null,      // 若只熬一场 · 本周超级头牌战
    best: [],             // 最优精选组合
    filteredJourney: [],  // 根据 Tab 筛选后的路线图
    
    // 统计透视
    nightOwlsCount: 0,    // 硬核深夜场数
    worstCost: '0.0',     // 最狠一夜耗时
    minesCount: 0,        // 避坑雷区数
    
    overNote: '',         // 周一透支结算提示
    suggest: 0,

    // 额度调整抽屉
    showSheet: false,
    sheetBudget: 4.0,
    sheetCoverCount: 2
  },

  onLoad: function () {
    getApp().applyTheme(this);
    var settings = wx.getStorageSync('settings') || {};
    this._lastFollowed = JSON.stringify(getApp().getFollowed());
    this._lastFollowedLeagues = JSON.stringify(getApp().getFollowedLeagues());
    this._lastBudget = settings.budget || 4.0;
    this._lastMinStar = settings.minStar || 1;
    this._lastTodayStr = engine.nightOf(new Date());
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    this.refresh();
  },

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab });
    this.applyTabFilter(tab, this._rawJourney);
  },

  applyTabFilter: function (tab, rawJourney) {
    rawJourney = rawJourney || this._rawJourney || [];
    var filtered = [];
    rawJourney.forEach(function (group) {
      var matches = group.matches.filter(function (m) {
        if (tab === 'best') return m.isBest;
        if (tab === 'focal') return m.isFocal;
        if (tab === 'mine') return m.isMine;
        return true; // 'all'
      });
      if (matches.length > 0) {
        filtered.push({
          day: group.day,
          title: group.title,
          tag: group.tag,
          matches: matches
        });
      }
    });
    this.setData({
      filteredJourney: filtered
    });
  },

  refresh: function () {
    var now = new Date();
    // 严格按自然周截断：从今晚开始，到本周日夜（周日晚至周一凌晨06:00）截止，绝不外溢到下周
    var nowNight = engine.nightOf(now);
    var thisMonday = engine.mondayOfWall(nowNight);
    var monObj = new Date(thisMonday.replace(/-/g, '/') + ' 00:00:00');
    var sunObj = new Date(monObj.getTime() + 6 * 86400000);
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var sundayNightStr = sunObj.getFullYear() + '-' + p2(sunObj.getMonth() + 1) + '-' + p2(sunObj.getDate());

    var start = nowNight;
    var end = sundayNightStr;

    var app = getApp();
    var followed = app.getFollowed() || [];
    var followedLeagues = app.getFollowedLeagues() || data.TOP_LEAGUE_IDS;
    var settings = wx.getStorageSync('settings') || {};
    var budget = settings.budget || 4.0;
    var minStar = settings.minStar || 1;
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var week = data.matchesAll().filter(function (m) {
      var d = engine.owlDay(m.t);
      return d >= start && d <= end;
    });

    var plan = engine.planWeek(week, recMap, rivs, sls, followed, budget, followedLeagues);
    var mines = engine.minefield(week, recMap, rivs, sls, followed, followedLeagues);
    var evs = plan.evs || [];

    // 装饰单场数据对象
    function dec(e, isMine) {
      if (!e || !e.m) return {};
      var f = e.m.t.split('T');
      var d = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var meta = data.LEAGUE_META[e.m.l] || {};
      var hTeam = data.getTeam(e.m.h) || { id: e.m.h, zh: e.m.h, color: '#334155' };
      var aTeam = data.getTeam(e.m.a) || { id: e.m.a, zh: e.m.a, color: '#334155' };
      var tier = engine.tierOf(e.m);
      var idx = (e.index !== undefined && e.index !== null) ? e.index : (e.ev ? engine.owlIndex(e.ev, e.m) : 0);
      var star = e.ev ? e.ev.star : (e.m.s || 1);

      var isFollowedHome = followed.indexOf(e.m.h) >= 0;
      var isFollowedAway = followed.indexOf(e.m.a) >= 0;
      var isFollowedTeam = isFollowedHome || isFollowedAway;
      var followedTeamColor = isFollowedHome ? hTeam.color : (isFollowedAway ? aTeam.color : null);
      var followedTeamName = isFollowedHome ? hTeam.zh : (isFollowedAway ? aTeam.zh : '');
      
      var o = {
        id: e.m.id,
        lgZh: lgZh(e.m.l),
        lg: e.m.l,
        accent: meta.accent || '#1E293B',
        pair: hTeam.zh + ' vs ' + aTeam.zh,
        isFollowedTeam: isFollowedTeam,
        isFollowedHome: isFollowedHome,
        isFollowedAway: isFollowedAway,
        followedTeamColor: followedTeamColor,
        followedTeamName: followedTeamName,
        home: {
          id: hTeam.id,
          zh: hTeam.zh,
          logo: hTeam.logo || '',
          bg: data.tint(hTeam.color, .2),
          bd: data.tint(hTeam.color, .35)
        },
        away: {
          id: aTeam.id,
          zh: aTeam.zh,
          logo: aTeam.logo || '',
          bg: data.tint(aTeam.color, .2),
          bd: data.tint(aTeam.color, .35)
        },
        md: (d.getMonth() + 1) + '/' + d.getDate(),
        dateZh: (d.getMonth() + 1) + '月' + d.getDate() + '日',
        wd: '周' + WEEK[d.getDay()],
        hm: f[1],
        kickoffTimeText: Number(f[1].split(':')[0]) < 6 ? (f[1] + ' 次晨') : f[1],
        exactDateFull: (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + f[1],
        tbd: !!e.m.tbd,
        indexText: idx ? idx.toFixed(1) : '—',
        cost: tier.cost,
        costText: tier.cost > 0 ? ('熬 ' + tier.cost + 'h') : '0 熬夜',
        tier: tier.label,
        tierZh: tier.zh,
        star: star,
        stars: '★★★'.slice(0, star),
        points: (e.ev && e.ev.rec && e.ev.rec.points) ? e.ev.rec.points.slice(0, 2) : []
      };

      if (isMine) {
        o.reason = e.reason || (e.ev && e.ev.star <= 1 ? '看点有限 / 易出沉闷防守战，建议睡觉养生' : '战意不足，建议睡觉');
      } else if (isFollowedTeam) {
        o.reason = '🛡️ ' + followedTeamName + ' 信仰出战 · ' + ((o.points && o.points.length) ? o.points[0] : (star >= 3 ? '关键天王山对决' : '焦点大战'));
      } else {
        o.reason = (o.points && o.points.length) ? o.points[0] : (star >= 3 ? '全欧争冠焦点大战' : (tier.cost === 0 ? '黄金档无需熬夜' : '焦点对话'));
      }
      return o;
    }

    var used = plan.used || 0;
    var pct = Math.min(1, budget > 0 ? used / budget : 0);

    // 挑选本周若只熬一场（超级头牌战，优先信仰主队焦点大战）
    var followedHl = evs.filter(function (e) {
      return !e.m.tbd && (followed.indexOf(e.m.h) >= 0 || followed.indexOf(e.m.a) >= 0);
    })[0];
    var hlCandidate = followedHl || evs.filter(function (e) { return !e.m.tbd; })[0] || evs[0] || null;
    var highlight = hlCandidate ? dec(hlCandidate, false) : null;

    // 构建 Day-by-Day 观赛路线图（主次分明、拒绝信息轰炸）
    var dayKeys = [];
    week.forEach(function (m) {
      var d = engine.owlDay(m.t);
      if (dayKeys.indexOf(d) < 0) dayKeys.push(d);
    });
    dayKeys.sort();

    var bestMidMap = {};
    (plan.best || []).forEach(function (e) { bestMidMap[e.m.id] = e; });
    var mineMidMap = {};
    (mines || []).forEach(function (e) { mineMidMap[e.m.id] = e; });
    var evsMidMap = {};
    evs.forEach(function (e) { evsMidMap[e.m.id] = e; });

    var journeyList = [];
    var dailyCostMap = {};

    dayKeys.forEach(function (day) {
      var dayMatches = week.filter(function (m) { return engine.owlDay(m.t) === day; });
      if (!dayMatches.length) return;

      var dObj = new Date(day.replace(/-/g, '/') + ' 00:00:00');
      var isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
      var dayTitle = '周' + WEEK[dObj.getDay()] + '夜 · ' + (dObj.getMonth() + 1) + '月' + dObj.getDate() + '日';
      var tag = isWeekend ? '🔥 超级足球夜' : (dObj.getDay() === 5 ? '⚡️ 周末揭幕战' : '🌙 周中比赛日');

      var dayCards = [];

      dayMatches.forEach(function (m) {
        var isBest = !!bestMidMap[m.id];
        var isMine = !!mineMidMap[m.id];
        var isFocal = evsMidMap[m.id] && evsMidMap[m.id].ev && evsMidMap[m.id].ev.star >= 2;
        var isFollowed = (followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0);

        if (isBest) {
          var cost = engine.tierOf(m).cost || 0;
          dailyCostMap[day] = (dailyCostMap[day] || 0) + cost;
        }

        if (isBest || isMine || isFocal || isFollowed) {
          var card = dec(evsMidMap[m.id] || { m: m }, isMine);
          card.isBest = isBest;
          card.isMine = isMine;
          card.isFocal = !isBest && !isMine;
          card._sortTs = engine.ts(m.t); // 携带开球时间戳供排序（三轮 P2-11）
          dayCards.push(card);
        }
      });

      // 如果某天没有精选但有场次，至少保留首场作为焦点展示
      if (!dayCards.length && dayMatches.length) {
        var topM = dayMatches[0];
        var card = dec(evsMidMap[topM.id] || { m: topM }, false);
        card.isFocal = true;
        card._sortTs = engine.ts(topM.t);
        dayCards.push(card);
      }

      // 按开球时间排序（三轮 P2-11：hm 字符串排序会把凌晨场排在晚场前，
      // 同一 owlDay 内 22:xx 与次日 00:xx-06:xx 混排时错位；改用时间戳）
      dayCards.sort(function (a, b) {
        return (a._sortTs || 0) - (b._sortTs || 0);
      });
      dayCards.forEach(function (c) { delete c._sortTs; }); // 排序键不进 setData

      if (dayCards.length > 0) {
        journeyList.push({
          day: day,
          title: dayTitle,
          tag: tag,
          matches: dayCards
        });
      }
    });

    var countBest = 0, countTeam = 0, countFocal = 0, countMine = 0, countAll = 0;
    journeyList.forEach(function (group) {
      group.matches.forEach(function (m) {
        countAll++;
        if (m.isBest) countBest++;
        if (m.isFollowedTeam) countTeam++;
        if (m.isFocal) countFocal++;
        if (m.isMine) countMine++;
      });
    });

    this._rawJourney = journeyList;

    var maxDailyCost = 0;
    Object.keys(dailyCostMap).forEach(function (k) {
      if (dailyCostMap[k] > maxDailyCost) maxDailyCost = dailyCostMap[k];
    });

    // 周一透支结算提示
    var thisWeek = engine.weekStartBJ(Date.now());
    var lastWeek = engine.weekStartBJ(Date.now() - 7 * 86400000);
    var settleKey = 'settled_' + thisWeek.str;
    var overNote = '', suggest = 0;
    if (!wx.getStorageSync(settleKey)) {
      var actual = 0;
      var checkins = wx.getStorageSync('checkins') || {};
      Object.keys(checkins).forEach(function (k) {
        var c = checkins[k];
        if (c.wk ? c.wk === lastWeek.str : (c.ts >= lastWeek.ts && c.ts < thisWeek.ts)) actual += c.cost || 0;
      });
      wx.setStorageSync(settleKey, 1);
      if (actual > budget + 0.01) {
        suggest = Math.max(1, Math.round((budget - (actual - budget) / 2) * 2) / 2);
        wx.setStorageSync('weekSuggest', { week: lastWeek.str, budget: budget, suggest: suggest, actual: actual });
        overNote = '上周透支 ' + (actual - budget).toFixed(1) + 'h，建议本周收紧至 ' + suggest.toFixed(1) + 'h';
      }
    }
    var sug = wx.getStorageSync('weekSuggest');
    if (sug && sug.week === lastWeek.str && sug.suggest && sug.suggest < budget) {
      overNote = '上周实际透支 ' + sug.actual.toFixed(1) + 'h，建议本周收紧至 ' + sug.suggest.toFixed(1) + 'h';
      suggest = sug.suggest;
    }

    this._bestRaw = (plan.best || []).map(function (e) { return e.m; });

    this.setData({
      usedText: used.toFixed(1),
      budgetText: budget.toFixed(1),
      pctText: Math.round(pct * 100) + '%',
      pctNumber: Math.min(100, Math.round(pct * 100)),
      isOverBudget: used > budget,
      highlight: highlight,
      best: (plan.best || []).map(function (e) { return dec(e, false); }),
      tabCounts: {
        best: countBest,
        team: countTeam,
        focal: countFocal,
        mine: countMine,
        all: countAll
      },
      hasFollowedTeamMatches: countTeam > 0,
      nightOwlsCount: evs.filter(function (e) { return !e.m.tbd && engine.tierOf(e.m).cost >= 2.0; }).length,
      worstCost: maxDailyCost.toFixed(1),
      minesCount: mines.length,
      overNote: overNote,
      suggest: suggest,
      sheetBudget: budget,
      sheetCoverCount: plan.best.filter(function(x) { return x.ev && x.ev.star >= 3; }).length
    });

    this.applyTabFilter(this.data.currentTab, journeyList);
  },

  // 快捷导出日历
  onExportCal: function () {
    var raws = (this._bestRaw || []).filter(function (m) { return !m.tbd && m.st === 'sched'; });
    if (!raws.length) {
      wx.showToast({ title: '本周暂无可导出的计划场次', icon: 'none' });
      return;
    }
    var followed = getApp().getFollowed() || [];
    var events = raws.map(function (m) {
      var isFollowed = (followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0);
      var prefix = isFollowed ? '⚽ [信仰主队] ' : '⚽ ';
      return {
        t: m.t,
        title: prefix + data.getTeam(m.h).zh + ' vs ' + data.getTeam(m.a).zh + ' · ' + lgZh(m.l),
        desc: '熬夜 ' + engine.tierOf(m).cost + 'h · 夜猫追球',
        alarmMin: 30
      };
    });
    ics.share(events, '夜猫追球-本周看球计划', function (ok, msg) {
      wx.showToast({ title: ok ? '已导出 ' + events.length + ' 场计划至日历' : (msg || '导出已取消'), icon: 'none' });
    });
  },

  // 调整额度抽屉
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
    wx.showToast({ title: '预算已更新', icon: 'success' });
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

  onMatch: function (e) {
    if (e.currentTarget.dataset.id) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
    }
  },

  onShareAppMessage: function () {
    var used = this.data.usedText || '0.0';
    var count = this.data.best ? this.data.best.length : 0;
    return {
      title: '【夜猫追球 · 本周观赛计划】精选 ' + count + ' 场焦点大战，预计需熬 ' + used + 'h！一起来追球 →',
      path: '/pages/week/week'
    };
  }
});

