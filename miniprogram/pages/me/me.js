var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  data: {
    theme: data.getInitTheme(),
    nickname: '',
    followedTeams: [],
    followedIds: [],
    myWeek: [],
    stats: { hours: '0h', preds: 0, hit: '—' },

    menu: [
      { id: 'preds', icon: '🎯', name: '我的预测' },
      { id: 'boasts', icon: '⚖️', name: '狂言存档' },
      { id: 'checkins', icon: '🌙', name: '打卡记录' },
      { id: 'subs', icon: '🔔', name: '订阅提醒' },
      { id: 'settings', icon: '⚙️', name: '设置' }
    ]
  },

  onLoad: function () {
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    this.refresh();
  },

  refresh: function () {
    var settings = wx.getStorageSync('settings') || {};
    var nickname = settings.nick || wx.getStorageSync('nickname');
    if (!nickname) {
      nickname = '夜猫_' + Math.floor(1000 + Math.random() * 9000);
      wx.setStorageSync('nickname', nickname);
    }

    var followed = getApp().getFollowed() || [];
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

    // 已关注球队完整信息列表（外层仅展示已关注）
    var followedTeams = followed.map(function (id) {
      var t = data.getTeam(id);
      return {
        id: t.id,
        zh: t.zh,
        color: t.color,
        logo: t.logo || '',
        bg: data.tint(t.color, .2),
        bd: data.tint(t.color, .4),
        lg: t.league,
        lgZh: lgZh(t.league)
      };
    });

    // 我的关注 · 本周主队赛程（PM 7.4 聚合视图）
    var now = new Date();
    var start = engine.dateStr(now);
    var end = engine.dateStr(new Date(now.getTime() + 7 * 86400000));
    var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    var myWeek = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end && (followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0);
    }).sort(function (x, y) { return x.t < y.t ? -1 : 1; }).map(function (m) {
      var f = m.t.split('T');
      var dd = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      return {
        id: m.id,
        lgZh: lgZh(m.l),
        pair: data.getTeam(m.h).zh + ' vs ' + data.getTeam(m.a).zh,
        md: (dd.getMonth() + 1) + '/' + dd.getDate(),
        wd: '周' + WEEK[dd.getDay()],
        hm: f[1],
        tbd: !!m.tbd
      };
    }).slice(0, 8);

    this.setData({
      nickname: nickname,
      followedTeams: followedTeams,
      followedIds: followed,
      myWeek: myWeek,
      stats: { hours: hours, preds: Object.keys(preds).length, hit: total ? Math.round(hit * 100 / total) + '%' : '—' }
    });
  },

  goManageTeams: function () {
    wx.navigateTo({ url: '/pages/teams/teams' });
  },

  onRemoveFollow: function (e) {
    var id = e.currentTarget.dataset.id;
    var followed = (this.data.followedIds || []).slice();
    var idx = followed.indexOf(id);
    if (idx >= 0) {
      followed.splice(idx, 1);
      getApp().setFollowed(followed);
      this.refresh();
      wx.showToast({ title: '已取消关注', icon: 'none' });
    }
  },

  onEditNick: function () {
    wx.navigateTo({ url: '/pages/settings/settings' });
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
  },

  goMatch: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});



