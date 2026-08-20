var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var cloud = require('../../utils/cloud.js');

Page({
  data: {
    theme: data.getInitTheme(),
    open: null,        // 开庭中：最近一场 ★★★ 未赛场
    text: '',
    count: 0,
    stats: { hit: 0, miss: 0, rate: '--' },
    archive: []
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

    // 优先取 URL 指定场（从详情页带入）
    var pick = null;
    if (this._focusId) {
      pick = data.getMatch(this._focusId);
    }
    // 未指定时，默认定位距当前时间最近的焦点大战（★★★ 优先，若无则取最近未赛场）
    if (!pick) {
      var now = Date.now();
      var cands = data.matchesAll().filter(function (m) {
        if (m.st !== 'sched' || m.tbd) return false;
        var ev = engine.evaluate(m, recMap, rivs, sls, []);
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
        finished: m ? engine.isFinished(m) : false,
        sc: m && m.sc ? m.sc : ''
      };
      if (b.result === 'hit') hit++;
      if (b.result === 'miss') miss++;
      archive.push(row);
    });
    archive.sort(function (a, b) { return b.ts - a.ts; }); // 按提交时间倒序（中文日期串不可比较）

    var currentText = pick && boasts[pick.id] ? boasts[pick.id].text : '';
    this.setData({
      open: pick ? decorate.dec(pick, null, { followed: getApp().getFollowed() }) : null,
      text: currentText,
      count: currentText.length,
      archive: archive,
      stats: {
        hit: hit, miss: miss,
        rate: (hit + miss) > 0 ? Math.round(hit * 100 / (hit + miss)) + '%' : '--'
      }
    });
  },

  onInput: function (e) {
    var v = e.detail.value.slice(0, 40);
    this.setData({ text: v, count: v.length });
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
    // 云端 best-effort 双写：德比法庭群存档（md/names 供云端卡片展示，二轮 P2-1）
    cloud.addBoast({
      m: m.id, text: text, ts: boasts[m.id].ts,
      md: m.md, names: m.home.zh + ' vs ' + m.away.zh
    });
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
  },

  // 点击法庭判例存档：直接跳转到对应比赛对决详情
  onTapArchive: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
    }
  },

  // 切换上方开庭中卡片为该场对决
  onSwitchDuel: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    this._focusId = id;
    this.refresh();
    if (wx.pageScrollTo) {
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    }
    wx.showToast({ title: '已切换至该场对决', icon: 'none' });
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
