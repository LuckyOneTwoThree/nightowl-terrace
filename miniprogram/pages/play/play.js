var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');
var router = require('../../utils/router.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var OPTIONS = [
  { key: 'h', zh: '主胜' },
  { key: 'd', zh: '平局' },
  { key: 'a', zh: '客胜' }
];

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  data: {
    theme: data.getInitTheme(),
    cards: [],
    guesses: [],
    options: OPTIONS,
    seasonPts: 0,
    hitRate: '—',
    sealedCount: 0,
    totalWeekMatches: 0,
    boxMatch: null,
    isDrawing: false
  },

  onLoad: function () {
    getApp().applyTheme(this);
    this._lastPredsStr = JSON.stringify(wx.getStorageSync('predictions') || {});
    this._lastDayStr = engine.nightOf(Date.now());
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    var curPredsStr = JSON.stringify(wx.getStorageSync('predictions') || {});
    var curDay = engine.nightOf(Date.now());
    if (this._lastPredsStr !== curPredsStr || this._lastDayStr !== curDay) {
      this._lastPredsStr = curPredsStr;
      this._lastDayStr = curDay;
      this.refresh();
    }
  },

  refresh: function () {
    var now = new Date();
    var start = engine.nightOf(now);
    var endD = new Date(now.getTime() + 7 * 86400000);
    var end = engine.nightOf(endD);

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    var followed = getApp().getFollowed() || [];
    var followedLeagues = getApp().getFollowedLeagues() || data.TOP_LEAGUE_IDS;

    var weekSched = data.matchesAll().filter(function (m) {
      var d = engine.owlDay(m.t);
      return d >= start && d <= end && m.st === 'sched' && !m.tbd;
    });

    var evaluated = weekSched.map(function (m) {
      var ev = engine.evaluate(m, recMap, rivs, sls, followed, followedLeagues);
      return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
    });

    var owlCount = evaluated.filter(function (e) { return engine.tierOf(e.m).cost >= 2.5; }).length;
    var boasts = wx.getStorageSync('boasts') || {};

    // 本周竞猜单：与 predict 页同口径（星级降序 → 指数降序）取前 3 张速览
    var preds = wx.getStorageSync('predictions') || {};
    var sealedCount = Object.keys(preds).filter(function (mid) {
      return weekSched.some(function (m) { return m.id === mid; });
    }).length;

    var guesses = evaluated.slice()
      .sort(function (x, y) { return y.ev.star - x.ev.star || y.index - x.index; })
      .slice(0, 3).map(function (e) {
      var f = e.m.t.split('T');
      var d = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var h = data.getTeam(e.m.h);
      var a = data.getTeam(e.m.a);
      var meta = data.LEAGUE_META[e.m.l] || {};
      return {
        id: e.m.id,
        l: e.m.l,
        lgZh: lgZh(e.m.l),
        solid: meta.solid || '#7C3AED',
        timeText: (d.getMonth() + 1) + '/' + d.getDate() + ' 周' + WEEK[d.getDay()] + ' ' + f[1],
        home: { zh: h.zh, id: h.id, logo: h.logo, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
        away: { zh: a.zh, id: a.id, logo: a.logo, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
        star: e.ev.star,
        stars: '★★★'.slice(0, e.ev.star),
        isDerby: !!e.ev.rivalry,
        pick: (preds[e.m.id] || {}).pick || ''
      };
    });

    // 本地赛季积分与胜率
    var seasonPts = 0, hitCount = 0, totalSettled = 0;
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid], mm = data.getMatch(mid);
      if (!mm) return;
      if (!crypt.verify(p)) return;
      if (p.ts && p.ts > engine.ts(mm.t) + 60000) return;
      var r = engine.settlePred(p, mm, recMap);
      if (r) {
        seasonPts += r.pts;
        totalSettled++;
        if (r.hit) hitCount++;
      }
    });

    var hitRate = totalSettled > 0 ? Math.round(hitCount * 100 / totalSettled) + '%' : '—';

    // 盲盒摇号候选池
    this._boxPool = evaluated.slice();

    this.setData({
      cards: [
        { id: 'guess', name: '盲评猜球', iconClass: 'v-soccer', colorClass: 'c-amber', sub: '本周可猜 ' + evaluated.length + ' 场', badge: sealedCount + '/' + evaluated.length + ' 封存' },
        { id: 'court', name: '德比法庭', iconClass: 'v-gavel', colorClass: 'c-red', sub: '死忠互呛 · 狂言存档', badge: Object.keys(boasts).length + ' 条狂言' },
        { id: 'box', name: '盲盒开球', iconClass: 'v-gift', colorClass: 'c-violet', sub: '特征翻转 · 随机盲抽', badge: '深夜选场' },
        { id: 'owl', name: '夜猫风云榜', iconClass: 'v-moon', colorClass: 'c-teal', sub: '本周深夜 ' + owlCount + ' 场', badge: '打卡天梯' }
      ],
      guesses: guesses,
      seasonPts: seasonPts,
      hitRate: hitRate,
      sealedCount: sealedCount,
      totalWeekMatches: evaluated.length
    });
  },

  onDrawBox: function () {
    var that = this;
    if (!this._boxPool || !this._boxPool.length) {
      wx.showToast({ title: '暂无可抽取的未赛赛程', icon: 'none' });
      return;
    }
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    this.setData({ isDrawing: true });

    setTimeout(function () {
      var randIdx = Math.floor(Math.random() * that._boxPool.length);
      var item = that._boxPool[randIdx];
      var m = item.m;
      var h = data.getTeam(m.h);
      var a = data.getTeam(m.a);
      var f = m.t.split('T');
      var d = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var meta = data.LEAGUE_META[m.l] || {};
      var tier = engine.tierOf(m);

      var boxMatch = {
        id: m.id,
        lgZh: lgZh(m.l),
        solid: meta.solid || '#7C3AED',
        timeText: (d.getMonth() + 1) + '/' + d.getDate() + ' 周' + WEEK[d.getDay()] + ' ' + f[1],
        home: { zh: h.zh, id: h.id, logo: h.logo },
        away: { zh: a.zh, id: a.id, logo: a.logo },
        star: item.ev.star,
        stars: '★★★'.slice(0, item.ev.star),
        tierLabel: tier.label,
        cost: tier.cost,
        reason: item.ev.rivalry ? ('🔥 ' + item.ev.rivalry) : (item.ev.star === 3 ? '🌟 全欧焦点对决' : (h.zh + ' vs ' + a.zh + ' 争分夺位'))
      };

      that.setData({ boxMatch: boxMatch, isDrawing: false });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }, 280);
  },

  onCard: function (e) {
    var id = e.currentTarget.dataset.id;
    var urls = {
      guess: '/pages/predict/predict',
      owl: '/pages/board/board?tab=owl',
      court: '/pages/court/court',
      box: '/pages/box/box'
    };
    if (urls[id]) router.navTo(urls[id]);
  },

  goSeasonRank: function () {
    router.navTo('/pages/board/board?tab=season');
  },

  goRecords: function () {
    router.navTo('/pages/records/records');
  },

  onShareAppMessage: function () {
    return {
      title: '盲评猜球 · 德比法庭 · 盲盒开球 · 夜猫榜，球迷群的深夜新玩法',
      path: '/pages/play/play'
    };
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id || (this.data.boxMatch && this.data.boxMatch.id);
    if (id) router.navTo('/pages/detail/detail?id=' + id);
  },

  onPick: function (e) {
    var id = e.currentTarget.dataset.id;
    var key = e.currentTarget.dataset.key;
    var m = data.getMatch(id);
    if (m && engine.ts(m.t) <= Date.now()) {
      wx.showToast({ title: '已开球 · 本场截止', icon: 'none' });
      return;
    }
    var preds = wx.getStorageSync('predictions') || {};
    if (preds[id]) {
      wx.showToast({ title: '已封存 · 赛后开箱', icon: 'none' });
      return;
    }
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });

    var p = { pick: key, scoreH: '', scoreA: '' };
    p.salt = crypt.genSalt();
    p.hash = crypt.commitHash(p);
    p.ts = Date.now();
    preds[id] = p;
    wx.setStorageSync('predictions', preds);

    // 三态消费（三轮 P1-3）：rejected 时回滚本地封存；与 predict/detail 同款
    var that = this;
    cloud.addPrediction({ m: id, pick: p.pick, scoreH: p.scoreH, scoreA: p.scoreA, salt: p.salt, hash: p.hash, ts: p.ts })
      .then(function (sealed) {
        if (sealed !== 'rejected') return;
        var preds2 = wx.getStorageSync('predictions') || {};
        delete preds2[id];
        wx.setStorageSync('predictions', preds2);
        wx.showToast({ title: '已开球，封存被拒', icon: 'none' });
        that.refresh();
      });
    var guesses = this.data.guesses.map(function (g) {
      if (g.id === id) g.pick = key;
      return g;
    });
    this.setData({ guesses: guesses, sealedCount: this.data.sealedCount + 1 });
    wx.showToast({ title: '已封存 · 开球后开箱', icon: 'none' });
  }
});

