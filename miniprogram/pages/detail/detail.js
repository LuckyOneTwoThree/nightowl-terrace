var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var ics = require('../../utils/ics.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');

Page({
  data: {
    theme: data.getInitTheme(),
    m: null,
    countdownText: '',
    quip: '',
    myPred: null,       // { pick: 'h'|'d'|'a', scoreH: '', scoreA: '', sealed: bool, closed: bool }
    inputPick: '',      // 详情页内即时选择
    inputScoreH: '',
    inputScoreA: ''
  },

  onLoad: function (q) {
    getApp().applyTheme(this);
    var raw = data.getMatch(q.id);
    if (!raw) {
      wx.showToast({ title: '场次不存在', icon: 'none' });
      setTimeout(function () {
        // 冷启动单页栈时 navigateBack 静默失败 → 白屏卡死，改跳今日页（三轮 P1-8）
        if (getCurrentPages().length <= 1) wx.switchTab({ url: '/pages/today/today' });
        else wx.navigateBack();
      }, 800);
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
    this.checkPred();
  },

  onHide: function () {
    this.stopTimer();
  },

  onUnload: function () {
    this.stopTimer();
  },

  checkPred: function () {
    if (!this._raw) return;
    var preds = wx.getStorageSync('predictions') || {};
    var p = preds[this._raw.id];
    // tbd 场次时间未定（占位 t 不可信）：隐藏盲评面板（三轮 P1-5）
    // 1191/1753 场为 tbd，占位时间参与截止判定会造成「真实提前→赛后可封存」的作弊面
    if (this._raw.tbd) {
      this.setData({ myPred: null });
      return;
    }
    var isClosed = this._ts <= Date.now();

    if (p) {
      var pickZh = p.pick === 'h' ? (this.data.m ? this.data.m.home.zh + ' 胜' : '主胜')
                 : p.pick === 'a' ? (this.data.m ? this.data.m.away.zh + ' 胜' : '客胜')
                 : '平局';
      this.setData({
        myPred: {
          pick: p.pick,
          pickZh: pickZh,
          scoreH: p.scoreH || '',
          scoreA: p.scoreA || '',
          sealed: true,
          closed: isClosed
        },
        inputPick: p.pick,
        inputScoreH: p.scoreH || '',
        inputScoreA: p.scoreA || ''
      });
    } else {
      this.setData({
        myPred: {
          pick: '',
          pickZh: '',
          scoreH: '',
          scoreA: '',
          sealed: false,
          closed: isClosed
        }
      });
    }
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
    var now = Date.now();
    var state = engine.matchState(this._raw, now);
    if (state === 'ended_pending') {
      this.setData({ countdownText: '等待比分录入' });
      this.stopTimer();
      return;
    }
    var c = engine.countdown(this._ts, now);
    var text;
    if (c.over) text = '比赛中';
    else if (c.d > 0) text = '距开球 ' + c.d + '天' + c.h + '小时';
    else if (c.h > 0) text = '距开球 ' + c.h + '小时' + c.m + '分';
    else text = '距开球 ' + c.m + '分' + c.s + '秒';
    this.setData({ countdownText: text });
  },

  onSelectPick: function (e) {
    if (this.data.myPred && this.data.myPred.sealed) return;
    var key = e.currentTarget.dataset.key;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({
      inputPick: this.data.inputPick === key ? '' : key
    });
  },

  onInputScore: function (e) {
    if (this.data.myPred && this.data.myPred.sealed) return;
    var side = e.currentTarget.dataset.side;
    var val = e.detail.value.replace(/\D/g, '').slice(0, 1);
    if (side === 'h') this.setData({ inputScoreH: val });
    else this.setData({ inputScoreA: val });
  },

  onSealSingle: function () {
    var raw = this._raw;
    if (!raw) return;
    if (raw.tbd) { // 双保险（三轮 P1-5）：tbd 时间未定不可封存
      wx.showToast({ title: '开球时间未定，暂不可预测', icon: 'none' });
      return;
    }
    if (!this.data.inputPick) {
      wx.showToast({ title: '请先选择主胜/平局/客胜', icon: 'none' });
      return;
    }
    if (this._ts <= Date.now()) {
      wx.showToast({ title: '比赛已开球，无法预测', icon: 'none' });
      return;
    }

    var preds = wx.getStorageSync('predictions') || {};
    var p = {
      pick: this.data.inputPick,
      scoreH: this.data.inputScoreH,
      scoreA: this.data.inputScoreA
    };
    p.salt = crypt.genSalt();
    p.hash = crypt.commitHash(p);
    p.ts = Date.now();
    preds[raw.id] = p;
    wx.setStorageSync('predictions', preds);

    // 三态消费（三轮 P1-3）：rejected 时回滚本地封存并如实提示
    var that = this;
    cloud.addPrediction({
      m: raw.id,
      pick: p.pick,
      scoreH: p.scoreH,
      scoreA: p.scoreA,
      salt: p.salt,
      hash: p.hash,
      ts: p.ts
    }).then(function (sealed) {
      if (sealed === 'rejected') {
        var preds2 = wx.getStorageSync('predictions') || {};
        delete preds2[raw.id];
        wx.setStorageSync('predictions', preds2);
        wx.showToast({ title: '已开球，封存被拒', icon: 'none' });
        that.checkPred();
      }
    });

    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '本场预测已成功封存！', icon: 'success' });
    this.checkPred();
  },

  goPredict: function () {
    var id = this.data.m ? this.data.m.id : '';
    wx.navigateTo({ url: '/pages/predict/predict' + (id ? '?id=' + id : '') });
  },

  goCourt: function () {
    var id = this.data.m ? this.data.m.id : '';
    wx.navigateTo({ url: '/pages/court/court' + (id ? '?id=' + id : '') });
  },

  goPoster: function () {
    wx.navigateTo({ url: '/pages/poster/poster?id=' + this.data.m.id });
  },

  // 群分享：直达本 场次详情（含盲评/狂言入口）
  onShareAppMessage: function () {
    var m = this.data.m;
    return {
      title: m ? (m.home.zh + ' vs ' + m.away.zh + ' · ' + m.md + ' ' + m.hm + ' 开球') : '夜猫追球',
      path: '/pages/detail/detail?id=' + (m ? m.id : '')
    };
  },

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
      '夜猫追球-' + m.home.id + m.away.id,
      function (ok, msg) {
        wx.showToast({ title: msg || (ok ? '已加入日历' : '添加失败'), icon: ok ? 'success' : 'none' });
      }
    );
  }
});

