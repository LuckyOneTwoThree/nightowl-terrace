// app.js
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
  },

  // 原生系统级样式缓存状态
  _appliedNavTheme: null,
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
        var info = wx.getSystemInfoSync();
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

    this._appliedNavTheme = null;
    this._appliedTabBarTheme = null;
    this.applyTheme(null);

    // 实时更新当前页面栈上的所有页面
    var that = this;
    if (typeof getCurrentPages === 'function') {
      try {
        var pages = getCurrentPages() || [];
        pages.forEach(function (p) {
          that.applyTheme(p);
        });
      } catch (e) { }
    }
  },

  updateTabBar: function () {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';
    var that = this;

    if (wx.setTabBarStyle) {
      wx.setTabBarStyle({
        color: isLight ? '#64748B' : '#8E8A81',
        selectedColor: isLight ? '#D97706' : '#FFB224',
        backgroundColor: isLight ? '#FFFFFF' : '#101419',
        borderStyle: isLight ? 'white' : 'black',
        success: function () {
          that._appliedTabBarTheme = theme;
        },
        fail: function () {
          // 非 TabBar 页面调用失败属于正常预期，置空以便在 Tab 页面激活时重试
          that._appliedTabBarTheme = null;
        }
      });
    }
  },

  applyTheme: function (pageInstance) {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';

    // 1. 同步当前页面实例的主题数据
    if (pageInstance && pageInstance.setData) {
      if (!pageInstance.data || pageInstance.data.theme !== theme) {
        pageInstance.setData({ theme: theme });
      }
    }

    // 2. 原生导航栏与背景色（每个页面独立生效）
    if (wx.setNavigationBarColor) {
      wx.setNavigationBarColor({
        frontColor: isLight ? '#000000' : '#ffffff',
        backgroundColor: isLight ? '#F4F5F7' : '#101419',
        animation: { duration: 0 },
        fail: function () { }
      });
    }

    if (wx.setBackgroundColor) {
      wx.setBackgroundColor({
        backgroundColor: isLight ? '#F4F5F7' : '#101419',
        backgroundColorTop: isLight ? '#F4F5F7' : '#101419',
        backgroundColorBottom: isLight ? '#F4F5F7' : '#101419',
        fail: function () { }
      });
    }

    // 3. TabBar 样式更新：只要当前尚未成功应用目标主题，则立即尝试更新
    if (this._appliedTabBarTheme !== theme) {
      this.updateTabBar();
    }
  }
});


