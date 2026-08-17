var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function fmtDate(t) {
  var parts = t.split('T');
  var d = new Date(parts[0].replace(/-/g, '/') + ' 00:00:00');
  var hm = parts[1].split(':');
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()] + ' ' + hm[0] + ':' + hm[1];
}

function localTime(t) {
  // 当地时间展示（夏令时：英超-7，欧陆-6；冬令时：-8/-7）
  var bj = new Date(t.replace('T', ' ') + ':00');
  var isSummer = (bj.getMonth() >= 2 && bj.getMonth() <= 9); // 3月末–10月末 粗略口径
  var offset = 7; // 英超夏令时默认
  var ms = bj.getTime() - (isSummer ? 7 : 8) * 3600000;
  var loc = new Date(ms);
  return loc;
}

function decorate(entry) {
  var m = entry.m;
  var h = data.getTeam(m.h);
  var a = data.getTeam(m.a);
  return {
    id: m.id,
    lg: m.l,
    lgZh: (data.LEAGUES.filter(function (x) { return x.id === m.l; })[0] || {}).zh || m.l,
    home: { id: h.id, zh: h.zh, color: h.color },
    away: { id: a.id, zh: a.zh, color: a.color },
    timeText: fmtDate(m.t),
    tbd: m.tbd,
    st: m.st,
    sc: m.sc,
    star: entry.ev.star,
    stars: '★★★'.slice(0, entry.ev.star) + '☆☆☆'.slice(0, 3 - entry.ev.star),
    points: entry.ev.rec ? entry.ev.rec.points : [],
    indexText: entry.index.toFixed(1),
    tier: engine.tierOf(m).label,
    tierZh: engine.tierOf(m).zh,
    cost: engine.tierOf(m).cost,
    storyNames: entry.ev.stories.map(function (s) { return s.name; }),
    rivalry: entry.ev.rivalry,
    bonuses: entry.ev.bonuses,
    ts: engine.ts(m.t)
  };
}

Page({
  data: {
    dateText: '',
    hasMatch: false,
    hero: null,
    countdownText: '',
    extras: [],
    tomorrow: [],
    replays: [],
    stories: [],
    quip: ''
  },

  onLoad: function () {
    this._timer = null;
    this.refresh();
  },

  onUnload: function () {
    if (this._timer) clearInterval(this._timer);
  },

  refresh: function () {
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1) + '-' + (now.getDate() < 10 ? '0' : '') + now.getDate();
    var tomorrow = new Date(now.getTime() + 86400000);
    var tmrStr = tomorrow.getFullYear() + '-' + (tomorrow.getMonth() + 1 < 10 ? '0' : '') + (tomorrow.getMonth() + 1) + '-' + (tomorrow.getDate() < 10 ? '0' : '') + tomorrow.getDate();

    var app = getApp();
    var followed = app.getFollowed();
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var todayMatches = data.matchesOfDay(todayStr);
    var tmrMatches = data.matchesOfDay(tmrStr);

    var pick = engine.pickToday(todayMatches, recMap, rivs, sls, followed);
    var tmrPick = engine.pickToday(tmrMatches, recMap, rivs, sls, followed);

    var rp = engine.replays(data.matchesAll(), recMap, 3);

    var stories = data.getStorylines().filter(function (s) { return s.nodes.length > 0; }).map(function (s) {
      return { id: s.id, name: s.name, desc: s.desc, type: s.type };
    });

    this.setData({
      dateText: (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + WEEK[now.getDay()],
      hasMatch: !!pick.hero,
      hero: pick.hero ? decorate(pick.hero) : null,
      extras: pick.extras.map(decorate),
      tomorrow: (tmrPick.hero ? [tmrPick.hero].concat(tmrPick.extras) : []).slice(0, 3).map(decorate),
      replays: rp.map(function (r) {
        var h = data.getTeam(r.m.h);
        var a = data.getTeam(r.m.a);
        return {
          id: r.m.id,
          pair: h.zh + ' v ' + a.zh,
          star: r.star,
          sc: r.m.sc,
          replay: r.replay
        };
      }),
      stories: stories,
      quip: data.getQuip(todayStr)
    });

    if (pick.hero) this.startCountdown(pick.hero.m.t);
  },

  startCountdown: function (t) {
    var that = this;
    if (this._timer) clearInterval(this._timer);
    var target = engine.ts(t);
    var tick = function () {
      var c = engine.countdown(target, Date.now());
      var text = c.over
        ? '比赛时段'
        : (c.d > 0 ? c.d + '天' : '') + String(c.h).padStart(2, '0') + ':' + String(c.m).padStart(2, '0') + ':' + String(c.s).padStart(2, '0') + ' 后开球';
      that.setData({ countdownText: text });
    };
    tick();
    this._timer = setInterval(tick, 1000);
  },

  onPoster: function () {
    wx.showToast({ title: '海报导出 v1 上线', icon: 'none' });
  },

  onStoryTap: function () {
    wx.showToast({ title: '故事线时间轴 v1 上线', icon: 'none' });
  }
});
