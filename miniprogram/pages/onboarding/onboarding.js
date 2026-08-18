var data = require('../../utils/data.js');

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: { groups: [], picked: 0 },

  onLoad: function () {
    var followed = getApp().getFollowed();
    var teams = data.getTeams();
    var groups = data.LEAGUES.filter(function (l) { return l.id !== 'SCG'; }).map(function (l) {
      return {
        id: l.id, zh: l.zh,
        teams: teams.filter(function (t) { return t.league === l.id; }).map(function (t) {
          return {
            id: t.id, zh: t.zh, color: t.color, logo: t.logo,
            on: followed.indexOf(t.id) >= 0
          };
        })
      };
    }).filter(function (g) { return g.teams.length; });

    this.setData({
      groups: groups,
      picked: groups.reduce(function (n, g) {
        return n + g.teams.filter(function (t) { return t.on; }).length;
      }, 0)
    });
  },

  toggle: function (e) {
    var gi = e.currentTarget.dataset.g, ti = e.currentTarget.dataset.t;
    var groups = this.data.groups, picked = 0;
    groups[gi].teams[ti].on = !groups[gi].teams[ti].on;
    groups.forEach(function (g) { g.teams.forEach(function (t) { if (t.on) picked++; }); });
    this.setData({ groups: groups, picked: picked });
  },

  finish: function () {
    var ids = [];
    this.data.groups.forEach(function (g) {
      g.teams.forEach(function (t) { if (t.on) ids.push(t.id); });
    });
    getApp().setFollowed(ids);
    try { wx.setStorageSync('onboarded', true); } catch (e) { }
    wx.switchTab({ url: '/pages/today/today' });
  },

  skip: function () {
    // 跳过也保留已点选的球队（若有）
    this.finish();
  }
});
