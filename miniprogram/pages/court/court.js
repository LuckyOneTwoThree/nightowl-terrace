var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var cloud = require('../../utils/cloud.js');

var QUICK_TAGS = ['🔥 稳赢拿下', '⚡ 零封对手', '💥 狂轰三球', '🛡️ 死守到底', '🐐 封神之战'];

Page({
  data: {
    theme: data.getInitTheme(),
    open: null,
    text: '',
    count: 0,
    quickTags: QUICK_TAGS,
    stats: { hit: 0, miss: 0, rate: '--' },
    archive: [],
    displayArchive: [],
    filterTab: 'all',
    filterTabs: [
      { id: 'all', zh: '全部' },
      { id: 'pending', zh: '审理中' },
      { id: 'hit', zh: '已应验' },
      { id: 'miss', zh: '翻车打脸' }
    ]
  },

  onLoad: function (q) {
    getApp().applyTheme(this);
    this._focusId = q && q.id ? q.id : '';
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    var boasts = wx.getStorageSync('boasts') || {};
    var fp = Object.keys(boasts).length + '_' + (this._focusId || '');
    if (this._lastFp !== fp) {
      this._lastFp = fp;
      this.refresh();
    }
  },

  refresh: function () {
    var that = this;
    var boasts = wx.getStorageSync('boasts') || {};
    this._lastFp = Object.keys(boasts).length + '_' + (this._focusId || '');
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    var followed = getApp().getFollowed() || [];
    var followedLeagues = getApp().getFollowedLeagues() || data.TOP_LEAGUE_IDS;

    var pick = null;
    if (this._focusId) {
      pick = data.getMatch(this._focusId);
    }
    if (!pick) {
      var now = Date.now();
      var cands = data.matchesAll().filter(function (m) {
        if (m.st !== 'sched' || m.tbd) return false;
        var ev = engine.evaluate(m, recMap, rivs, sls, followed, followedLeagues);
        return ev.star >= 3 && engine.ts(m.t) > now;
      }).sort(function (a, b) { return engine.ts(a.t) - engine.ts(b.t); });

      if (cands.length) {
        pick = cands[0];
      } else {
        pick = data.matchesAll().filter(function (m) {
          return m.st === 'sched' && !m.tbd && engine.ts(m.t) > now;
        }).sort(function (a, b) { return engine.ts(a.t) - engine.ts(b.t); })[0] || null;
      }
    }

    var archive = [];
    var hit = 0, miss = 0;
    Object.keys(boasts).forEach(function (mid) {
      var b = boasts[mid];
      var m = data.getMatch(mid);
      var row = {
        id: mid,
        text: b.text,
        md: b.md,
        ts: b.ts || 0,
        names: b.names,
        result: b.result,
        finished: m ? engine.isFinished(m) : false,
        sc: m && m.sc ? m.sc : ''
      };
      if (b.result === 'hit') hit++;
      if (b.result === 'miss') miss++;
      archive.push(row);
    });
    archive.sort(function (a, b) { return b.ts - a.ts; });

    var currentText = pick && boasts[pick.id] ? boasts[pick.id].text : '';
    this._allArchive = archive;

    this.setData({
      open: pick ? decorate.dec(pick, null, { followed: followed, followedLeagues: followedLeagues }) : null,
      text: currentText,
      count: currentText.length,
      archive: archive,
      stats: {
        hit: hit, miss: miss,
        rate: (hit + miss) > 0 ? Math.round(hit * 100 / (hit + miss)) + '%' : '--'
      }
    });
    this.applyFilter();
  },

  onFilterTab: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.filterTab === id) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ filterTab: id });
    this.applyFilter();
  },

  applyFilter: function () {
    var tab = this.data.filterTab;
    var list = this._allArchive || [];
    var filtered = list.filter(function (item) {
      if (tab === 'all') return true;
      if (tab === 'pending') return !item.finished || !item.result;
      if (tab === 'hit') return item.result === 'hit';
      if (tab === 'miss') return item.result === 'miss';
      return true;
    });
    this.setData({ displayArchive: filtered });
  },

  onInput: function (e) {
    var v = e.detail.value.slice(0, 40);
    this.setData({ text: v, count: v.length });
  },

  onQuickTag: function (e) {
    var tag = e.currentTarget.dataset.tag;
    var cur = this.data.text;
    var next = cur ? (cur + ' ' + tag) : tag;
    if (next.length > 40) next = next.slice(0, 40);
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ text: next, count: next.length });
  },

  submit: function () {
    var m = this.data.open;
    var text = this.data.text.trim();
    if (!m || !text) {
      wx.showToast({ title: '先留一句狂言', icon: 'none' });
      return;
    }
    var boasts = wx.getStorageSync('boasts') || {};
    boasts[m.id] = {
      text: text, ts: Date.now(),
      md: m.md, names: m.home.zh + ' vs ' + m.away.zh,
      result: boasts[m.id] ? boasts[m.id].result : null
    };
    wx.setStorageSync('boasts', boasts);

    cloud.addBoast({
      m: m.id, text: text, ts: boasts[m.id].ts,
      md: m.md, names: m.home.zh + ' vs ' + m.away.zh
    });

    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '狂言已立字存据！', icon: 'success' });
    this.refresh();
  },

  judge: function (e) {
    var id = e.currentTarget.dataset.id, r = e.currentTarget.dataset.r;
    var boasts = wx.getStorageSync('boasts') || {};
    if (boasts[id]) {
      boasts[id].result = r;
      wx.setStorageSync('boasts', boasts);
    }
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    this.refresh();
  },

  goDetail: function () {
    if (this.data.open) wx.navigateTo({ url: '/pages/detail/detail?id=' + this.data.open.id });
  },

  onTapArchive: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  onShareAppMessage: function () {
    var open = this.data.open;
    var title = open
      ? '【德比法庭】' + open.home.zh + ' vs ' + open.away.zh + ' · 赛前立字为证，赛后开箱审判！'
      : '【德比法庭】赛前狂言立字为证，赛后开箱审判！谁敢来立据？';
    var path = '/pages/court/court' + (this._focusId ? '?id=' + this._focusId : '');
    return { title: title, path: path };
  }
});
