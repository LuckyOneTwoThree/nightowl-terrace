var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var cloud = require('../../utils/cloud.js');

// 云版本上线前的演示榜单（openGid 群维度排行 v1 接入；页面以 rankDemo 标识展示来源）
var MOCK = [
  { rank: 1, name: 'Kopite_99', hours: 12.5, streak: 5 },
  { rank: 2, name: 'NightWalker', hours: 10.0, streak: 3 },
  { rank: 3, name: '凌晨三点见', hours: 7.5, streak: 2 }
];

// 时间戳 → 北京所在周周一（设备时区无关，与云函数 readBoard.weekRange 口径一致）
function weekKeyOfTs(ts) {
  return engine.mondayOfWall(engine.bjDateStr(ts));
}

// 按夜猫口径「展示日」（YYYY-MM-DD，凌晨场已归前一晚）算归属周
function weekKeyOfDate(dateStr) {
  return engine.mondayOfWall(dateStr);
}

Page({
  data: {
    theme: '',
    stats: { n: 0, hours: '0.0', streak: 0, pct: 0 },
    live: null,        // 可打卡：开球后 30 分钟内的 S2+ 场
    preview: null,     // 今晚凌晨档预告
    checked: false,
    ranks: MOCK,
    rankDemo: true,    // 演示榜单标识（云端拉到真实数据后置 false）
    myRankNo: null,    // 我的排位（云端榜单按昵称匹配，待 openGid/uid 接入后精确化）
    myHours: '0.0',
    myStreak: 0,
    myNick: '夜猫子',
    worst: null
  },

  onShow: function () {
    getApp().applyTheme(this); this.refresh(); },

  // 云端夜猫榜（readBoard 聚合）；不可用则保留演示榜单
  fetchRanks: function () {
    var that = this;
    cloud.readBoard('owl')
      .then(function (res) {
        var list = (res && res.list) || [];
        if (!list.length) return;
        var myNick = (wx.getStorageSync('settings') || {}).nick || wx.getStorageSync('nickname') || '夜猫子';
        var myIdx = -1;
        var rows = list.map(function (r, i) {
          if (myIdx < 0 && r.nick === myNick) myIdx = i;
          return { rank: i + 1, name: r.nick, hours: r.hours, streak: r.streak || 0 };
        });
        that.setData({
          ranks: rows,
          rankDemo: false,
          myRankNo: myIdx >= 0 ? String(myIdx + 1) : null
        });
      })
      .catch(function () { /* 云不可用：静默回退演示榜单 */ });
  },

  refresh: function () {
    this.fetchRanks();
    var checkins = wx.getStorageSync('checkins') || {};
    var wk = engine.weekStartBJ(Date.now()).str;

    // 本周修仙统计（优先用打卡时记录的比赛归属周）
    var n = 0, mins = 0, worst = null; // worst = 最狠一夜（PM 9.5 战报要素）
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid];
      var w = c.wk || weekKeyOfTs(c.ts);
      if (w === wk) {
        n++; mins += c.cost * 60;
        if (!worst || c.cost > worst.cost) worst = c;
      }
    });
    var hours = Math.round(mins / 6) / 10;

    // 连续周数（北京周口径）
    var weeks = {};
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid];
      weeks[c.wk || weekKeyOfTs(c.ts)] = true;
    });
    var streak = 0, cursorTs = Date.now();
    while (weeks[engine.weekStartBJ(cursorTs).str]) { streak++; cursorTs -= 7 * 86400000; }

    // 可打卡场：开球后 30 分钟内、S2+
    var now = Date.now();
    var live = null, liveRaw = null, preview = null;
    data.matchesAll().forEach(function (m) {
      if (m.s < 2 || m.st === 'pp') return;
      var ts = engine.ts(m.t);
      if (!live && now >= ts && now <= ts + 30 * 60000 && !checkins[m.id]) { live = m; liveRaw = m; }
    });
    if (!live) {
      preview = data.matchesAll().filter(function (m) {
        return m.s >= 2 && m.st === 'sched' && engine.ts(m.t) > now;
      }).sort(function (a, b) { return engine.ts(a.t) - engine.ts(b.t); })[0] || null;
    }

    this.setData({
      stats: {
        n: n, hours: hours.toFixed(1), streak: streak,
        pct: Math.min(99, Math.round(hours * 10 + 30))
      },
      worst: worst ? { names: worst.names, cost: worst.cost } : null,
      live: live ? decorate.dec(live, null, { followed: getApp().getFollowed() }) : null,
      _liveRawT: liveRaw ? liveRaw.t : '',
      preview: preview ? decorate.dec(preview, null, { followed: getApp().getFollowed() }) : null,
      checked: live ? !!checkins[live.id] : false,
      myStreak: streak,
      myHours: hours.toFixed(1),
      myNick: (wx.getStorageSync('settings') || {}).nick || wx.getStorageSync('nickname') || '夜猫子'
    });
  },

  checkin: function () {
    var live = this.data.live;
    if (!live) return;
    var checkins = wx.getStorageSync('checkins') || {};
    if (checkins[live.id]) return;
    checkins[live.id] = {
      ts: Date.now(), md: live.md, names: live.home.zh + ' vs ' + live.away.zh, cost: live.cost,
      wk: this.data._liveRawT ? weekKeyOfDate(engine.owlDay(this.data._liveRawT)) : null
    };
    wx.setStorageSync('checkins', checkins);
    // 云端 best-effort 双写：夜猫榜聚合（readBoard/owl）
    cloud.addCheckin({
      m: live.id, md: live.md, names: live.home.zh + ' vs ' + live.away.zh,
      cost: live.cost, ts: checkins[live.id].ts
    });
    wx.showToast({ title: '修仙 +1 · ' + live.cost + 'h', icon: 'none' });
    this.refresh();
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  share: function () {
    var s = this.data.stats;
    var worst = this.data.worst ? '，最狠一夜 ' + this.data.worst.names + '（' + this.data.worst.cost + 'h）' : '';
    wx.setClipboardData({
      data: '【夜猫看台】本周我修仙 ' + s.n + ' 场 / ' + s.hours + 'h，连续 ' + s.streak + ' 周，击败了 ' + s.pct + '% 的球迷' + worst + '。今晚哪场值得熬？',
      success: function () { wx.showToast({ title: '战报已复制，去粘贴进群', icon: 'none' }); }
    });
  }
});
