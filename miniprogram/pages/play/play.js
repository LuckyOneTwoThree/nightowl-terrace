var engine = require('../../utils/engine.js');
var data = require('../../utils/data.js');

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
    boardEmpty: true
  },

  onShow: function () {
    this.refresh();
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
      return d >= start && d <= end && m.st === 'sched';
    });

    var evaluated = weekSched.map(function (m) { return { m: m, ev: engine.evaluate(m, recMap, rivs, sls, []) }; });

    // 盲评截止：本周五 24:00
    var fri = new Date(now.getTime());
    fri.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
    var daysLeft = Math.ceil((fri.getTime() - now.getTime()) / 86400000);

    var owlCount = evaluated.filter(function (e) { return engine.tierOf(e.m).cost >= 2.5; }).length;
    var boasts = wx.getStorageSync('boasts') || {};

    // 本周竞猜单：星级 Top3
    var preds = wx.getStorageSync('predictions') || {};
    var guesses = evaluated.slice().sort(function (x, y) { return y.ev.star - x.ev.star; }).slice(0, 3).map(function (e) {
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

    this.setData({
      cards: [
        { id: 'guess', name: '盲评猜球', icon: '❓', cls: 'c-amber', sub: '周五 24:00 截止 · 还剩 ' + Math.max(0, daysLeft) + ' 天' },
        { id: 'owl', name: '夜猫榜', icon: '🌙', cls: 'c-teal', sub: '本周修仙 ' + owlCount + ' 场' },
        { id: 'court', name: '德比法庭', icon: '⚖️', cls: 'c-red', sub: '狂言存档 ' + Object.keys(boasts).length + ' 条' },
        { id: 'box', name: '盲盒开球', icon: '🎁', cls: 'c-violet', sub: '今晚随机开一场' }
      ],
      guesses: guesses,
      boardEmpty: true
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
    var preds = wx.getStorageSync('predictions') || {};
    if (preds[id]) {
      wx.showToast({ title: '已封存 · 赛后开箱', icon: 'none' });
      return;
    }
    preds[id] = { pick: key, ts: Date.now() };
    wx.setStorageSync('predictions', preds);
    var guesses = this.data.guesses.map(function (g) {
      if (g.id === id) g.pick = key;
      return g;
    });
    this.setData({ guesses: guesses });
    wx.showToast({ title: '已封存 · 周五开箱', icon: 'none' });
  }
});
