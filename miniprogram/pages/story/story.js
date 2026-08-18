var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');

var TYPE_ZH = {
  title: '争冠线', league: '联赛格局', relegation: '保级线',
  data: '数据榜', suspense: '悬念局', background: '背景板'
};

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: {
    theme: '',
    s: null,        // 故事线本体
    typeZh: '',
    leagueZh: '',
    seasonText: '2026/27 赛季',
    avatars: [],    // 涉及球队（前 3）
    statusZh: '进行中',
    nodes: [],      // 时间轴节点
    related: []     // 相关故事线
  },

  onLoad: function (q) {
    var s = data.getAllStorylines().filter(function (x) { return x.id === q.id; })[0];
    if (!s) {
      wx.showToast({ title: '故事线不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }

    var now = Date.now();
    var keySet = {};
    (s.keyNodes || []).forEach(function (id) { keySet[id] = true; });

    var nodes = (s.nodes || []).map(function (mid) {
      var m = data.getMatch(mid);
      if (!m) return null;
      var d = decorate.dec(m, null, { followed: getApp().getFollowed() });
      var ts = engine.ts(m.t);
      d.ts = ts; // 按开球时间排序（id 含轮次，字典序不可靠）
      // 日期圆拆分：n-mon='8月' / n-day='22'
      var mp = d.md.split('月');
      d.mon = mp[0] + '月';
      d.day = (mp[1] || '').replace('日', '');
      d.isKey = !!keySet[mid];
      if (d.finished) d.state = 'done';
      else if (ts - now < 3 * 86400000) d.state = 'soon';
      else d.state = 'future';
      d.cdText = '';
      if (d.state === 'soon') {
        var c = engine.countdown(ts, now);
        d.cdText = c.d > 0 ? '距开球 ' + c.d + '天' + c.h + '小时' : '距开球 ' + c.h + '小时' + c.m + '分';
      }
      return d;
    }).filter(Boolean).sort(function (a, b) { return a.ts - b.ts; });

    // 首个节点的联赛作为故事线联赛
    var lgZh = nodes.length ? nodes[0].lgZh : '';

    // 相关故事线：同队或有共同场次的其他活跃线
    var nodeSet = {};
    (s.nodes || []).forEach(function (id) { nodeSet[id] = true; });
    var related = data.getStorylines().filter(function (x) {
      if (x.id === s.id) return false;
      var shareNode = (x.nodes || []).some(function (id) { return nodeSet[id]; });
      var shareTeam = (x.teams || []).some(function (t) { return (s.teams || []).indexOf(t) >= 0; });
      return shareNode || shareTeam;
    }).map(function (x) { return { id: x.id, name: x.name, desc: x.desc }; });

    this.setData({
      s: s,
      typeZh: TYPE_ZH[s.type] || '故事线',
      leagueZh: lgZh,
      avatars: (s.teams || []).slice(0, 3).map(function (t) {
        var tm = data.getTeam(t);
        return {
          id: tm.id, zh: tm.zh, logo: tm.logo, color: tm.color,
          bg: data.tint(tm.color, .2), bd: data.tint(tm.color, .35)
        };
      }),
      statusZh: s.status === 'active' ? '进行中' : s.status === 'done' ? '已完结' : '筹备中',
      nodes: nodes,
      related: related
    });
  },

  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  goStory: function (e) {
    wx.redirectTo({ url: '/pages/story/story?id=' + e.currentTarget.dataset.id });
  },

  share: function () {
    var s = this.data.s;
    wx.setClipboardData({
      data: '【夜猫看台 · 故事线】' + s.name + '：' + s.desc + '。一起追剧 →',
      success: function () { wx.showToast({ title: '已复制分享文案', icon: 'none' }); }
    });
  }
});
