var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');

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
    seasonPts: 0
  },

  onLoad: function () {
    this._lastPredsStr = JSON.stringify(wx.getStorageSync('predictions') || {});
    this._lastDayStr = engine.nightOf(Date.now()); // 跨天指纹（二轮 P2-3）
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    var curPredsStr = JSON.stringify(wx.getStorageSync('predictions') || {});
    var curDay = engine.nightOf(Date.now());
    if (this._lastPredsStr !== curPredsStr || this._lastDayStr !== curDay) {
      this._lastPredsStr = curPredsStr;
      this._lastDayStr = curDay;
      this.refresh(); // 封存变化或挂起过午夜（周窗口/竞猜单滚动）时刷新
    }
  },

  refresh: function () {
    var now = new Date();
    // 夜猫口径「本周」：凌晨场归前一晚（与今日/本周页一致）
    var start = engine.nightOf(now);
    var endD = new Date(now.getTime() + 7 * 86400000);
    var end = engine.nightOf(endD);

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var weekSched = data.matchesAll().filter(function (m) {
      var d = engine.owlDay(m.t);
      return d >= start && d <= end && m.st === 'sched' && !m.tbd; // tbd 时间未定，不进竞猜单
    });

    var evaluated = weekSched.map(function (m) {
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
    });

    // 盲评截止：各场开球时刻（PM 八节），入口卡片只提示口径
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
      return {
        id: e.m.id,
        label: lgZh(e.m.l) + ' · ' + (d.getMonth() + 1) + '/' + d.getDate() + ' 周' + WEEK[d.getDay()] + ' ' + f[1],
        home: { zh: h.zh, id: h.id, logo: h.logo, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
        away: { zh: a.zh, id: a.id, logo: a.logo, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
        pick: (preds[e.m.id] || {}).pick || ''
      };
    });

    // 本地赛季积分：已结算预测按统一判据累计（胜平负3 + 比分2 + 冷门×2，与 records/云端 settleMatches 一致）
    var seasonPts = 0;
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid], mm = data.getMatch(mid);
      if (!mm) return;
      if (!crypt.verify(p)) return;                      // 封存校验失败作废
      if (p.ts && p.ts > engine.ts(mm.t) + 60000) return; // 开球后封存作废
      var r = engine.settlePred(p, mm, recMap);
      if (r) seasonPts += r.pts;
    });

    this.setData({
      cards: [
        { id: 'guess', name: '盲评猜球', iconClass: 'v-soccer', colorClass: 'c-amber', sub: '开球前截止 · 已封存 ' + sealedCount + '/' + evaluated.length },
        { id: 'owl', name: '夜猫榜', iconClass: 'v-moon', colorClass: 'c-teal', sub: '本周修仙 ' + owlCount + ' 场' },
        { id: 'court', name: '德比法庭', iconClass: 'v-gavel', colorClass: 'c-red', sub: '狂言存档 ' + Object.keys(boasts).length + ' 条' },
        { id: 'box', name: '盲盒开球', iconClass: 'v-gift', colorClass: 'c-violet', sub: '特征翻转 · 抽选今晚' }
      ],
      guesses: guesses,
      seasonPts: seasonPts
    });
  },

  onCard: function (e) {
    var id = e.currentTarget.dataset.id;
    var urls = {
      guess: '/pages/predict/predict',
      owl: '/pages/board/board?tab=owl',
      court: '/pages/court/court',
      box: '/pages/box/box'
    };
    if (urls[id]) wx.navigateTo({ url: urls[id] });
  },

  goSeasonRank: function () {
    wx.navigateTo({ url: '/pages/board/board?tab=season' });
  },

  goRecords: function () {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  // 群分享：玩法聚合页引流
  onShareAppMessage: function () {
    return {
      title: '盲评猜球 · 夜猫榜 · 德比法庭 · 盲盒开球，球迷群的深夜新玩法',
      path: '/pages/play/play'
    };
  },

  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  onPick: function (e) {
    var id = e.currentTarget.dataset.id;
    var key = e.currentTarget.dataset.key;
    var m = data.getMatch(id);
    // 截止 = 该场开球时刻（PM 八节）：开球后不可再封存
    if (m && engine.ts(m.t) <= Date.now()) {
      wx.showToast({ title: '已开球 · 本场截止', icon: 'none' });
      return;
    }
    var preds = wx.getStorageSync('predictions') || {};
    if (preds[id]) {
      wx.showToast({ title: '已封存 · 赛后开箱', icon: 'none' });
      return;
    }
    // commit-reveal 封存（与 predict 页同一链路：salt+hash，结算前校验）
    var p = { pick: key, scoreH: '', scoreA: '' };
    p.salt = crypt.genSalt();
    p.hash = crypt.commitHash(p);
    p.ts = Date.now();
    preds[id] = p;
    wx.setStorageSync('predictions', preds);
    // 云端 best-effort 双写（与 predict 页同一封存链路）
    cloud.addPrediction({ m: id, pick: p.pick, scoreH: p.scoreH, scoreA: p.scoreA, salt: p.salt, hash: p.hash, ts: p.ts });
    var guesses = this.data.guesses.map(function (g) {
      if (g.id === id) g.pick = key;
      return g;
    });
    this.setData({ guesses: guesses });
    wx.showToast({ title: '已封存 · 开球后开箱', icon: 'none' });
  }
});

