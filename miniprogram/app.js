// app.js
App({
  onLaunch: function () {
    // 云开发初始化（M2 阶段未开通，静默降级为内置数据）
    if (!wx.cloud) {
      console.log('[nightowl] 基础库版本过低，无法使用云能力');
    } else {
      // wx.cloud.init({ traceUser: true });
      // AppID 就绪后取消上一行注释并填入 env
    }
  },
  globalData: {
    followedTeams: null // 关注球队 id 数组，首次进入「我的」页引导选择
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
  }
});
