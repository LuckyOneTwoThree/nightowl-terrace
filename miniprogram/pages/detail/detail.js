var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var ics = require('../../utils/ics.js');

Page({
  data: {
    theme: '',
    m: null,
    countdownText: '',
    quip: ''
  },

  onLoad: function (q) {
    var raw = data.getMatch(q.id);
    if (!raw) {
      wx.showToast({ title: '场次不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    this._raw = raw;
    this._ts = engine.ts(raw.t);
    var m = decorate.dec(raw, null, { followed: getApp().getFollowed() });
    this.setData({
      m: m,
      quip: m.trivia || data.getQuip(raw.t.split('T')[0])
    });
    this.startTimer();
  },

  onShow: function () {
    getApp().applyTheme(this);
    if (this._raw && !this._timer) {
      this.startTimer();
    }
  },

  onHide: function () {
    this.stopTimer();
  },

  onUnload: function () {
    this.stopTimer();
  },

  startTimer: function () {
    this.stopTimer();
    this.tick();
    this._timer = setInterval(this.tick.bind(this), 1000);
  },

  stopTimer: function () {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  tick: function () {
    if (!this.data.m || this.data.m.finished) return;
    var c = engine.countdown(this._ts, Date.now());
    var text;
    if (c.over) text = '比赛中';
    else if (c.d > 0) text = '距开球 ' + c.d + '天' + c.h + '小时';
    else if (c.h > 0) text = '距开球 ' + c.h + '小时' + c.m + '分';
    else text = '距开球 ' + c.m + '分' + c.s + '秒';
    this.setData({ countdownText: text });
  },

  goPredict: function () { wx.navigateTo({ url: '/pages/predict/predict' }); },
  goCourt: function () {
    var id = this.data.m ? this.data.m.id : '';
    wx.navigateTo({ url: '/pages/court/court' + (id ? '?id=' + id : '') });
  },
  goPoster: function () { wx.navigateTo({ url: '/pages/poster/poster?id=' + this.data.m.id }); },
  goStory: function (e) {
    wx.navigateTo({ url: '/pages/story/story?id=' + e.currentTarget.dataset.id });
  },

  // 添加到日历：优先写入微信系统日历，失败时降级导出 ICS 文件
  onCalendar: function () {
    var m = this.data.m;
    if (!m || m.tbd) {
      wx.showToast({ title: '开球时间未定，暂不能添加', icon: 'none' });
      return;
    }
    var desc = m.points.length ? m.points[0] : '夜猫指数 ' + m.indexText;
    ics.addCalendar(
      { t: this._raw.t, title: '⚽ ' + m.home.zh + ' vs ' + m.away.zh + ' · ' + m.lgZh, desc: desc, alarmMin: 30 },
      '夜猫看台-' + m.home.id + m.away.id,
      function (ok, msg) {
        wx.showToast({ title: msg || (ok ? '已加入日历' : '添加失败'), icon: ok ? 'success' : 'none' });
      }
    );
  }
});
