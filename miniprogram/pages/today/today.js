var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var decorateUtil = require('../../utils/decorate.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

function fmt(t) {
  var parts = t.split('T');
  var d = new Date(parts[0].replace(/-/g, '/') + ' 00:00:00');
  return {
    md: (d.getMonth() + 1) + '月' + d.getDate() + '日',
    week: '周' + WEEK[d.getDay()],
    hm: parts[1]
  };
}

// 统一装饰器：输出 WXML 可直接绑定的字段（模板内不跑逻辑）
function decorate(entry) {
  var m = entry.m;
  var h = data.getTeam(m.h);
  var a = data.getTeam(m.a);
  var meta = data.LEAGUE_META[m.l] || {};
  var f = fmt(m.t);
  var decResult = decorateUtil.dec(m, entry.ev);
  return {
    id: m.id,
    lgZh: lgZh(m.l),
    lgSolid: meta.solid || '#514533',
    lgAccent: meta.accent || '#514533',
    home: { id: h.id, zh: h.zh, color: h.color, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35), logo: h.logo },
    away: { id: a.id, zh: a.zh, color: a.color, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35), logo: a.logo },
    hm: f.hm,
    md: f.md,
    week: f.week,
    dayLabel: decResult.dayLabel,
    dateHeader: decResult.dateHeader,
    tbd: m.tbd,
    st: m.st,
    local: decorateUtil.localTime(m), // 当地开球时间（PM 7.1 Hero 小字）
    tv: m.tv || null,                 // 转播平台位（数据运营补录后自动展示）
    trivia: entry.ev.rec && entry.ev.rec.trivia ? entry.ev.rec.trivia : null, // 每日冷知识（PM 7.7）
    star: entry.ev.star,
    stars: '★★★'.slice(0, entry.ev.star),
    points: entry.ev.rec ? entry.ev.rec.points.slice(0, 3) : [],
    indexText: engine.owlIndex(entry.ev, m).toFixed(1),
    tier: engine.tierOf(m).label,
    cost: engine.tierOf(m).cost,
    focal: entry.ev.star >= 3,
    storyNames: entry.ev.stories.map(function (s) { return s.name; }),
    storyIds: entry.ev.storyIds
  };
}

Page({
  data: {
    theme: data.getInitTheme(),
    dateLabel: '',
    quip: '',
    hero: null,
    countdownText: '--:--:--',
    extras: [],
    tomorrow: [],
    nextFocal: null,
    replays: [],
    tbd: [],
    stories: []
  },

  onLoad: function () {
    this._timer = null;
    this._lastFollowed = JSON.stringify(getApp().getFollowed());
    this._lastTodayStr = engine.nightOf(new Date());
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    // 首次进入引导选主队（_15）
    if (!wx.getStorageSync('onboarded')) {
      wx.navigateTo({ url: '/pages/onboarding/onboarding' });
      return;
    }
    // 仅在关注球队变化或跨天时才重新执行全量计算，切 Tab 保持平滑无闪烁
    var curFollowed = JSON.stringify(getApp().getFollowed());
    var curTodayStr = engine.nightOf(new Date());
    if (this._lastFollowed !== curFollowed || this._lastTodayStr !== curTodayStr) {
      this._lastFollowed = curFollowed;
      this._lastTodayStr = curTodayStr;
      this.refresh();
    } else if (this.data.hero && this._heroTime && !this._timer) {
      this.startCountdown(this._heroTime);
    }
  },

  onHide: function () {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onUnload: function () {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  refresh: function () {
    this._loaded = true;
    var now = new Date();
    // 夜猫口径「今日」：凌晨 00:00–06:00 归前一晚（与 matchesOfDay 一致）
    var todayStr = engine.nightOf(now);
    var tmrStr = engine.nightOf(new Date(now.getTime() + 86400000));
    var nightDate = new Date(todayStr.replace(/-/g, '/') + ' 00:00:00');

    var app = getApp();
    var followed = app.getFollowed();
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var pick = engine.pickToday(data.matchesOfDay(todayStr), recMap, rivs, sls, followed);
    var tmrPick = engine.pickToday(data.matchesOfDay(tmrStr), recMap, rivs, sls, followed);
    var focal = engine.nextFocal(data.matchesAll(), recMap, rivs, sls, followed, Date.now());

    // tbd 场次（开球时间未公布）：不进今晚之选/背包，但今日页以「时间待定」列出（关注球队优先）
    var tbdList = data.matchesOfDay(todayStr).filter(function (m) {
      return m.tbd && m.st === 'sched';
    }).map(function (m) {
      var ev = engine.evaluate(m, recMap, rivs, sls, followed);
      var cared = followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0;
      return { d: decorate({ m: m, ev: ev }), cared: cared };
    }).sort(function (x, y) { return y.cared - x.cared; })
      .map(function (x) { return x.d; });

    // 补番：本季已赛 + 剧透屏蔽标（sc 未补录时模糊看点文案）
    var rp = engine.replays(data.matchesAll(), recMap, 3).map(function (r) {
      var h = data.getTeam(r.m.h);
      var a = data.getTeam(r.m.a);
      var lg = (data.LEAGUES.filter(function (x) { return x.id === r.m.l; })[0] || {});
      return {
        id: r.m.id,
        lgZh: lgZh(r.m.l) + (r.m.r ? ' 第' + r.m.r + '轮' : ''),
        pair: h.zh + ' vs ' + a.zh,
        homeLogo: h.logo, homeBg: data.tint(h.color, .2), homeBd: data.tint(h.color, .35), homeCode: h.id,
        awayLogo: a.logo, awayBg: data.tint(a.color, .2), awayBd: data.tint(a.color, .35), awayCode: a.id,
        teaser: r.m.sc ? '比分 ' + r.m.sc : '看点封存中 · 点击无剧透回顾'
      };
    });

    var stories = sls.filter(function (s) { return s.nodes.length > 0; }).map(function (s) {
      return {
        id: s.id,
        name: s.name,
        desc: s.desc,
        typeZh: { title: '争冠', league: '格局', relegation: '保级', data: '数据', suspense: '悬念', background: '背景' }[s.type] || s.type,
        ep: '第1集 · 全季连载'
      };
    });

    this.setData({
      dateLabel: (nightDate.getMonth() + 1) + '月' + nightDate.getDate() + '日 周' + WEEK[nightDate.getDay()],
      quip: data.getQuip(todayStr),
      hero: pick.hero ? decorate(pick.hero) : null,
      extras: pick.extras.map(decorate),
      tomorrow: (tmrPick.hero ? [tmrPick.hero].concat(tmrPick.extras) : []).slice(0, 3).map(decorate),
      nextFocal: focal ? (function () {
        var d = decorate(focal);
        var c = engine.countdown(engine.ts(focal.m.t), Date.now());
        d.cdD = c.d;
        d.cdH = c.h;
        return d;
      })() : null,
      replays: rp,
      tbd: tbdList,
      stories: stories
    });

    if (pick.hero) {
      this._heroTime = pick.hero.m.t;
      this.startCountdown(pick.hero.m.t);
    }
  },

  startCountdown: function (t) {
    var that = this;
    if (this._timer) clearInterval(this._timer);
    var target = engine.ts(t);
    var tick = function () {
      var c = engine.countdown(target, Date.now());
      var text;
      if (c.over) {
        text = '比赛中';
      } else if (c.d > 0) {
        text = '距开球 ' + c.d + '天' + c.h + '小时';
      } else if (c.h > 0) {
        text = '距开球 ' + c.h + '小时' + c.m + '分';
      } else {
        text = '距开球 ' + c.m + '分' + c.s + '秒';
      }
      that.setData({ countdownText: text });
    };
    tick();
    this._timer = setInterval(tick, 1000);
  },

  onPoster: function () {
    if (this.data.hero) wx.navigateTo({ url: '/pages/poster/poster?id=' + this.data.hero.id });
  },
  onStoryTap: function (e) {
    wx.navigateTo({ url: '/pages/story/story?id=' + e.currentTarget.dataset.id });
  },
  goAllStories: function () {
    var first = this.data.stories && this.data.stories[0];
    if (first) {
      wx.navigateTo({ url: '/pages/story/story?id=' + first.id });
    }
  },
  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
  onCal: function () {
    wx.switchTab({ url: '/pages/schedule/schedule' });
  },

  // 群分享（PM 主场景微信群）：带今晚 Hero 对阵引流
  onShareAppMessage: function () {
    var hero = this.data.hero;
    return {
      title: hero
        ? '今晚熬不熬？' + hero.home.zh + ' vs ' + hero.away.zh + '（' + hero.stars + ' · 熬' + hero.cost + 'h）'
        : '夜猫看台 · 3 秒回答今晚该熬哪一场',
      path: '/pages/today/today'
    };
  }
});
