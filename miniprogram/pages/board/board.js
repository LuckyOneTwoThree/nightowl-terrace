var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');

// 云版本上线前的演示榜单（openGid 群维度排行 v1 接入）
var MOCK = [
  { rank: 1, name: 'Kopite_99', hours: 12.5, streak: 5 },
  { rank: 2, name: 'NightWalker', hours: 10.0, streak: 3 },
  { rank: 3, name: '凌晨三点见', hours: 7.5, streak: 2 }
];

function weekKey(d) {
  var day = d.getDay(), diff = (day + 6) % 7; // 周一为一周起点
  var mon = new Date(d.getTime() - diff * 86400000);
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
}

Page({
  data: {
    stats: { n: 0, hours: '0.0', streak: 0, pct: 0 },
    live: null,        // 可打卡：开球后 30 分钟内的 S2+ 场
    preview: null,     // 今晚凌晨档预告
    checked: false,
    ranks: MOCK,
    myHours: 0,
    myStreak: 0
  },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var checkins = wx.getStorageSync('checkins') || {};
    var wk = weekKey(new Date());

    // 本周修仙统计
    var n = 0, mins = 0;
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid];
      if (weekKey(new Date(c.ts)) === wk) { n++; mins += c.cost * 60; }
    });
    var hours = Math.round(mins / 6) / 10;

    // 连续周数
    var weeks = {};
    Object.keys(checkins).forEach(function (mid) {
      weeks[weekKey(new Date(checkins[mid].ts))] = true;
    });
    var streak = 0, cursor = new Date();
    while (weeks[weekKey(cursor)]) { streak++; cursor = new Date(cursor.getTime() - 7 * 86400000); }

    // 可打卡场：开球后 30 分钟内、S2+
    var now = Date.now();
    var live = null, preview = null;
    var today = data.matchesAll().filter(function (m) {
      var ts = engine.ts(m.t);
      return m.s >= 2 && m.st !== 'pp';
    });
    today.forEach(function (m) {
      var ts = engine.ts(m.t);
      if (!live && now >= ts && now <= ts + 30 * 60000 && !checkins[m.id]) live = m;
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
      live: live ? decorate.dec(live, null, { followed: getApp().getFollowed() }) : null,
      preview: preview ? decorate.dec(preview, null, { followed: getApp().getFollowed() }) : null,
      checked: live ? !!checkins[live.id] : false,
      myHours: hours,
      myStreak: streak
    });
  },

  checkin: function () {
    var live = this.data.live;
    if (!live) return;
    var checkins = wx.getStorageSync('checkins') || {};
    if (checkins[live.id]) return;
    checkins[live.id] = {
      ts: Date.now(), md: live.md, names: live.home.zh + ' vs ' + live.away.zh, cost: live.cost
    };
    wx.setStorageSync('checkins', checkins);
    wx.showToast({ title: '修仙 +1 · ' + live.cost + 'h', icon: 'none' });
    this.refresh();
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  share: function () {
    var s = this.data.stats;
    wx.setClipboardData({
      data: '【夜猫看台】本周我修仙 ' + s.n + ' 场 / ' + s.hours + 'h，连续 ' + s.streak + ' 周，击败了 ' + s.pct + '% 的球迷。今晚哪场值得熬？',
      success: function () { wx.showToast({ title: '战报已复制，去粘贴进群', icon: 'none' }); }
    });
  }
});
