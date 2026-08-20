// app.js
var cloud = require('./utils/cloud.js');

App({
  onLaunch: function () {
    // 云开发初始化
    if (!wx.cloud) {
      console.log('[nightowl] 基础库版本过低，无法使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloudbase-d3gvu54t8fbbb6b3f',
        traceUser: true
      });
      console.log('[nightowl] 云开发已初始化');
      try {
        var dataUtil = require('./utils/data.js');
        dataUtil.syncScores();
      } catch (e) {}
    }

    // 监听系统深浅色切换
    var that = this;
    if (wx.onThemeChange) {
      wx.onThemeChange(function (res) {
        if (that.getThemeMode() === 'auto') {
          that.applyTheme();
        }
      });
    }

    // 等宽字体已内联 app.wxss @font-face（woff2 base64），无需运行时加载

    // 启动即刻同步原生导航栏、背景与 TabBar 样式
    this.applyTheme();
  },
  globalData: {
    followedTeams: null,
    themeMode: null
  },
  getFollowed: function () {
    if (this.globalData.followedTeams === null) {
      try {
        this.globalData.followedTeams = wx.getStorageSync('followedTeams') || [];
      } catch (e) {
        this.globalData.followedTeams = [];
      }
    }
    return this.globalData.followedTeams;
  },
  setFollowed: function (ids) {
    this.globalData.followedTeams = ids;
    try {
      wx.setStorageSync('followedTeams', ids);
    } catch (e) { /* 存储失败不阻塞 */ }
    // 云端 users.followed best-effort 同步（二轮 P2-5：onboarding/teams/me 页改关注后
    // 主队推送不再停留旧值；失败静默，下次 settings 页 apply 会再同步）
    try {
      cloud.syncUser({ followed: ids });
    } catch (e) { /* 忽略 */ }
  },

  // 原生系统级样式缓存状态
  _appliedNavTheme: null,
  _appliedBgTheme: null,
  _appliedTabBarTheme: null,

  getThemeMode: function () {
    if (!this.globalData.themeMode) {
      try {
        var s = wx.getStorageSync('settings') || {};
        this.globalData.themeMode = s.theme || 'dark';
      } catch (e) {
        this.globalData.themeMode = 'dark';
      }
    }
    return this.globalData.themeMode;
  },

  getEffectiveTheme: function () {
    var mode = this.getThemeMode();
    if (mode === 'auto') {
      try {
        var info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
        return info.theme === 'light' ? 'light' : 'dark';
      } catch (e) {
        return 'dark';
      }
    }
    return mode === 'light' ? 'light' : 'dark';
  },

  setThemeMode: function (mode) {
    this.globalData.themeMode = mode;
    try {
      var s = wx.getStorageSync('settings') || {};
      s.theme = mode;
      wx.setStorageSync('settings', s);
    } catch (e) { }

    var targetTheme = this.getEffectiveTheme();

    // 实时更新当前页面栈上的所有页面数据与顶栏
    if (typeof getCurrentPages === 'function') {
      try {
        var pages = getCurrentPages() || [];
        pages.forEach(function (p) {
          if (p && p.setData) {
            p.setData({ theme: targetTheme });
          }
        });
        if (pages.length > 0) {
          this.applyTheme(pages[pages.length - 1]);
        } else {
          this.applyTheme(null);
        }
      } catch (e) {
        this.applyTheme(null);
      }
    } else {
      this.applyTheme(null);
    }
  },

  updateTabBar: function () {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';

    if (wx.setTabBarStyle) {
      wx.setTabBarStyle({
        color: isLight ? '#64748B' : '#9AA5BB',
        selectedColor: isLight ? '#D97706' : '#FFB224',
        backgroundColor: isLight ? '#FFFFFF' : '#0B0E14',
        borderStyle: isLight ? 'white' : 'black',
        fail: function () { }
      });
    }
  },

  applyTheme: function (pageInstance) {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';

    // 1. 同步当前页面实例的主题数据（若未变动则不调用 setData 避免触发重绘）
    if (pageInstance && pageInstance.setData) {
      if (!pageInstance.data || pageInstance.data.theme !== theme) {
        pageInstance.setData({ theme: theme });
      }
    }

    // 2. 原生顶栏：必须始终确保当前活跃页面的原生导航栏与状态栏颜色准确
    if (wx.setNavigationBarColor) {
      wx.setNavigationBarColor({
        frontColor: isLight ? '#000000' : '#ffffff',
        backgroundColor: isLight ? '#F4F5F7' : '#0B0E14',
        animation: { duration: 0 },
        fail: function () { }
      });
    }

    // 3. 原生背景与上下橡皮筋底色：确保顶部下拉与底部上拉均与主题完全一致
    if (wx.setBackgroundColor) {
      wx.setBackgroundColor({
        backgroundColor: isLight ? '#F4F5F7' : '#0B0E14',
        backgroundColorTop: isLight ? '#F4F5F7' : '#0B0E14',
        backgroundColorBottom: isLight ? '#F4F5F7' : '#0B0E14',
        fail: function () { }
      });
    }

    // 4. TabBar 样式更新：确保底部 TabBar 颜色始终精准
    this.updateTabBar();
  }
});


