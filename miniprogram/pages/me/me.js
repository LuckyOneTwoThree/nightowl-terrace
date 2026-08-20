var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var crypt = require('../../utils/crypt.js');

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
    expandTeams: false,
    expandMatches: false,

    menu: [
      { id: 'preds', icon: '🎯', name: '我的预测' },
      { id: 'boasts', icon: '⚖️', name: '狂言存档' },
      { id: 'checkins', icon: '🌙', name: '打卡记录' },
      { id: 'subs', icon: '🔔', name: '订阅提醒' },
      { id: 'settings', icon: '⚙️', name: '设置' }
    ]
  },

  onLoad: function () {
    getApp().applyTheme(this);
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    var followed = getApp().getFollowed() || [];
    var preds = wx.getStorageSync('predictions') || {};
    var checkins = wx.getStorageSync('checkins') || {};
    var settings = wx.getStorageSync('settings') || {};
    var fp = JSON.stringify({ f: followed, p: Object.keys(preds).length, c: Object.keys(checkins).length, s: settings.nick });
    if (this._lastFp !== fp) {
      this._lastFp = fp;
      this.refresh();
    }
  },

  refresh: function () {
    var settings = wx.getStorageSync('settings') || {};
    var followed = getApp().getFollowed() || [];
    var preds = wx.getStorageSync('predictions') || {};
    var checkins = wx.getStorageSync('checkins') || {};
    this._lastFp = JSON.stringify({ f: followed, p: Object.keys(preds).length, c: Object.keys(checkins).length, s: settings.nick });
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
    // 命中率统一走 settlePred 判据（含封存校验/开球后作废/比分加分，与 records/board/云端一致）
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid];
      var m = data.getMatch(mid);
      if (!m || !p || !crypt.verify(p)) return;
      var kickTs = engine.ts(m.t);
      if (p.ts && !isNaN(kickTs) && p.ts > kickTs + 60000) return; // 开球后封存作废
      var r = engine.settlePred(p, m, recMap);
      if (r) { total++; if (r.hit) hit++; }
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

    // 我的关注 · 本周主队赛程（PM 7.4 聚合视图，北京自然日口径）
    var start = engine.bjDateStr(Date.now());
    var end = engine.bjDateStr(Date.now() + 7 * 86400000);
    var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    var myWeek = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end && (followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0);
    }).sort(function (x, y) { return x.t < y.t ? -1 : 1; }).map(function (m) {
      var f = m.t.split('T');
      var dd = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var h = data.getTeam(m.h);
      var a = data.getTeam(m.a);
      var ev = engine.evaluate(m, recMap, rivs, sls, followed);
      var tier = engine.tierOf(m);
      return {
        id: m.id,
        l: m.l,
        lgZh: lgZh(m.l),
        home: { id: h.id, zh: h.zh, logo: h.logo || '', bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
        away: { id: a.id, zh: a.zh, logo: a.logo || '', bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
        md: (dd.getMonth() + 1) + '/' + dd.getDate(),
        wd: '周' + WEEK[dd.getDay()],
        hm: f[1],
        st: m.st,
        scH: m.sc ? m.sc.split('-')[0] : '',
        scA: m.sc ? m.sc.split('-')[1] : '',
        finished: m.st === 'done',
        star: ev.star,
        stars: '★★★'.slice(0, ev.star),
        tierLabel: tier.label,
        cost: tier.cost,
        tbd: !!m.tbd
      };
    }).slice(0, 8);

    // 本地赛季积分
    var seasonPts = 0;
    Object.keys(preds).forEach(function (midKey) {
      var p = preds[midKey], mm = data.getMatch(midKey);
      if (!mm || !p || !crypt.verify(p)) return;
      var r = engine.settlePred(p, mm, recMap);
      if (r) seasonPts += r.pts;
    });

    var hoursNum = parseFloat(hours) || 0;
    var levelZh = hoursNum >= 10 ? 'Lv.5 修仙宗师' : hoursNum >= 5 ? 'Lv.4 资深夜猫' : 'Lv.3 夜猫子';
    var mid = settings.mid || 'MID-' + Math.abs(nickname.split('').reduce(function(a,b){return (a<<5)-a+b.charCodeAt(0);},0)).toString(16).toUpperCase().slice(0, 6);

    this.setData({
      nickname: nickname,
      mid: mid,
      levelZh: levelZh,
      seasonPts: seasonPts,
      followedTeams: followedTeams,
      followedIds: followed,
      myWeek: myWeek,
      stats: { hours: hours, preds: Object.keys(preds).length, hit: total ? Math.round(hit * 100 / total) + '%' : '—', seasonPts: seasonPts }
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

  toggleExpandTeams: function () {
    this.setData({ expandTeams: !this.data.expandTeams });
  },

  toggleExpandMatches: function () {
    this.setData({ expandMatches: !this.data.expandMatches });
  },

  goMatch: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});



