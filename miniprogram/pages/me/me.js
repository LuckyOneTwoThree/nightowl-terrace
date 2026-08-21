var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var crypt = require('../../utils/crypt.js');
var cloud = require('../../utils/cloud.js');
var router = require('../../utils/router.js');

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

Page({
  data: {
    theme: data.getInitTheme(),
    nickname: '',
    followedLeagues: [],
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

    var that = this;
    this._onScoresUpdated = function () {
      that.refresh();
    };
    data.onScoresUpdated(this._onScoresUpdated);
  },

  onShow: function () {
    getApp().applyTheme(this);
    this.refresh();
  },

  onPullDownRefresh: function () {
    var that = this;
    data.pullRefresh(function () { that.refresh(); });
  },

  onUnload: function () {
    if (this._onScoresUpdated) {
      data.offScoresUpdated(this._onScoresUpdated);
      this._onScoresUpdated = null;
    }
  },

  refresh: function () {
    var settings = wx.getStorageSync('settings') || {};
    var followed = getApp().getFollowed() || [];
    var rawLeagues = getApp().getFollowedLeagues() || data.TOP_LEAGUE_IDS;
    var preds = wx.getStorageSync('predictions') || {};
    var checkins = wx.getStorageSync('checkins') || {};
    this._lastFp = JSON.stringify({ f: followed, fl: rawLeagues, p: Object.keys(preds).length, c: Object.keys(checkins).length, s: settings.nick });
    var nickname = settings.nick || wx.getStorageSync('nickname');
    if (!nickname) {
      nickname = '夜猫_' + Math.floor(1000 + Math.random() * 9000);
      wx.setStorageSync('nickname', nickname);
    }

    // 打卡时长与预测命中率
    var mins = 0;
    Object.keys(checkins).forEach(function (k) { mins += (checkins[k].cost || 0) * 60; });
    var hours = (Math.round(mins / 6) / 10) + 'h';
    // 有效预测统一入口（三轮 P1-4）：封存校验 + 开球后作废，一处判据两处消费，
    // 修复命中率与赛季积分口径双标（作废封存不再计入积分）
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    var validPreds = [];
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid];
      var m = data.getMatch(mid);
      if (!m || !p || !crypt.verify(p)) return;
      var kickTs = engine.ts(m.t);
      if (p.ts && !isNaN(kickTs) && p.ts > kickTs + 60000) return; // 开球后封存作废
      validPreds.push({ p: p, m: m });
    });
    var hit = 0, total = 0, seasonPts = 0;
    validPreds.forEach(function (v) {
      var r = engine.settlePred(v.p, v.m, recMap);
      if (r) { total++; seasonPts += r.pts; if (r.hit) hit++; }
    });

    // 已关注联赛完整信息列表
    var followedLeagues = rawLeagues.map(function (lid) {
      var info = data.LEAGUE_INFO[lid] || {};
      var meta = data.LEAGUE_META[lid] || {};
      return {
        id: lid,
        zh: info.zh || lid,
        en: info.en || '',
        solid: meta.solid || '#7C3AED',
        accent: meta.accent || '#38003C',
        tagline: info.tagline || ''
      };
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

    // 我的关注 · 主队赛程列表（未来 14 天内主队所有赛事）
    var start = engine.bjDateStr(Date.now());
    var end = engine.bjDateStr(Date.now() + 14 * 86400000);
    var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    var nowTs = Date.now();
    var myWeek = data.matchesAll().filter(function (m) {
      var d = m.t.split('T')[0];
      return d >= start && d <= end && (followed.indexOf(m.h) >= 0 || followed.indexOf(m.a) >= 0);
    }).sort(function (x, y) { return x.t < y.t ? -1 : 1; }).map(function (m) {
      var f = m.t.split('T');
      var dd = new Date(f[0].replace(/-/g, '/') + ' 00:00:00');
      var h = data.getTeam(m.h);
      var a = data.getTeam(m.a);
      var ev = engine.evaluate(m, recMap, rivs, sls, followed, rawLeagues);
      var tier = engine.tierOf(m);
      var matchTs = engine.ts(m.t);
      var countdownText = '';
      if (m.st === 'done') {
        countdownText = '已完赛';
      } else if (matchTs <= nowTs) {
        countdownText = '正在进行';
      } else {
        var cd = engine.countdown(matchTs, nowTs);
        countdownText = cd.d > 0 ? ('距开球 ' + cd.d + '天' + cd.h + 'h') : ('距开球 ' + cd.h + '小时' + cd.m + '分');
      }

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
        tbd: !!m.tbd,
        cdText: countdownText
      };
    });

    var hoursNum = parseFloat(hours) || 0;
    
    var LEVELS = [
      { lv: 1, title: '新晋球客', icon: '🌱', reqHours: 0, reqPts: 0, perk: '观赛通票初始建档与焦点推荐' },
      { lv: 2, title: '熬夜死忠', icon: '🌙', reqHours: 2, reqPts: 10, perk: '解锁 1X2 盲评预测与哈希封存' },
      { lv: 3, title: '看台老炮', icon: '⚡', reqHours: 5, reqPts: 30, perk: '解锁主队专属赛程一键导入系统日历' },
      { lv: 4, title: '预言大师', icon: '🔮', reqHours: 10, reqPts: 60, perk: '解锁德比法庭辩护与狂言认证徽章' },
      { lv: 5, title: '战术宗师', icon: '👑', reqHours: 20, reqPts: 100, perk: '解锁冷门预警专属加成与深度战报' },
      { lv: 6, title: '铁血名宿', icon: '🐐', reqHours: 35, reqPts: 150, perk: '全服赛季天梯总榜尊享黑金专属光环' }
    ];

    var that = this;
    var cachedCloudPts = wx.getStorageSync('cached_cloud_pts') || 0;
    seasonPts = Math.max(seasonPts, cachedCloudPts);

    var curLevel = LEVELS[0];
    var nextLevel = LEVELS[1];
    for (var i = LEVELS.length - 1; i >= 0; i--) {
      if (hoursNum >= LEVELS[i].reqHours || seasonPts >= LEVELS[i].reqPts) {
        curLevel = LEVELS[i];
        nextLevel = LEVELS[i + 1] || null;
        break;
      }
    }

    var progressPct = 100;
    if (nextLevel) {
      var prevPts = curLevel.reqPts || 0;
      var spanPts = nextLevel.reqPts - prevPts;
      var ptsPct = spanPts > 0 ? ((seasonPts - prevPts) / spanPts) * 100 : 0;
      var prevHours = curLevel.reqHours || 0;
      var spanHours = nextLevel.reqHours - prevHours;
      var hourPct = spanHours > 0 ? ((hoursNum - prevHours) / spanHours) * 100 : 0;
      progressPct = Math.min(99, Math.max(5, Math.round(Math.max(hourPct, ptsPct))));
    }

    var levelZh = 'Lv.' + curLevel.lv + ' ' + curLevel.title;
    var mid = settings.mid || 'MID-' + Math.abs(nickname.split('').reduce(function(a,b){return (a<<5)-a+b.charCodeAt(0);},0)).toString(16).toUpperCase().slice(0, 6);

    var primaryGlow = followedTeams.length > 0 ? followedTeams[0].color : '#FFB800';

    this.setData({
      nickname: nickname,
      mid: mid,
      levelZh: levelZh,
      curLevel: curLevel,
      nextLevel: nextLevel,
      progressPct: progressPct,
      levelsList: LEVELS,
      showLevelModal: false,
      seasonPts: seasonPts,
      primaryGlow: primaryGlow,
      followedLeagues: followedLeagues,
      followedTeams: followedTeams,
      followedIds: followed,
      myWeek: myWeek,
      stats: { hours: hours, preds: Object.keys(preds).length, hit: total ? Math.round(hit * 100 / total) + '%' : '—', seasonPts: seasonPts }
    });

    // 异步拉取云端结算口径的赛季积分（readBoard profile 按 OPENID 精确读本人 users 文档，
    // 四轮 P1-3：不再 where({}) 碰运气读到别人的积分），并回推偏好画像（不含积分/等级，四轮 P2-5）
    cloud.readBoard('profile').then(function (res) {
      var prof = (res && res.profile) || null;
      if (prof && prof.seasonPts != null && prof.seasonPts !== cachedCloudPts) {
        wx.setStorageSync('cached_cloud_pts', prof.seasonPts);
        that.refresh();
        return;
      }
      // 同步最新全景画像回云端 users 集合（段位、积分、时长、主队一次性全量落库）
      cloud.syncUser({
        nick: nickname,
        level: curLevel.lv,
        levelTitle: curLevel.title,
        seasonPts: seasonPts,
        hours: hours,
        totalPreds: Object.keys(preds).length,
        hitCount: total ? hit : 0,
        followed: followed,
        followedLeagues: rawLeagues
      });
    }).catch(function () {});
  },

  onShowLevelModal: function () {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ showLevelModal: true });
  },

  onCloseLevelModal: function () {
    this.setData({ showLevelModal: false });
  },

  toggleExpandMatches: function () {
    this.setData({ expandMatches: !this.data.expandMatches });
  },

  goManagePreferences: function (e) {
    var tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'leagues';
    router.navTo('/pages/teams/teams?tab=' + tab);
  },

  goManageLeagues: function () {
    router.navTo('/pages/teams/teams?tab=leagues');
  },

  goManageTeams: function () {
    router.navTo('/pages/teams/teams?tab=teams');
  },

  goAllSchedule: function () {
    wx.switchTab({ url: '/pages/schedule/schedule' });
  },

  onExportMyWeekCal: function () {
    var raws = (this.data.myWeek || []).filter(function (m) { return !m.tbd && m.st === 'sched'; });
    if (!raws.length) {
      wx.showToast({ title: '本周暂无可导出的未赛赛程', icon: 'none' });
      return;
    }
    var events = raws.map(function (m) {
      var rawMatch = data.getMatch(m.id);
      var timeStr = rawMatch ? rawMatch.t : (engine.bjDateStr(Date.now()) + 'T' + m.hm);
      return {
        t: timeStr,
        title: '⚽ ' + m.home.zh + ' vs ' + m.away.zh + ' · ' + m.lgZh,
        desc: '熬夜 ' + m.cost + 'h · 夜猫追球专属主队提醒',
        alarmMin: 30
      };
    });
    ics.share(events, '夜猫追球-主队本周赛程', function (ok, msg) {
      wx.showToast({ title: ok ? '已导出 ' + events.length + ' 场主队赛程' : (msg || '导出已取消'), icon: 'none' });
    });
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
    router.navTo('/pages/settings/settings');
  },

  onMenu: function (e) {
    var id = e.currentTarget.dataset.id;
    var urls = {
      preds: '/pages/records/records',
      boasts: '/pages/court/court?tab=dossier',
      checkins: '/pages/board/board',
      subs: '/pages/settings/settings',
      settings: '/pages/settings/settings'
    };
    if (urls[id]) router.navTo(urls[id]);
  },

  goMatch: function (e) {
    router.navTo('/pages/detail/detail?id=' + e.currentTarget.dataset.id);
  }
});



