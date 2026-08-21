var data = require('../../utils/data.js');

var GIANTS = ['ARS', 'MCI', 'LIV', 'CHE', 'MUN', 'TOT', 'RMA', 'BAR', 'ATM', 'MIL', 'INT', 'JUV', 'FCB', 'BVB', 'PSG'];

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: {
    theme: data.getInitTheme(),
    step: 1, // 1 = 选联赛, 2 = 选主队
    leagueList: [],
    pickedLeaguesCount: 5,
    groups: [],
    pickedTeamsCount: 0,
    allSelectedLeagues: true
  },

  onLoad: function () {
    getApp().applyTheme(this);
    var followedLeagues = getApp().getFollowedLeagues() || data.TOP_LEAGUE_IDS;
    var followedTeams = getApp().getFollowed() || [];

    // 初始化联赛列表
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
      leagueList: leagueList,
      pickedLeaguesCount: pickedLeaguesCount,
      allSelectedLeagues: pickedLeaguesCount === leagueList.length
    });

    this.buildTeamGroups(followedTeams);
  },

  buildTeamGroups: function (draftTeams) {
    draftTeams = draftTeams || [];
    var activeLids = this.data.leagueList.filter(function (l) { return l.on; }).map(function (l) { return l.id; });
    // 若未选任何联赛，兜底展开全部五大联赛
    if (!activeLids.length) activeLids = data.TOP_LEAGUE_IDS.slice();

    var allTeams = data.getTeams();
    var groups = activeLids.map(function (lid) {
      var info = data.LEAGUE_INFO[lid] || {};
      var meta = data.LEAGUE_META[lid] || {};
      var teams = allTeams.filter(function (t) { return t.league === lid; }).map(function (t) {
        return {
          id: t.id,
          zh: t.zh,
          color: t.color,
          logo: t.logo,
          on: draftTeams.indexOf(t.id) >= 0,
          bg: data.tint(t.color, .2),
          bd: data.tint(t.color, .35)
        };
      });
      var selectedCount = teams.filter(function (t) { return t.on; }).length;
      return {
        id: lid,
        zh: info.zh || lid,
        en: info.en || '',
        solid: meta.solid || '#7C3AED',
        teams: teams,
        selectedCount: selectedCount
      };
    }).filter(function (g) { return g.teams.length; });

    var pickedTeamsCount = groups.reduce(function (n, g) {
      return n + g.selectedCount;
    }, 0);

    this.setData({
      groups: groups,
      pickedTeamsCount: pickedTeamsCount
    });
  },

  // 切换单个联赛选中
  toggleLeague: function (e) {
    var id = e.currentTarget.dataset.id;
    var list = this.data.leagueList.map(function (l) {
      if (l.id === id) l.on = !l.on;
      return l;
    });
    var picked = list.filter(function (l) { return l.on; }).length;
    this.setData({
      leagueList: list,
      pickedLeaguesCount: picked,
      allSelectedLeagues: picked === list.length
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  // 全选五大联赛
  selectAllLeagues: function () {
    var list = this.data.leagueList.map(function (l) {
      l.on = true;
      return l;
    });
    this.setData({
      leagueList: list,
      pickedLeaguesCount: list.length,
      allSelectedLeagues: true
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '已全选五大联赛', icon: 'none' });
  },

  // 清空联赛选择
  clearAllLeagues: function () {
    var list = this.data.leagueList.map(function (l) {
      l.on = false;
      return l;
    });
    this.setData({
      leagueList: list,
      pickedLeaguesCount: 0,
      allSelectedLeagues: false
    });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '已清空联赛选择', icon: 'none' });
  },

  // 进入 Step 2 选主队
  goStep2: function () {
    var picked = this.data.leagueList.filter(function (l) { return l.on; });
    if (!picked.length) {
      wx.showToast({ title: '请至少选择 1 个关注联赛', icon: 'none' });
      return;
    }
    var followedTeams = getApp().getFollowed() || [];
    this.buildTeamGroups(followedTeams);
    this.setData({ step: 2 });
    if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 100 });
  },

  // 返回 Step 1 选联赛
  goStep1: function () {
    this.setData({ step: 1 });
    if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 100 });
  },

  // 切换主队选中
  toggleTeam: function (e) {
    var gi = e.currentTarget.dataset.g, ti = e.currentTarget.dataset.t;
    var groups = this.data.groups;
    var t = groups[gi].teams[ti];
    t.on = !t.on;
    groups[gi].selectedCount = groups[gi].teams.filter(function (x) { return x.on; }).length;
    var picked = groups.reduce(function (n, g) { return n + g.selectedCount; }, 0);
    this.setData({ groups: groups, pickedTeamsCount: picked });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  // 快捷全选传统豪门
  selectGiantTeams: function () {
    var groups = this.data.groups;
    var picked = 0;
    groups.forEach(function (g) {
      g.teams.forEach(function (t) {
        if (GIANTS.indexOf(t.id) >= 0) t.on = true;
        if (t.on) picked++;
      });
      g.selectedCount = g.teams.filter(function (t) { return t.on; }).length;
    });
    this.setData({ groups: groups, pickedTeamsCount: picked });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '已选中欧洲传统豪门', icon: 'none' });
  },

  // 一键清空所有主队
  clearAllTeams: function () {
    var groups = this.data.groups;
    groups.forEach(function (g) {
      g.teams.forEach(function (t) { t.on = false; });
      g.selectedCount = 0;
    });
    this.setData({ groups: groups, pickedTeamsCount: 0 });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '已清空主队选择', icon: 'none' });
  },

  // 快捷切换单个联赛全选/清空
  toggleGroupAllTeams: function (e) {
    var gi = e.currentTarget.dataset.g;
    var groups = this.data.groups;
    var group = groups[gi];
    if (!group) return;
    var allSelected = group.teams.every(function (t) { return t.on; });
    var targetState = !allSelected;
    group.teams.forEach(function (t) { t.on = targetState; });
    group.selectedCount = targetState ? group.teams.length : 0;
    var picked = groups.reduce(function (n, g) { return n + g.selectedCount; }, 0);
    this.setData({ groups: groups, pickedTeamsCount: picked });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: targetState ? '已全选该联赛' : '已清空该联赛', icon: 'none' });
  },

  // 完成所有配置
  finish: function () {
    var app = getApp();
    // 1. 保存关注联赛
    var pickedLids = this.data.leagueList.filter(function (l) { return l.on; }).map(function (l) { return l.id; });
    if (!pickedLids.length) pickedLids = data.TOP_LEAGUE_IDS.slice();
    app.setFollowedLeagues(pickedLids);

    // 2. 保存关注主队
    var teamIds = [];
    this.data.groups.forEach(function (g) {
      g.teams.forEach(function (t) { if (t.on) teamIds.push(t.id); });
    });
    app.setFollowed(teamIds);

    // 3. 标记已完成引导
    try { wx.setStorageSync('onboarded', true); } catch (e) { }
    wx.switchTab({ url: '/pages/today/today' });
  },

  skip: function () {
    // 跳过：保存当前已点选的联赛和球队（若未点选则赋默认五大联赛）
    this.finish();
  }
});
