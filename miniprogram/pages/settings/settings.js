var DEFAULTS = { budget: 4.0, minStar: 2, remindKickoff: true, remindDeadline: false, nick: '', mid: '' };

function load() {
  var s = wx.getStorageSync('settings') || {};
  var out = {};
  Object.keys(DEFAULTS).forEach(function (k) { out[k] = s[k] !== undefined ? s[k] : DEFAULTS[k]; });
  if (!out.mid) {
    out.mid = '#MM-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    wx.setStorageSync('settings', out);
  }
  return out;
}

Page({
  data: {
    s: null,
    starText: '★★',
    version: 'v0.2.0 (M2 本地版)',
    source: '内置种子数据'
  },

  onShow: function () { this.apply(load()); },

  apply: function (s) {
    this.setData({ s: s, starText: '★★★'.slice(0, s.minStar) });
  },

  save: function (patch) {
    var s = load();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    wx.setStorageSync('settings', s);
    this.apply(s);
  },

  minus: function () {
    var b = Math.max(1, (this.data.s.budget * 10 - 5) / 10);
    this.save({ budget: b });
  },

  plus: function () {
    var b = Math.min(8, (this.data.s.budget * 10 + 5) / 10);
    this.save({ budget: b });
  },

  cycleStar: function () {
    var next = this.data.s.minStar >= 3 ? 1 : this.data.s.minStar + 1;
    this.save({ minStar: next });
  },

  onKickoff: function (e) { this.save({ remindKickoff: e.detail.value }); },
  onDeadline: function (e) { this.save({ remindDeadline: e.detail.value }); },

  editNick: function () {
    var that = this;
    wx.showModal({
      title: '圈内昵称',
      editable: true,
      placeholderText: '排行榜里显示的名字',
      content: this.data.s.nick,
      success: function (r) {
        if (r.confirm) that.save({ nick: (r.content || '').slice(0, 12) });
      }
    });
  },

  copyId: function () {
    wx.setClipboardData({
      data: this.data.s.mid,
      success: function () { wx.showToast({ title: 'ID 已复制', icon: 'none' }); }
    });
  },

  logout: function () {
    wx.showModal({
      title: '清除本地记录',
      content: '本地体验版无需登录。将清除预测、狂言、打卡与偏好，确定？',
      confirmColor: '#FFB4AB',
      success: function (r) {
        if (!r.confirm) return;
        ['predictions', 'boasts', 'checkins', 'settings'].forEach(function (k) { wx.removeStorageSync(k); });
        wx.showToast({ title: '已清除', icon: 'none' });
      }
    });
  }
});
