var cloud = require('../../utils/cloud.js');
var data = require('../../utils/data.js');

var DEFAULTS = { budget: 4.0, minStar: 2, remindKickoff: true, remindDeadline: false, nick: '', mid: '', theme: 'dark' };

var NICK_PREFIX = ['午夜', '熬夜', '看台', '伯纳乌', '安菲尔德', '圣西罗', '老特拉福德', '诺坎普', '酋长', '威斯特法伦'];
var NICK_SUFFIX = ['老猫', '夜猫子', '神算子', '球童', '名宿', '法官', '第十二人', '观察员', '看球仙人'];

function load() {
  var s = wx.getStorageSync('settings') || {};
  var out = {};
  Object.keys(DEFAULTS).forEach(function (k) { out[k] = s[k] !== undefined ? s[k] : DEFAULTS[k]; });
  out.budget = Number(out.budget) || 4.0;
  if (!out.nick) {
    out.nick = wx.getStorageSync('nickname') || '夜猫子';
  }
  if (!out.mid) {
    out.mid = '#MM-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    wx.setStorageSync('settings', out);
  }
  return out;
}

// 真实发版号读取：体验版/正式版返回实际上传的版本号；开发工具返回空时回退「开发版」
function appVersion() {
  try {
    var v = (wx.getAccountInfoSync().miniProgram || {}).version || '';
    if (v) return 'v' + v;
  } catch (e) { /* 低版本基础库无此 API */ }
  return '开发版';
}

Page({
  data: {
    theme: data.getInitTheme(),
    s: null,
    starText: '★★',
    themeModeText: '🌙 经典夜猫暗夜模式',
    version: appVersion(),
    source: '内置种子数据',
    cloudState: 'unknown', // unknown | ok | down：云端连接健康度
    showNickModal: false,
    inputNick: ''
  },

  onLoad: function () {
    getApp().applyTheme(this);
    this.apply(load());
  },

  onShow: function () {
    this.apply(load());
    this.probeCloud(false); // 静默探测云端健康度，进入页面即显示真实状态
  },

  apply: function (s) {
    var modeDesc = {
      dark: '🌙 经典夜猫暗夜模式',
      light: '☀️ 清爽晨曦白昼模式',
      auto: '⚙️ 自动跟随系统外观'
    }[s.theme || 'dark'] || '🌙 经典夜猫暗夜模式';

    var b = Number(s.budget !== undefined ? s.budget : 4.0) || 4.0;

    this.setData({
      s: s,
      budgetText: b.toFixed(1),
      starText: '★★★'.slice(0, s.minStar || 2),
      themeModeText: modeDesc
    });
    getApp().applyTheme(this);
    // 偏好同步 users 集合（best-effort：周报透支预算段 / 开球推送依赖；seal 不可用时静默跳过）
    cloud.syncUser({
      nick: s.nick,
      budget: s.budget,
      followed: getApp().getFollowed(),
      followedLeagues: getApp().getFollowedLeagues()
    });
  },

  selectTheme: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode) {
      getApp().setThemeMode(mode);
      var s = load();
      this.apply(s);
      wx.showToast({
        title: mode === 'light' ? '已切换至晨曦浅色' : mode === 'dark' ? '已切换至暗夜深色' : '已切换至跟随系统',
        icon: 'none'
      });
    }
  },

  save: function (patch) {
    var s = load();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    wx.setStorageSync('settings', s);
    this.apply(s);
  },

  minus: function () {
    var cur = Number(this.data.s && this.data.s.budget !== undefined ? this.data.s.budget : 4.0) || 4.0;
    var b = Math.max(1.0, Math.round((cur - 0.5) * 10) / 10);
    this.save({ budget: b });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '默认额度已设为 ' + b.toFixed(1) + 'h/周', icon: 'none' });
  },

  plus: function () {
    var cur = Number(this.data.s && this.data.s.budget !== undefined ? this.data.s.budget : 4.0) || 4.0;
    var b = Math.min(10.0, Math.round((cur + 0.5) * 10) / 10);
    this.save({ budget: b });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '默认额度已设为 ' + b.toFixed(1) + 'h/周', icon: 'none' });
  },

  cycleStar: function () {
    var next = this.data.s.minStar >= 3 ? 1 : this.data.s.minStar + 1;
    this.save({ minStar: next });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    var txt = next === 3 ? '★★★ 3星重磅' : next === 2 ? '★★ 2星及以上' : '★ 1星及全部';
    wx.showToast({ title: '门槛: ' + txt, icon: 'none' });
  },

  // 订阅授权统一入口（二轮 P2-5：kickoff 此前只存偏好不请求授权，接线补齐）
  requestSub: function (tmplId) {
    if (!tmplId || !wx.requestSubscribeMessage) {
      wx.showToast({ title: '提醒模板待配置，已记录偏好', icon: 'none' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: function (res) {
        var status = res[tmplId] === 'accept' ? 'accept' : 'reject';
        cloud.saveSubscription(tmplId, status);
      },
      fail: function () { /* 用户拒绝或环境不支持：开关仅记录偏好 */ }
    });
  },

  onKickoff: function (e) {
    this.save({ remindKickoff: e.detail.value });
    if (e.detail.value) this.requestSub(cloud.TMPL.kickoff);
  },

  onDeadline: function (e) {
    var on = e.detail.value;
    this.save({ remindDeadline: on });
    // 模板 ID 已配置时发起订阅授权并落库 subscriptions（pushReminders 扫描 status:'accept'）
    if (on) this.requestSub(cloud.TMPL.deadline);
  },

  // 云端健康探测：真实拉一次 readBoard 判定连接状态（区别于闩锁标记的乐观可用）
  probeCloud: function (manual) {
    var that = this;
    cloud.reset(); // 清除降级闩锁后重试（断网 10 分钟自动复位的手动加速版）
    cloud.readBoard('owl').then(function () {
      that.setData({ cloudState: 'ok', source: '云端数据' });
      if (manual) wx.showToast({ title: '云端已连接', icon: 'none' });
    }).catch(function () {
      that.setData({ cloudState: 'down' });
      if (manual) wx.showToast({ title: '云端不可用 · 保持本地', icon: 'none' });
    });
  },

  reconnectCloud: function () {
    this.setData({ cloudState: 'unknown' });
    this.probeCloud(true);
  },

  editNick: function () {
    this.setData({
      showNickModal: true,
      inputNick: this.data.s.nick || ''
    });
  },

  onNickInput: function (e) {
    this.setData({ inputNick: e.detail.value });
  },

  randomNick: function () {
    var p = NICK_PREFIX[Math.floor(Math.random() * NICK_PREFIX.length)];
    var s = NICK_SUFFIX[Math.floor(Math.random() * NICK_SUFFIX.length)];
    this.setData({ inputNick: p + s });
  },

  cancelNick: function () {
    this.setData({ showNickModal: false });
  },

  confirmNick: function () {
    var name = (this.data.inputNick || '').trim().slice(0, 12);
    if (!name) {
      wx.showToast({ title: '请输入有效昵称', icon: 'none' });
      return;
    }
    this.save({ nick: name });
    try {
      wx.setStorageSync('nickname', name);
    } catch (e) {}
    this.setData({ showNickModal: false });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '圈内绰号已保存', icon: 'none' });
  },

  copyId: function () {
    wx.setClipboardData({
      data: this.data.s.mid,
      success: function () { wx.showToast({ title: 'ID 已复制', icon: 'none' }); }
    });
  },

  logout: function () {
    var that = this;
    wx.showModal({
      title: '清除本地记录',
      content: '本地体验版无需登录。将清除预测、狂言、打卡、关注与偏好，确定？',
      confirmColor: '#FFB4AB',
      success: function (r) {
        if (!r.confirm) return;
        ['predictions', 'boasts', 'checkins', 'settings', 'nickname', 'onboarded', 'followedTeams', 'followedLeagues', 'weekSuggest', '_cloudDown', 'cached_scores']
          .forEach(function (k) { wx.removeStorageSync(k); });
        // 透支结算标记 settled_* 逐键清理
        var info = wx.getStorageInfoSync();
        (info.keys || []).forEach(function (k) {
          if (/^settled_/.test(k)) wx.removeStorageSync(k);
        });
        // 同步复位全局缓存：否则 getFollowed 等仍持旧值直到重启小程序
        var app = getApp();
        app.setFollowed([]);
        app.setFollowedLeagues(['PL', 'PD', 'SA', 'BL', 'FL']);
        app.globalData.themeMode = null;
        app._appliedNavTheme = null;
        app._appliedTabBarTheme = null;
        app.applyTheme();
        that.apply(load());
        wx.showToast({ title: '已清除', icon: 'none' });
      }
    });
  },

  preventD: function () {}
});

