var data = require('../../utils/data.js');

Page({
  data: {
    groups: [],
    followed: [],
    firstTime: false
  },

  onShow: function () {
    var followed = getApp().getFollowed();
    var teams = data.getTeams();
    var leagues = ['PL', 'PD', 'SA', 'BL', 'FL'];
    var zhMap = {};
    data.LEAGUES.forEach(function (l) { zhMap[l.id] = l.zh; });

    var groups = leagues.map(function (lg) {
      return {
        id: lg,
        zh: zhMap[lg],
        teams: teams.filter(function (t) { return t.league === lg; }).map(function (t) {
          return {
            id: t.id,
            zh: t.zh,
            color: t.color,
            on: followed.indexOf(t.id) >= 0,
            tag: t.tag || ''
          };
        })
      };
    });

    this.setData({
      groups: groups,
      followed: followed,
      firstTime: followed.length === 0
    });
  },

  onToggle: function (e) {
    var id = e.currentTarget.dataset.id;
    var followed = this.data.followed.slice();
    var i = followed.indexOf(id);
    if (i >= 0) followed.splice(i, 1);
    else followed.push(id);

    getApp().setFollowed(followed);

    var groups = this.data.groups.map(function (g) {
      g.teams = g.teams.map(function (t) {
        t.on = followed.indexOf(t.id) >= 0;
        return t;
      });
      return g;
    });
    this.setData({ groups: groups, followed: followed, firstTime: followed.length === 0 });
  },

  onGoToday: function () {
    wx.switchTab({ url: '/pages/today/today' });
  }
});
