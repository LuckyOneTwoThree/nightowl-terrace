var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');

var p2 = function (n) { return (n < 10 ? '0' : '') + n; };

Page({
  data: {
    deadlineText: '',
    leftText: '',
    cards: [],
    pickedCount: 0,
    potential: '0+',
    sealedAll: false
  },

  onLoad: function () {
    var now = new Date();
    var start = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    var endD = new Date(now.getTime() + 7 * 86400000);
    var end = endD.getFullYear() + '-' + p2(endD.getMonth() + 1) + '-' + p2(endD.getDate());

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    // 本周推荐场：星级降序取 5–8 场（PM 9.4：仅焦点场，填写一两分钟）
    var week = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end && m.st === 'sched';
    });
    var evs = week
      .map(function (m) {
        var ev = engine.evaluate(m, recMap, rivs, sls, []);
        return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
      })
      .sort(function (a, b) { return b.ev.star - a.ev.star || b.index - a.index; })
      .slice(0, 6);

    // 截止：本周五 24:00
    var fri = new Date(now.getTime());
    fri.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
    var daysLeft = Math.ceil((fri.getTime() - now.getTime()) / 86400000);

    var preds = wx.getStorageSync('predictions') || {};
    var cards = evs.map(function (e) {
      var d = decorate.dec(e.m, e.ev);
      d.pick = (preds[e.m.id] || {}).pick || '';
      d.scoreH = (preds[e.m.id] || {}).scoreH || '';
      d.scoreA = (preds[e.m.id] || {}).scoreA || '';
      d.upset = e.ev.rec ? !!e.ev.rec.upset : false;
      return d;
    });

    this.setData({
      deadlineText: (fri.getMonth() + 1) + '月' + fri.getDate() + '日 周五 24:00',
      leftText: daysLeft <= 0 ? '今日截止' : '还剩 ' + daysLeft + ' 天',
      cards: cards,
      sealedAll: cards.length > 0 && cards.every(function (c) { return c.pick; })
    });
    this.recount();
  },

  recount: function () {
    var picked = this.data.cards.filter(function (c) { return c.pick; });
    var pts = picked.length * 3;
    this.setData({ pickedCount: picked.length, potential: pts + '+' });
  },

  onPick: function (e) {
    var id = e.currentTarget.dataset.id, key = e.currentTarget.dataset.key;
    var cards = this.data.cards.map(function (c) {
      if (c.id === id && !c.pick) c.pick = key;
      return c;
    });
    this.setData({ cards: cards });
    this.recount();
  },

  onScore: function (e) {
    var id = e.currentTarget.dataset.id, side = e.currentTarget.dataset.side;
    var val = e.detail.value.replace(/\D/g, '').slice(0, 1);
    var cards = this.data.cards.map(function (c) {
      if (c.id === id) { if (side === 'h') c.scoreH = val; else c.scoreA = val; }
      return c;
    });
    this.setData({ cards: cards });
  },

  onSeal: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var any = false;
    this.data.cards.forEach(function (c) {
      if (c.pick && !preds[c.id]) {
        preds[c.id] = { pick: c.pick, scoreH: c.scoreH, scoreA: c.scoreA, ts: Date.now() };
        any = true;
      }
    });
    if (!any) {
      wx.showToast({ title: '没有可封存的新预测', icon: 'none' });
      return;
    }
    wx.setStorageSync('predictions', preds);
    this.setData({ sealedAll: true });
    wx.showToast({ title: '已封存 · 开球后开箱', icon: 'none' });
  },

  goRecords: function () { wx.navigateTo({ url: '/pages/records/records' }); }
});
