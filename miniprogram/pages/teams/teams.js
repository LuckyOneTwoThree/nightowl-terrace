var data = require('../../utils/data.js');

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: {
    theme: '',
    groups: [],
    draftFollowed: [],
    pickedCount: 0
  },

  onLoad: function () {
    var followed = getApp().getFollowed() || [];
    this.setData({
      draftFollowed: followed.slice(),
      pickedCount: followed.length
    });
    this.buildGroups(followed);
  },

  buildGroups: function (draftList) {
    var prevExpanded = {};
    (this.data.groups || []).forEach(function (g) {
      prevExpanded[g.id] = g.expanded;
    });

    var groups = ['PL', 'PD', 'SA', 'BL', 'FL'].map(function (lg, idx) {
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
      return {
        id: lg,
        zh: lgZh(lg),
        accent: meta.accent || '#FFB224',
        teams: teams,
        selectedCount: selectedCount,
        expanded: prevExpanded[lg] !== undefined ? prevExpanded[lg] : (idx === 0)
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
  },

  save: function () {
    getApp().setFollowed(this.data.draftFollowed);
    wx.showToast({ title: '关注已更新', icon: 'success' });
    setTimeout(function () {
      wx.navigateBack();
    }, 400);
  }
});
