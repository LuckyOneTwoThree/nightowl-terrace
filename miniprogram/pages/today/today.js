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
  var isTmr = engine.ts(m.t) - Date.now() > 86400000;
  return {
    id: m.id,
    lgZh: lgZh(m.l),
    lgSolid: meta.solid || '#514533',
    lgAccent: meta.accent || '#514533',
    home: { id: h.id, zh: h.zh, color: h.color, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
    away: { id: a.id, zh: a.zh, color: a.color, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
    hm: f.hm,
    md: f.md,
    week: f.week,
    dayLabel: isTmr ? '明天' : '今天',
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
    dateLabel: '',
    quip: '',
    hero: null,
    countdownText: '--:--:--',
    extras: [],
    tomorrow: [],
    nextFocal: null,
    replays: [],
    stories: []
  },

  onLoad: function () {
    this._timer = null;
    this.refresh();
  },

  onShow: function () {
    // 首次进入引导选主队（_15）
    if (!wx.getStorageSync('onboarded')) {
      wx.navigateTo({ url: '/pages/onboarding/onboarding' });
      return;
    }
    // 关注球队变化后回到本页时刷新提级
    if (this._loaded) this.refresh();
  },

  onUnload: function () {
    if (this._timer) clearInterval(this._timer);
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

    // 补番：本季已赛 + 剧透屏蔽标（sc 未补录时模糊看点文案）
    var rp = engine.replays(data.matchesAll(), recMap, 3).map(function (r) {
      var h = data.getTeam(r.m.h);
      var a = data.getTeam(r.m.a);
      var lg = (data.LEAGUES.filter(function (x) { return x.id === r.m.l; })[0] || {});
      return {
        id: r.m.id,
        lgZh: lgZh(r.m.l) + (r.m.r ? ' 第' + r.m.r + '轮' : ''),
        pair: h.zh + ' vs ' + a.zh,
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
      stories: stories
    });

    if (pick.hero) this.startCountdown(pick.hero.m.t);
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
  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
  onCal: function () {
    wx.switchTab({ url: '/pages/schedule/schedule' });
  }
});
