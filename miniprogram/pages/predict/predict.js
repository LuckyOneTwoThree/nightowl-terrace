var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var crypt = require('../../utils/crypt.js');

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
      var p = preds[e.m.id] || {};
      d.pick = p.pick || '';
      d.scoreH = p.scoreH || '';
      d.scoreA = p.scoreA || '';
      // 已落库的预测 = 已封存，不可改；未落库前可自由改选
      d.sealed = !!preds[e.m.id];
      d.upset = e.ev.rec ? !!e.ev.rec.upset : false;
      return d;
    });

    this.setData({
      deadlineText: (fri.getMonth() + 1) + '月' + fri.getDate() + '日 周五 24:00',
      leftText: daysLeft <= 0 ? '今日截止' : '还剩 ' + daysLeft + ' 天',
      cards: cards,
      sealedAll: cards.length > 0 && cards.every(function (c) { return c.sealed; })
    });
    this.recount();
  },

  recount: function () {
    var picked = this.data.cards.filter(function (c) { return c.pick; });
    var pts = picked.length * 3;
    this.setData({
      pickedCount: picked.length,
      potential: pts + '+',
      sealedAll: this.data.cards.length > 0 && this.data.cards.every(function (c) { return c.sealed; })
    });
  },

  onPick: function (e) {
    var id = e.currentTarget.dataset.id, key = e.currentTarget.dataset.key;
    var cards = this.data.cards.map(function (c) {
      if (c.id === id && !c.sealed) c.pick = key;
      return c;
    });
    this.setData({ cards: cards });
    this.recount();
  },

  onScore: function (e) {
    var id = e.currentTarget.dataset.id, side = e.currentTarget.dataset.side;
    var val = e.detail.value.replace(/\D/g, '').slice(0, 1);
    var cards = this.data.cards.map(function (c) {
      if (c.id === id && !c.sealed) { if (side === 'h') c.scoreH = val; else c.scoreA = val; }
      return c;
    });
    this.setData({ cards: cards });
  },

  onSeal: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var any = false;
    var cards = this.data.cards.map(function (c) {
      if (c.pick && !preds[c.id]) {
        // commit-reveal 封存（PM 八节：截止前提交加盐哈希，截止后亮明文校验一致才计分）
        var p = { pick: c.pick, scoreH: c.scoreH, scoreA: c.scoreA };
        p.salt = crypt.genSalt();
        p.hash = crypt.commitHash(p);
        p.ts = Date.now();
        preds[c.id] = p;
        c.sealed = true;
        any = true;
      }
      return c;
    });
    if (!any) {
      wx.showToast({ title: '没有可封存的新预测', icon: 'none' });
      return;
    }
    wx.setStorageSync('predictions', preds);
    this.setData({ cards: cards });
    this.recount();
    wx.showToast({ title: '已封存 · 开球后开箱', icon: 'none' });
  },

  goRecords: function () { wx.navigateTo({ url: '/pages/records/records' }); }
});
