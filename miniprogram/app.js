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
