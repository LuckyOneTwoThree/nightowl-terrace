var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');

// 演示榜单数据备用（云端无数据或无网络时回退）
var MOCK_OWL = [
  { rank: 1, name: 'Kopite_99', val: '12.5h', sub: '连续 5 周' },
  { rank: 2, name: 'NightWalker', val: '10.0h', sub: '连续 3 周' },
  { rank: 3, name: '凌晨三点见', val: '7.5h', sub: '连续 2 周' }
];

var MOCK_GUESS = [
  { rank: 1, name: '预言家阿森纳', val: '18 分', sub: '83% 命中' },
  { rank: 2, name: '球场诸葛', val: '15 分', sub: '71% 命中' },
  { rank: 3, name: '夜猫毒奶王', val: '12 分', sub: '60% 命中' }
];

var MOCK_SEASON = [
  { rank: 1, name: '预言家阿森纳', val: '142 分', sub: '本季命中 48 场' },
  { rank: 2, name: '伯纳乌守夜人', val: '128 分', sub: '本季命中 42 场' },
  { rank: 3, name: '圣西罗不眠夜', val: '115 分', sub: '本季命中 39 场' }
];

function weekKeyOfTs(ts) {
  return engine.mondayOfWall(engine.bjDateStr(ts));
}

function weekKeyOfDate(dateStr) {
  return engine.mondayOfWall(dateStr);
}

Page({
  data: {
    theme: data.getInitTheme(),
    curTab: 'season', // 'season' | 'guess' | 'owl'
    tabList: [
      { id: 'season', zh: '🏆 赛季总榜' },
      { id: 'guess', zh: '🔮 盲评周榜' },
      { id: 'owl', zh: '🌙 夜猫修仙榜' }
    ],
    stats: { n: 0, hours: '0.0', streak: 0, pct: 0 },
    live: null,
    preview: null,
    checked: false,
    ranks: [],
    rankDemo: true,
    myRankNo: null,
    myVal: '',
    mySub: '',
    myNick: '夜猫子',
    worst: null
  },

  onLoad: function (options) {
    if (options && options.tab) {
      this.setData({ curTab: options.tab });
    }
  },

  onShow: function () {
    getApp().applyTheme(this);
    this.refresh();
  },

  onSwitchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (this.data.curTab === tab) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ curTab: tab });
    this.fetchRanks();
  },

  /**
   * 收集用户多维度战绩数据（赛季总计、盲评周计、修仙肝度）
   */
  getUserStats: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var recMap = data.getRecMap();
    var nowWk = engine.weekStartBJ(Date.now()).str;

    var seasonPts = 0, seasonHit = 0, seasonSettled = 0, seasonTotal = 0;
    var weekPts = 0, weekHit = 0, weekSettled = 0, weekTotal = 0;

    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid];
      var mm = data.getMatch(mid);
      if (!mm || !crypt.verify(p)) return;
      seasonTotal++;

      // 判断比赛所属周
      var matchWk = engine.mondayOfWall(engine.owlDay(mm.t));
      var isCurWeek = (matchWk === nowWk);
      if (isCurWeek) weekTotal++;

      var r = engine.settlePred(p, mm, recMap);
      if (r) {
        seasonSettled++;
        seasonPts += r.pts;
        if (r.pts > 0) seasonHit++;

        if (isCurWeek) {
          weekSettled++;
          weekPts += r.pts;
          if (r.pts > 0) weekHit++;
        }
      }
    });

    var seasonRate = seasonSettled > 0 ? Math.round(seasonHit / seasonSettled * 100) : 0;
    var weekRate = weekSettled > 0 ? Math.round(weekHit / weekSettled * 100) : 0;

    return {
      seasonPts: seasonPts,
      seasonHit: seasonHit,
      seasonSettled: seasonSettled,
      seasonTotal: seasonTotal,
      seasonRate: seasonRate,

      weekPts: weekPts,
      weekHit: weekHit,
      weekSettled: weekSettled,
      weekTotal: weekTotal,
      weekRate: weekRate
    };
  },

  /**
   * 按当前选中的 Tab 拉取排行榜并更新自身战绩
   */
  fetchRanks: function () {
    var that = this;
    var tab = this.data.curTab;
    var myNick = (wx.getStorageSync('settings') || {}).nick || wx.getStorageSync('nickname') || '夜猫子';
    var uStats = this.getUserStats();
    var s = this.data.stats || {};

    if (tab === 'season') {
      // 1. 🏆 赛季总积分榜
      var mySubText = uStats.seasonTotal > 0 
        ? ('已测 ' + uStats.seasonTotal + ' 场 · 命中 ' + uStats.seasonHit + ' 场 (' + uStats.seasonRate + '%)')
        : '暂无赛季预测记录';

      cloud.readBoard('season')
        .then(function (res) {
          var list = (res && res.list) || [];
          if (!list.length) throw new Error('empty');
          var myIdx = -1;
          var rows = list.map(function (r, i) {
            if (myIdx < 0 && r.nick === myNick) myIdx = i;
            return { rank: i + 1, name: r.nick, val: (r.pts || 0) + ' 分', sub: '赛季总积分' };
          });
          that.setData({
            ranks: rows,
            rankDemo: false,
            myRankNo: myIdx >= 0 ? String(myIdx + 1) : '-',
            myVal: uStats.seasonPts + ' 分',
            mySub: mySubText
          });
        })
        .catch(function () {
          that.setData({
            ranks: MOCK_SEASON,
            rankDemo: true,
            myRankNo: '-',
            myVal: uStats.seasonPts + ' 分',
            mySub: mySubText
          });
        });

    } else if (tab === 'guess') {
      // 2. 🔮 盲评周榜
      var mySubGuess = uStats.weekTotal > 0
        ? ('本周盲评 ' + uStats.weekTotal + ' 场 · 命中 ' + uStats.weekHit + ' 场 (' + uStats.weekRate + '%)')
        : '本周尚未参与盲评';

      var week = engine.weekStartBJ(Date.now()).str;
      cloud.readBoard('guess', 'default', week)
        .then(function (res) {
          var list = (res && res.list) || [];
          if (!list.length) throw new Error('empty');
          var myIdx = -1;
          var rows = list.map(function (r, i) {
            if (myIdx < 0 && r.nick === myNick) myIdx = i;
            var rate = r.hit != null && r.count ? Math.round(r.hit / r.count * 100) + '% 命中' : '';
            return { rank: i + 1, name: r.nick, val: (r.pts || 0) + ' 分', sub: rate || '本周盲评' };
          });
          that.setData({
            ranks: rows,
            rankDemo: false,
            myRankNo: myIdx >= 0 ? String(myIdx + 1) : '-',
            myVal: uStats.weekPts + ' 分',
            mySub: mySubGuess
          });
        })
        .catch(function () {
          that.setData({
            ranks: MOCK_GUESS,
            rankDemo: true,
            myRankNo: '-',
            myVal: uStats.weekPts + ' 分',
            mySub: mySubGuess
          });
        });

    } else {
      // 3. 🌙 夜猫修仙打卡榜
      var mySubOwl = '本周修仙 ' + s.n + ' 场 · 连熬 ' + s.streak + ' 周 (击败 ' + s.pct + '% 球迷)';

      cloud.readBoard('owl')
        .then(function (res) {
          var list = (res && res.list) || [];
          if (!list.length) throw new Error('empty');
          var myIdx = -1;
          var rows = list.map(function (r, i) {
            if (myIdx < 0 && r.nick === myNick) myIdx = i;
            return { rank: i + 1, name: r.nick, val: (r.hours || 0) + 'h', sub: '连续 ' + (r.streak || 0) + ' 周' };
          });
          that.setData({
            ranks: rows,
            rankDemo: false,
            myRankNo: myIdx >= 0 ? String(myIdx + 1) : '-',
            myVal: s.hours + 'h',
            mySub: mySubOwl
          });
        })
        .catch(function () {
          that.setData({
            ranks: MOCK_OWL,
            rankDemo: true,
            myRankNo: '-',
            myVal: s.hours + 'h',
            mySub: mySubOwl
          });
        });
    }
  },

  refresh: function () {
    var checkins = wx.getStorageSync('checkins') || {};
    var wk = engine.weekStartBJ(Date.now()).str;

    var n = 0, mins = 0, worst = null;
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid];
      var w = c.wk || weekKeyOfTs(c.ts);
      if (w === wk) {
        n++; mins += c.cost * 60;
        if (!worst || c.cost > worst.cost) worst = c;
      }
    });
    var hours = Math.round(mins / 6) / 10;

    var weeks = {};
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid];
      weeks[c.wk || weekKeyOfTs(c.ts)] = true;
    });
    var streak = 0, cursorTs = Date.now();
    while (weeks[engine.weekStartBJ(cursorTs).str]) { streak++; cursorTs -= 7 * 86400000; }

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
      myNick: (wx.getStorageSync('settings') || {}).nick || wx.getStorageSync('nickname') || '夜猫子'
    });

    this.fetchRanks();
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
    cloud.addCheckin({
      m: live.id, md: live.md, names: live.home.zh + ' vs ' + live.away.zh,
      cost: live.cost, ts: checkins[live.id].ts
    });
    wx.showToast({ title: '打卡成功 · +' + live.cost + 'h', icon: 'success' });
    this.refresh();
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  onShareAppMessage: function () {
    var tab = this.data.curTab;
    var uStats = this.getUserStats();
    var s = this.data.stats || {};
    var title = '';

    if (tab === 'season') {
      title = uStats.seasonPts > 0 
        ? ('【赛季总榜】我已斩获 ' + uStats.seasonPts + ' 积分（命中 ' + uStats.seasonHit + ' 场），谁能在群里超越我？')
        : '【赛季总榜】谁是本赛季第一预言家？快来微信群榜一较高下！';
    } else if (tab === 'guess') {
      title = uStats.weekTotal > 0
        ? ('【盲评周榜】本周我盲评 ' + uStats.weekTotal + ' 场（命中率 ' + uStats.weekRate + '%），快来看看我的神级预测！')
        : '【盲评周榜】本周五大联赛焦点战盲评大战打响，快来一起猜比分！';
    } else {
      title = Number(s.hours) > 0
        ? ('【夜猫修仙榜】本周我已修仙 ' + s.hours + ' 小时，连熬 ' + s.streak + ' 周！今晚谁陪我看球？')
        : '【夜猫修仙榜】今晚哪场值得熬？夜猫看台群友修仙肝度榜打卡！';
    }

    return {
      title: title,
      path: '/pages/board/board?tab=' + tab
    };
  },

  share: function () {
    var tab = this.data.curTab;
    var uStats = this.getUserStats();
    var s = this.data.stats || {};
    var text = '';

    if (tab === 'season') {
      // 1. 🏆 赛季总榜专属战报
      if (uStats.seasonTotal > 0) {
        var rankInfo = (this.data.myRankNo && this.data.myRankNo !== '-') ? ('，全网排位第 ' + this.data.myRankNo + ' 名') : '';
        text = '【夜猫看台 · 赛季风云榜】本赛季我累计预言 ' + uStats.seasonTotal + ' 场，命中 ' + uStats.seasonHit + ' 场（命中率 ' + uStats.seasonRate + '%），斩获 ' + uStats.seasonPts + ' 积分' + rankInfo + '！谁能在群里超越我？';
      } else {
        text = '【夜猫看台 · 赛季风云榜】2026/27 赛季五大联赛神预测已全面打响！群友谁是第一预言家？快来微信群一较高下！';
      }
    } else if (tab === 'guess') {
      // 2. 🔮 盲评周榜专属战报
      if (uStats.weekTotal > 0) {
        var rankInfo = (this.data.myRankNo && this.data.myRankNo !== '-') ? ('，当前周榜第 ' + this.data.myRankNo + ' 名') : '';
        text = '【夜猫看台 · 盲评周榜】本周焦点大战我已盲评 ' + uStats.weekTotal + ' 场，命中 ' + uStats.weekHit + ' 场（命中率 ' + uStats.weekRate + '%），斩获 ' + uStats.weekPts + ' 周积分' + rankInfo + '！谁来破我的预言？';
      } else {
        text = '【夜猫看台 · 盲评周榜】本周五大联赛焦点大战开启盲评！3秒选比分、比拼命中率，快来看看谁是本周预言帝！';
      }
    } else {
      // 3. 🌙 夜猫修仙榜专属战报
      var worst = this.data.worst ? '，最狠一夜 ' + this.data.worst.names + '（' + this.data.worst.cost + 'h）' : '';
      text = '【夜猫看台 · 修仙肝度榜】本周我修仙 ' + s.n + ' 场 / ' + s.hours + 'h，连续 ' + s.streak + ' 周，击败了 ' + s.pct + '% 的球迷' + worst + '。今晚哪场值得熬？';
    }

    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '专属战报已复制，去群里粘贴', icon: 'none' });
      }
    });
  }
});

