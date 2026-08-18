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

  // 主题管理（'dark' | 'light' | 'auto'）
  _lastAppliedTheme: null,

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

    this._lastAppliedTheme = null; // 强制触发原生样式更新
    this.applyTheme();

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

  applyTheme: function (pageInstance) {
    var theme = this.getEffectiveTheme();
    var isLight = theme === 'light';

    // 仅在当前页面 theme 与实际生效主题不一致时才 setData，避免无谓重排
    if (pageInstance && pageInstance.setData) {
      if (!pageInstance.data || pageInstance.data.theme !== theme) {
        pageInstance.setData({ theme: theme });
      }
    }

    // 仅在全局生效主题发生变化时，才调用微信原生 API（彻底解决切页时原生导航栏 200ms 动画闪烁问题）
    if (this._lastAppliedTheme !== theme) {
      this._lastAppliedTheme = theme;

      // 动态更新页面底层背景色（避免下拉回弹露黑底）
      if (wx.setBackgroundColor) {
        wx.setBackgroundColor({
          backgroundColor: isLight ? '#F4F5F7' : '#101419',
          backgroundColorTop: isLight ? '#F4F5F7' : '#101419',
          backgroundColorBottom: isLight ? '#F4F5F7' : '#101419',
          fail: function () { }
        });
      }

      // 动态更新原生导航栏（无过渡动画，瞬间就绪）
      if (wx.setNavigationBarColor) {
        wx.setNavigationBarColor({
          frontColor: isLight ? '#000000' : '#ffffff',
          backgroundColor: isLight ? '#F4F5F7' : '#101419',
          animation: { duration: 0 },
          fail: function () { }
        });
      }

      // 动态更新 TabBar 样式
      if (wx.setTabBarStyle) {
        wx.setTabBarStyle({
          color: isLight ? '#64748B' : '#9F8E79',
          selectedColor: isLight ? '#D97706' : '#FFB224',
          backgroundColor: isLight ? '#FFFFFF' : '#101419',
          borderStyle: isLight ? 'white' : 'black',
          fail: function () { }
        });
      }
    }
  }
});


