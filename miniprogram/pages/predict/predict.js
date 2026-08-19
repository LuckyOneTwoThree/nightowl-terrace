var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');

var p2 = function (n) { return (n < 10 ? '0' : '') + n; };

Page({
  _targetId: null,

  data: {
    theme: data.getInitTheme(),
    targetId: '',
    targetMatch: null,
    curLeague: 'ALL',
    leaguePills: [
      { id: 'ALL', zh: '本周精选' },
      { id: 'PL', zh: '英超' },
      { id: 'PD', zh: '西甲' },
      { id: 'SA', zh: '意甲' },
      { id: 'BL', zh: '德甲' },
      { id: 'FL', zh: '法甲' }
    ],
    cards: [],
    pickedCount: 0,
    potential: '0+',
    sealedAll: false
  },

  onShow: function () {
    getApp().applyTheme(this);
    this.refreshCards();
  },

  onLoad: function (options) {
    if (options && options.id) {
      this._targetId = options.id;
      this.setData({ targetId: options.id });
    }
  },

  /**
   * 刷新与构建卡片列表
   */
  refreshCards: function () {
    var now = new Date();
    var start = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    var endD = new Date(now.getTime() + 14 * 86400000); // 扩展为两周范围
    var end = endD.getFullYear() + '-' + p2(endD.getMonth() + 1) + '-' + p2(endD.getDate());

    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    var curLeague = this.data.curLeague;
    var targetId = this._targetId;

    var matches = [];

    if (curLeague === 'ALL') {
      // 1. 本周推荐精选单（取星级降序 Top 6）
      var week = data.matchesAll().filter(function (m) {
        var d = m.t.split('T')[0];
        return d >= start && d <= end && m.st === 'sched' && !m.tbd;
      });
      var evs = week
        .map(function (m) {
          var ev = engine.evaluate(m, recMap, rivs, sls, []);
          return { m: m, ev: ev, index: engine.owlIndex(ev, m) };
        })
        .sort(function (a, b) { return b.ev.star - a.ev.star || b.index - a.index; });

      var list = evs.slice(0, 6).map(function (e) { return e.m; });

      // 如果有指定目标 ID，且不在 Top 6 中，强制调取该比赛并置顶
      if (targetId) {
        var hasTarget = list.some(function (m) { return m.id === targetId; });
        if (!hasTarget) {
          var targetM = data.getMatch(targetId);
          if (targetM) list.unshift(targetM);
        } else {
          // 若在列表中，将其调整到最前
          list.sort(function (a, b) {
            if (a.id === targetId) return -1;
            if (b.id === targetId) return 1;
            return 0;
          });
        }
      }
      matches = list;
    } else {
      // 2. 自选联赛（展示该联赛未来近期未赛比赛）
      var allMatches = data.matchesAll() || [];
      var lgMatches = allMatches.filter(function (m) {
        return m.l === curLeague && m.st === 'sched' && !m.tbd && m.t.split('T')[0] >= start;
      }).slice(0, 20);

      // 若指定目标属于该联赛，置顶
      if (targetId) {
        lgMatches.sort(function (a, b) {
          if (a.id === targetId) return -1;
          if (b.id === targetId) return 1;
          return 0;
        });
      }
      matches = lgMatches;
    }

    var preds = wx.getStorageSync('predictions') || {};
    var cards = matches.map(function (m) {
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      var d = decorate.dec(m, ev);
      var p = preds[m.id] || {};
      d.pick = p.pick || '';
      d.scoreH = (p.scoreH !== undefined && p.scoreH !== null) ? String(p.scoreH) : '';
      d.scoreA = (p.scoreA !== undefined && p.scoreA !== null) ? String(p.scoreA) : '';
      d.sealed = !!preds[m.id];
      d.closed = engine.ts(m.t) <= Date.now();
      d.upset = ev.rec ? !!ev.rec.upset : false;
      d.isTarget = targetId && m.id === targetId;
      return d;
    });

    this.setData({
      cards: cards,
      sealedAll: cards.length > 0 && cards.every(function (c) { return c.sealed; })
    });
    this.recount();
  },

  onSelectLeague: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.curLeague === id) return;
    this.setData({ curLeague: id });
    this.refreshCards();
  },

  recount: function () {
    var picked = this.data.cards.filter(function (c) { return c.pick && !c.sealed; });
    // 潜在分按底分 3 计，冷门场翻倍
    var pts = picked.reduce(function (s, c) { return s + 3 * (c.upset ? 2 : 1); }, 0);
    this.setData({
      pickedCount: picked.length,
      potential: pts,
      sealedAll: this.data.cards.length > 0 && this.data.cards.every(function (c) { return c.sealed; })
    });
  },

  onPick: function (e) {
    var id = e.currentTarget.dataset.id, key = e.currentTarget.dataset.key;
    var target = this.data.cards.filter(function (c) { return c.id === id; })[0];
    if (target && (target.sealed || target.closed)) {
      wx.showToast({ title: target.closed ? '已开球 · 本场截止' : '已封存 · 不可改', icon: 'none' });
      return;
    }
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    var cards = this.data.cards.map(function (c) {
      if (c.id === id && !c.sealed) {
        c.pick = (c.pick === key ? '' : key); // 再次点击可反选
      }
      return c;
    });
    this.setData({ cards: cards });
    this.recount();
  },

  onScore: function (e) {
    var id = e.currentTarget.dataset.id, side = e.currentTarget.dataset.side;
    var val = e.detail.value.replace(/\D/g, '').slice(0, 1);
    var cards = this.data.cards.map(function (c) {
      if (c.id === id && !c.sealed && !c.closed) {
        if (side === 'h') c.scoreH = val;
        else c.scoreA = val;
      }
      return c;
    });
    this.setData({ cards: cards });
  },

  /**
   * 单场直接封存
   */
  onSealSingle: function (e) {
    var id = e.currentTarget.dataset.id;
    var target = this.data.cards.filter(function (c) { return c.id === id; })[0];
    if (!target) return;
    if (!target.pick) {
      wx.showToast({ title: '请先选择主胜/平局/客胜', icon: 'none' });
      return;
    }
    if (target.sealed || target.closed) {
      wx.showToast({ title: target.closed ? '已开球 · 本场截止' : '已封存', icon: 'none' });
      return;
    }

    var preds = wx.getStorageSync('predictions') || {};
    var p = { pick: target.pick, scoreH: target.scoreH, scoreA: target.scoreA };
    p.salt = crypt.genSalt();
    p.hash = crypt.commitHash(p);
    p.ts = Date.now();
    preds[target.id] = p;
    wx.setStorageSync('predictions', preds);

    cloud.addPrediction({
      m: target.id,
      pick: p.pick,
      scoreH: p.scoreH,
      scoreA: p.scoreA,
      salt: p.salt,
      hash: p.hash,
      ts: p.ts
    });

    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '本场预测已封存！', icon: 'success' });
    this.refreshCards();
  },

  /**
   * 批量封存所有已选
   */
  onSeal: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var sealedCloud = [];
    var any = false;
    var cards = this.data.cards.map(function (c) {
      if (c.pick && !preds[c.id] && !c.closed) {
        var p = { pick: c.pick, scoreH: c.scoreH, scoreA: c.scoreA };
        p.salt = crypt.genSalt();
        p.hash = crypt.commitHash(p);
        p.ts = Date.now();
        preds[c.id] = p;
        sealedCloud.push({ m: c.id, pick: p.pick, scoreH: p.scoreH, scoreA: p.scoreA, salt: p.salt, hash: p.hash, ts: p.ts });
        c.sealed = true;
        any = true;
      }
      return c;
    });

    if (!any) {
      wx.showToast({ title: '请先选择预测选项', icon: 'none' });
      return;
    }

    wx.setStorageSync('predictions', preds);
    this.setData({ cards: cards });
    this.recount();

    sealedCloud.forEach(function (s) { cloud.addPrediction(s); });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '已封存 · 开球后开箱', icon: 'success' });
  },

  goRecords: function () {
    wx.navigateTo({ url: '/pages/records/records' });
  }
});

