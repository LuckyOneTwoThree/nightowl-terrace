var data = require('../../utils/data.js');

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  data: {
    nickname: '',
    groups: [],
    stats: { hours: '0h', preds: 0, hit: '—' },
    menu: [
      { id: 'preds', icon: '🎯', name: '我的预测' },
      { id: 'boasts', icon: '⚖️', name: '狂言存档' },
      { id: 'checkins', icon: '🌙', name: '打卡记录' },
      { id: 'subs', icon: '🔔', name: '订阅提醒' },
      { id: 'settings', icon: '⚙️', name: '设置' }
    ]
  },

  onShow: function () {
    var nickname = wx.getStorageSync('nickname');
    if (!nickname) {
      nickname = '夜猫_' + Math.floor(1000 + Math.random() * 9000);
      wx.setStorageSync('nickname', nickname);
    }

    var followed = getApp().getFollowed();
    var preds = wx.getStorageSync('predictions') || {};

    var groups = ['PL', 'PD', 'SA', 'BL', 'FL'].map(function (lg) {
      return {
        id: lg,
        zh: lgZh(lg),
        teams: data.getTeams().filter(function (t) { return t.league === lg; }).map(function (t) {
          return {
            id: t.id,
            zh: t.zh,
            color: t.color,
            dot: data.tint(t.color, .9),
            on: followed.indexOf(t.id) >= 0,
            isNew: t.tag === 'promoted'
          };
        })
      };
    });

    this.setData({
      nickname: nickname,
      groups: groups,
      stats: { hours: '0h', preds: Object.keys(preds).length, hit: '—' }
    });
  },

  onToggle: function (e) {
    var id = e.currentTarget.dataset.id;
    var app = getApp();
    var followed = app.getFollowed();
    var i = followed.indexOf(id);
    if (i >= 0) followed.splice(i, 1); else followed.push(id);
    app.setFollowed(followed);

    var groups = this.data.groups.map(function (g) {
      g.teams = g.teams.map(function (t) {
        if (t.id === id) t.on = followed.indexOf(id) >= 0;
        return t;
      });
      return g;
    });
    this.setData({ groups: groups });
  },

  onMenu: function () {
    wx.showToast({ title: '云版本上线', icon: 'none' });
  }
});
