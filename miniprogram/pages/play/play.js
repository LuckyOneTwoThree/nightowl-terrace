var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
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
    cards: [],
    guesses: [],
    options: OPTIONS,
    rankList: [],
    myRank: null
  },

  onShow: function () {
    this.refresh();
    this.fetchRanks();
  },

  // 云端盲评榜（readBoard 聚合，本周）；不可用则保留演示榜单
  fetchRanks: function () {
    var that = this;
    var day = new Date().getDay();
    var mon = new Date(Date.now() - ((day + 6) % 7) * 86400000);
    var week = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
    cloud.readBoard('guess', 'default', week)
      .then(function (res) {
        var list = (res && res.list) || [];
        if (!list.length) return;
        that.setData({
          rankList: list.map(function (r, i) {
            return {
              rank: i + 1, name: r.nick, avatar: (r.nick || '??').slice(0, 3).toUpperCase(),
              score: (r.pts || 0) + ' 分', badge: r.hit != null && r.count ? Math.round(r.hit / r.count * 100) + '% 命中' : ''
            };
          }),
          myRank: null // 云榜 uid 归属待 openGid 接入后补「我」行
        });
      })
      .catch(function () { /* 云不可用：静默回退演示榜单 */ });
  },

  refresh: function () {
    var now = new Date();
    var start = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    var endD = new Date(now.getTime() + 7 * 86400000);
    var end = endD.getFullYear() + '-' + p2(endD.getMonth() + 1) + '-' + p2(endD.getDate());

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    var weekSched = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end && m.st === 'sched' && !m.tbd; // tbd 时间未定，不进竞猜单
    });

    var evaluated = weekSched.map(function (m) {
      return { m: m, ev: engine.evaluate(m, recMap, rivs, sls, []), index: engine.owlIndex(engine.evaluate(m, recMap, rivs, sls, []), m) };
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
        home: { zh: h.zh, id: h.id, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
        away: { zh: a.zh, id: a.id, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
        pick: (preds[e.m.id] || {}).pick || ''
      };
    });

    // 玩法榜单前三 + 用户位
    var app = getApp();
    var profile = (app && app.globalData && app.globalData.profile) || { nickname: '熬夜小猫', avatarCode: 'OWL' };
    var rankList = [
      { rank: 1, name: '伯纳乌常驻幽灵', avatar: 'RMA', score: '88% (22/25)', badge: '神准之眼' },
      { rank: 2, name: '安菲尔德守夜人', avatar: 'LIV', score: '84% (21/25)', badge: '夜巡官' },
      { rank: 3, name: '多特蒙德小黄蜂', avatar: 'BVB', score: '80% (20/25)', badge: '百步穿杨' }
    ];

    this.setData({
      cards: [
        { id: 'guess', name: '盲评猜球', iconClass: 'v-soccer', colorClass: 'c-amber', sub: '开球前截止 · 已封存 ' + sealedCount + '/' + evaluated.length },
        { id: 'owl', name: '夜猫榜', iconClass: 'v-moon', colorClass: 'c-teal', sub: '本周修仙 ' + owlCount + ' 场' },
        { id: 'court', name: '德比法庭', iconClass: 'v-gavel', colorClass: 'c-red', sub: '狂言存档 ' + Object.keys(boasts).length + ' 条' },
        { id: 'box', name: '盲盒开球', iconClass: 'v-gift', colorClass: 'c-violet', sub: '特征翻转 · 抽选今晚' }
      ],
      guesses: guesses,
      rankList: rankList,
      myRank: { rank: 18, name: profile.nickname, avatar: profile.avatarCode, score: '72% (18/25)' }
    });
  },

  onCard: function (e) {
    var id = e.currentTarget.dataset.id;
    var urls = {
      guess: '/pages/predict/predict',
      owl: '/pages/board/board',
      court: '/pages/court/court',
      box: '/pages/box/box'
    };
    if (urls[id]) wx.navigateTo({ url: urls[id] });
  },

  goRecords: function () {
    wx.navigateTo({ url: '/pages/records/records' });
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

