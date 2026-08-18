var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var cloud = require('../../utils/cloud.js');

Page({
  data: {
    open: null,        // 开庭中：最近一场 ★★★ 未赛场
    text: '',
    count: '0/40',
    stats: { hit: 0, miss: 0, rate: '--' },
    archive: []
  },

  onLoad: function (q) {
    this._focusId = q.id || '';
    this.refresh();
  },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var that = this;
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();

    // 候选：★★★ 未赛场（焦点对阵/六强内战/推荐层三星），优先 URL 指定场
    var now = Date.now();
    var cands = data.matchesAll().filter(function (m) {
      if (m.st !== 'sched') return false;
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      return ev.star >= 3 && engine.ts(m.t) > now;
    }).sort(function (a, b) { return engine.ts(a.t) - engine.ts(b.t); });

    var pick = cands.filter(function (m) { return m.id === that._focusId; })[0] || cands[0] || null;

    // 狂言存档：本地 storage（v1 切云后由 settleMatches 自动结算）
    var boasts = wx.getStorageSync('boasts') || {};
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
        result: b.result,           // 'hit' | 'miss' | null
        finished: m ? (m.st === 'ft' || m.st === 'done') : false,
        sc: m && m.sc ? m.sc : ''
      };
      if (b.result === 'hit') hit++;
      if (b.result === 'miss') miss++;
      archive.push(row);
    });
    archive.sort(function (a, b) { return b.ts - a.ts; }); // 按提交时间倒序（中文日期串不可比较）

    this.setData({
      open: pick ? decorate.dec(pick, null, { followed: getApp().getFollowed() }) : null,
      text: pick && boasts[pick.id] ? boasts[pick.id].text : '',
      count: ((pick && boasts[pick.id] ? boasts[pick.id].text : '') || '').length + '/40',
      archive: archive,
      stats: {
        hit: hit, miss: miss,
        rate: (hit + miss) > 0 ? Math.round(hit * 100 / (hit + miss)) + '%' : '--'
      }
    });
  },

  onInput: function (e) {
    var v = e.detail.value.slice(0, 40);
    this.setData({ text: v, count: v.length + '/40' });
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
    // 云端 best-effort 双写：德比法庭群存档
    cloud.addBoast({ m: m.id, text: text, ts: boasts[m.id].ts });
    wx.showToast({ title: '狂言已存档', icon: 'none' });
    this.refresh();
  },

  // 已赛场次的本地自判（云端版由 settleMatches 自动写回）
  judge: function (e) {
    var id = e.currentTarget.dataset.id, r = e.currentTarget.dataset.r;
    var boasts = wx.getStorageSync('boasts') || {};
    if (boasts[id]) { boasts[id].result = r; wx.setStorageSync('boasts', boasts); }
    this.refresh();
  },

  goDetail: function () {
    if (this.data.open) wx.navigateTo({ url: '/pages/detail/detail?id=' + this.data.open.id });
  }
});
