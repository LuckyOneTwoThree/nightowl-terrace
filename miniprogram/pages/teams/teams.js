var data = require('../../utils/data.js');

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: {
    theme: data.getInitTheme(),
    activeTab: 'leagues', // 'leagues' | 'teams'
    leagueList: [],
    pickedLeaguesCount: 5,
    groups: [],
    draftFollowed: [],
    pickedCount: 0
  },

  onLoad: function (query) {
    getApp().applyTheme(this);
    var targetTab = (query && query.tab === 'teams') ? 'teams' : 'leagues';
    var followed = getApp().getFollowed() || [];
    var followedLeagues = getApp().getFollowedLeagues() || data.TOP_LEAGUE_IDS;

    // 初始化联赛草稿列表
    var leagueList = data.TOP_LEAGUE_IDS.map(function (lid) {
      var info = data.LEAGUE_INFO[lid] || {};
      var meta = data.LEAGUE_META[lid] || {};
      return {
        id: lid,
        zh: info.zh || lid,
        en: info.en || '',
        tagline: info.tagline || '',
        desc: info.desc || '',
        solid: meta.solid || '#7C3AED',
        accent: meta.accent || '#38003C',
        on: followedLeagues.indexOf(lid) >= 0
      };
    });

    var pickedLeaguesCount = leagueList.filter(function (l) { return l.on; }).length;

    this.setData({
      activeTab: targetTab,
      leagueList: leagueList,
      pickedLeaguesCount: pickedLeaguesCount,
      draftFollowed: followed.slice(),
      pickedCount: followed.length
    });

    this.buildGroups(followed);
  },

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab && tab !== this.data.activeTab) {
      this.setData({ activeTab: tab });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }
  },

  toggleLeagueItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var list = this.data.leagueList.map(function (l) {
      if (l.id === id) l.on = !l.on;
      return l;
    });
    var picked = list.filter(function (l) { return l.on; }).length;
    this.setData({
      leagueList: list,
      pickedLeaguesCount: picked
    });
    // 联动重建球队分组展开状态
    this.buildGroups(this.data.draftFollowed);
    // 即时同步至全局与 Storage
    this._persist();
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  buildGroups: function (draftList) {
    var prevExpanded = {};
    (this.data.groups || []).forEach(function (g) {
      prevExpanded[g.id] = g.expanded;
    });

    var followedLidSet = {};
    this.data.leagueList.forEach(function (l) {
      if (l.on) followedLidSet[l.id] = true;
    });

    var groups = data.TOP_LEAGUE_IDS.map(function (lg, idx) {
      var allTeams = data.getTeams().filter(function (t) { return t.league === lg; });
      var selectedCount = 0;
      var teams = allTeams.map(function (t) {
        var on = draftList.indexOf(t.id) >= 0;
        if (on) selectedCount++;
        return {
          id: t.id,
          zh: t.zh,
          color: t.color,
          logo: t.logo || '',
          bg: data.tint(t.color, on ? .25 : .12),
          bd: data.tint(t.color, on ? .5 : .2),
          on: on,
          isNew: t.tag === '升班马'
        };
      });

      var meta = data.LEAGUE_META[lg] || {};
      var isLeagueFollowed = !!followedLidSet[lg];
      return {
        id: lg,
        zh: lgZh(lg),
        accent: meta.accent || '#FFB224',
        solid: meta.solid || '#7C3AED',
        teams: teams,
        selectedCount: selectedCount,
        isLeagueFollowed: isLeagueFollowed,
        expanded: prevExpanded[lg] !== undefined ? prevExpanded[lg] : (isLeagueFollowed || idx === 0)
      };
    });

    this.setData({ groups: groups });
  },

  toggleAccordion: function (e) {
    var id = e.currentTarget.dataset.id;
    var groups = this.data.groups.map(function (g) {
      if (g.id === id) g.expanded = !g.expanded;
      return g;
    });
    this.setData({ groups: groups });
  },

  toggleTeam: function (e) {
    var id = e.currentTarget.dataset.id;
    var draft = this.data.draftFollowed.slice();
    var idx = draft.indexOf(id);
    if (idx >= 0) {
      draft.splice(idx, 1);
    } else {
      draft.push(id);
    }
    this.setData({ draftFollowed: draft, pickedCount: draft.length });
    this.buildGroups(draft);
    // 即时同步至全局与 Storage，确保无需点保存/返回即生效
    this._persist();
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  _persist: function () {
    var app = getApp();
    if (!app) return;
    var pickedLids = (this.data.leagueList || []).filter(function (l) { return l.on; }).map(function (l) { return l.id; });
    if (!pickedLids.length) pickedLids = data.TOP_LEAGUE_IDS.slice();
    app.setFollowedLeagues(pickedLids);
    app.setFollowed(this.data.draftFollowed || []);
  },

  onUnload: function () {
    this._persist();
  },

  save: function () {
    this._persist();
    wx.showToast({ title: '关注偏好已保存', icon: 'success' });
    setTimeout(function () {
      wx.navigateBack();
    }, 300);
  }
});
