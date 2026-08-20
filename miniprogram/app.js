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

    this._appliedTabBarTheme = null;
    var targetTheme = this.getEffectiveTheme();

    // 实时更新当前页面栈上的所有页面数据与状态锁
    if (typeof getCurrentPages === 'function') {
      try {
        var pages = getCurrentPages() || [];
        var that = this;
        pages.forEach(function (p) {
          if (p) {
            p._appliedNavTheme = null;
            p._appliedBgTheme = null;
            if (p.setData) {
              p.setData({ theme: targetTheme });
            }
          }
        });
        if (pages.length > 0) {
          this.applyTheme(pages[pages.length - 1]);
        }
      } catch (e) { }
    } else {
      this.applyTheme(null);
    }
  },

  updateTabBar: function () {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';
    var that = this;

    if (wx.setTabBarStyle) {
      wx.setTabBarStyle({
        color: isLight ? '#64748B' : '#94A3B8',
        selectedColor: isLight ? '#D97706' : '#FFB800',
        backgroundColor: isLight ? '#FFFFFF' : '#080B10',
        borderStyle: isLight ? 'white' : 'black',
        success: function () {
          that._appliedTabBarTheme = theme;
        },
        fail: function () {
          that._appliedTabBarTheme = null;
        }
      });
    }
  },

  applyTheme: function (pageInstance) {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';

    // 1. 同步当前页面实例的主题数据（若未变动则不调用 setData 避免触发重绘）
    if (pageInstance) {
      if (pageInstance.data && pageInstance.data.theme !== theme) {
        if (pageInstance.setData) {
          pageInstance.setData({ theme: theme });
        }
      } else if (!pageInstance.data) {
        pageInstance.data = { theme: theme };
      }

      // 2. 原生顶栏（仅在该页面实例尚未应用该主题时设置一次，避免重复调用引起的原生微闪烁）
      if (pageInstance._appliedNavTheme !== theme) {
        if (wx.setNavigationBarColor) {
          wx.setNavigationBarColor({
            frontColor: isLight ? '#000000' : '#ffffff',
            backgroundColor: isLight ? '#F4F5F7' : '#080B10',
            animation: { duration: 0 },
            success: function () {
              pageInstance._appliedNavTheme = theme;
            },
            fail: function () { }
          });
        }
      }

      // 3. 原生背景与上下橡皮筋底色（仅在该页面实例尚未应用该主题时设置一次）
      if (pageInstance._appliedBgTheme !== theme) {
        if (wx.setBackgroundColor) {
          wx.setBackgroundColor({
            backgroundColor: isLight ? '#F4F5F7' : '#080B10',
            backgroundColorTop: isLight ? '#F4F5F7' : '#080B10',
            backgroundColorBottom: isLight ? '#F4F5F7' : '#080B10',
            success: function () {
              pageInstance._appliedBgTheme = theme;
            },
            fail: function () { }
          });
        }
      }
    }

    // 4. TabBar 样式更新（仅在 TabBar 尚未应用目标主题时更新）
    if (this._appliedTabBarTheme !== theme) {
      this.updateTabBar();
    }
  }
});
