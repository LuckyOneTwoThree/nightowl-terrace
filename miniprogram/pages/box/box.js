var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');

// 豪门集合：英超六强 + 各国传统豪门（PM 9.6 星级下限/豪门出战筛选）
var GIANTS = ['ARS', 'MCI', 'LIV', 'CHE', 'MUN', 'TOT', 'RMA', 'BAR', 'ATM', 'MIL', 'INT', 'JUV', 'FCB', 'BVB', 'PSG'];

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: {
    theme: '',
    pills: [
      { key: 'prime', label: '仅黄金档', on: false },
      { key: 'star2', label: '★★以上', on: false },
      { key: 'giant', label: '豪门出战', on: false }
    ],
    front: null,   // { tags, stars, cost }
    back: null,    // decorate.dec 结果
    revealed: false
  },

  onLoad: function () {
    this.draw();
  },

  pool: function () {
    var that = this;
    var recMap = data.getRecMap(), rivs = data.getRivalries(), sls = data.getStorylines();
    // 夜猫口径「今晚」：凌晨 00:00–06:00 归前一晚（与今日页一致）
    var today = engine.nightOf(new Date());

    var flags = {};
    this.data.pills.forEach(function (p) { flags[p.key] = p.on; });

    var pool = [];
    data.matchesOfDay(today).forEach(function (m) {
      // tbd 场次开球时间未定，占位时间不可信，不进盲盒
      if (m.st !== 'sched' || m.tbd) return;
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      if (flags.prime && m.s > 1) return;                        // 黄金档：S1 及以前
      if (flags.star2 && ev.star < 2) return;                    // 星级下限
      if (flags.giant && GIANTS.indexOf(m.h) < 0 && GIANTS.indexOf(m.a) < 0) return;
      pool.push({ m: m, ev: ev });
    });
    return pool;
  },

  draw: function () {
    var pool = this.pool();
    if (!pool.length) {
      this.setData({ front: null, back: null, revealed: false });
      wx.showToast({ title: '该条件下今晚没有比赛', icon: 'none' });
      return;
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var m = pick.m, ev = pick.ev;

    // 正面提示：只给看点标签 + 睡眠成本，对阵隐藏（PM 9.6）
    var tags = [];
    if (ev.rivalry) tags.push(ev.rivalry);
    if (ev.keyNode) tags.push('关键节点');
    if (!tags.length && ev.stories && ev.stories.length) tags = ev.stories.map(function (s) { return s.name; }).slice(0, 2);
    if (!tags.length) tags.push('悬念局');

    this.setData({
      front: { tags: tags, stars: '★★★'.slice(0, ev.star), cost: engine.tierOf(m).cost },
      back: decorate.dec(m, ev, { followed: getApp().getFollowed() }),
      revealed: false
    });
  },

  flip: function () {
    if (!this.data.front) return;
    this.setData({ revealed: !this.data.revealed });
  },

  toggle: function (e) {
    var i = e.currentTarget.dataset.i;
    var pills = this.data.pills.map(function (p, idx) {
      if (idx === i) p.on = !p.on;
      return p;
    });
    this.setData({ pills: pills });
    this.draw();
  },

  watchIt: function () {
    if (this.data.back) wx.navigateTo({ url: '/pages/detail/detail?id=' + this.data.back.id });
  },

  redraw: function () { this.draw(); },

  callFriends: function () {
    var b = this.data.back;
    if (!b) return;
    wx.setClipboardData({
      data: '【盲盒开球】我抽到了 ' + b.md + ' ' + b.hm + ' ' + b.home.zh + ' vs ' + b.away.zh + '（' + b.stars + '），你也来抽一场？',
      success: function () { wx.showToast({ title: '已复制，去群里喊人', icon: 'none' }); }
    });
  }
});
