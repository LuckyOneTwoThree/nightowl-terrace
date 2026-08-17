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
    var settings = wx.getStorageSync('settings') || {};
    var nickname = settings.nick || wx.getStorageSync('nickname');
    if (!nickname) {
      nickname = '夜猫_' + Math.floor(1000 + Math.random() * 9000);
      wx.setStorageSync('nickname', nickname);
    }

    var followed = getApp().getFollowed();
    var preds = wx.getStorageSync('predictions') || {};

    // 打卡时长与预测命中率
    var checkins = wx.getStorageSync('checkins') || {};
    var mins = 0;
    Object.keys(checkins).forEach(function (k) { mins += (checkins[k].cost || 0) * 60; });
    var hours = (Math.round(mins / 6) / 10) + 'h';
    var hit = 0, total = 0;
    Object.keys(preds).forEach(function (mid) {
      var m = data.getMatch(mid);
      if (m && m.sc) {
        var sc = m.sc.split('-'), h = Number(sc[0]), a = Number(sc[1]);
        total++;
        if (preds[mid].pick === (h > a ? 'h' : h < a ? 'a' : 'd')) hit++;
      }
    });

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
      stats: { hours: hours, preds: Object.keys(preds).length, hit: total ? Math.round(hit * 100 / total) + '%' : '—' }
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

  onMenu: function (e) {
    var id = e.currentTarget.dataset.id;
    var urls = {
      preds: '/pages/records/records',
      boasts: '/pages/court/court',
      checkins: '/pages/board/board',
      subs: '/pages/settings/settings',
      settings: '/pages/settings/settings'
    };
    if (urls[id]) wx.navigateTo({ url: urls[id] });
  }
});
