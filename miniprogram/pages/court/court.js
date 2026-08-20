var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var cloud = require('../../utils/cloud.js');

var QUICK_TAGS = ['🔥 零封拿下', '💥 狂轰三球', '🛡️ 死守到底', '🎯 绝杀登顶', '🐐 封神之战', '🤡 坐等翻车'];

// 德比对决拟真发言库（按主客中立生成生动辩论流，保障离线与冷启动氛围）
function genMockDebates(m) {
  if (!m) return [];
  var h = m.home ? m.home.zh : '主队';
  var a = m.away ? m.away.zh : '客队';
  var ts = engine.ts(m.t);
  var base = [
    {
      _id: 'mock_h1_' + m.id,
      m: m.id,
      nick: h + '死忠老王',
      camp: 'home',
      text: '今晚' + h + '在主场必须教做人，稳赢拿下！不进两球算我输！🔥',
      ts: ts - 7200000,
      timeStr: '2小时前',
      likes: 18,
      flags: 2,
      milks: 1,
      result: m.finished ? (m.sc && parseInt(m.sc) > parseInt(m.sc.split('-')[1]) ? 'hit' : 'miss') : null,
      isMe: false
    },
    {
      _id: 'mock_a1_' + m.id,
      m: m.id,
      nick: a + '远征军阿飞',
      camp: 'away',
      text: '就这后防线？' + a + '今晚必反击打穿！坐等打脸！⚡',
      ts: ts - 5400000,
      timeStr: '1小时前',
      likes: 14,
      flags: 7,
      milks: 3,
      result: m.finished ? (m.sc && parseInt(m.sc.split('-')[1]) > parseInt(m.sc) ? 'hit' : 'miss') : null,
      isMe: false
    },
    {
      _id: 'mock_n1_' + m.id,
      m: m.id,
      nick: '中立熬夜老猫',
      camp: 'neutral',
      text: '两边状态都拉满了，今晚至少大开大合进4球，准备好咖啡看戏！🍿',
      ts: ts - 3600000,
      timeStr: '45分钟前',
      likes: 9,
      flags: 1,
      milks: 6,
      result: null,
      isMe: false
    },
    {
      _id: 'mock_h2_' + m.id,
      m: m.id,
      nick: h + '铁杆粉丝',
      camp: 'home',
      text: '德比战看的就是血性，零封对手带走三分，谁不服来辩！🛡️',
      ts: ts - 1800000,
      timeStr: '20分钟前',
      likes: 12,
      flags: 3,
      milks: 0,
      result: null,
      isMe: false
    }
  ];
  return base;
}

Page({
  data: {
    theme: data.getInitTheme(),
    mainTab: 'court', // 'court' (德比论战) | 'dossier' (判例卷宗)
    showPickerModal: false,
    showDrawer: false,
    showRuleModal: false,
    hasBoasted: false,
    pickerFilter: 'recent',
    pickerTabs: [
      { id: 'recent', zh: '🔥 正在开庭' },
      { id: 'season', zh: '📅 全季德比' },
      { id: 'done', zh: '⚖️ 往期结案' }
    ],
    displayCands: [],
    cands: [],
    open: null,
    openId: '',
    myCamp: 'home', // 'home' | 'away' | 'neutral'
    campRatio: {
      homePct: 50,
      awayPct: 50,
      homeCount: 0,
      awayCount: 0,
      total: 0
    },
    text: '',
    count: 0,
    quickTags: QUICK_TAGS,
    debates: [],
    displayDebates: [],
    debateTab: 'all',
    debateTabs: [
      { id: 'all', zh: '全部呈堂' },
      { id: 'home', zh: '主队派' },
      { id: 'away', zh: '客队派' },
      { id: 'hot', zh: '🔥 热评榜' }
    ],
    stats: { hit: 0, miss: 0, rate: '--', total: 0 },
    archive: [],
    displayArchive: [],
    archiveTab: 'all',
    archiveTabs: [
      { id: 'all', zh: '全部' },
      { id: 'pending', zh: '审理中' },
      { id: 'hit', zh: '已应验' },
      { id: 'miss', zh: '翻车打脸' }
    ],
    hallOfFame: {
      topAccuracy: { nick: '夜猫预言家', rate: '82%', hits: 14 },
      topStubborn: { nick: '铁嘴嘴硬王', misses: 9 }
    }
  },

  onLoad: function (q) {
    getApp().applyTheme(this);
    this._focusId = q && q.id ? q.id : '';
    var initTab = (q && q.tab === 'dossier') ? 'dossier' : 'court';
    this.setData({ mainTab: initTab });
    this.refresh();
  },

  onShow: function () {
    getApp().applyTheme(this);
    var boasts = wx.getStorageSync('boasts') || {};
    var fp = Object.keys(boasts).length + '_' + (this._focusId || '');
    if (this._lastFp !== fp) {
      this._lastFp = fp;
      this.refresh();
    }
  },

  refresh: function () {
    var that = this;
    var boasts = wx.getStorageSync('boasts') || {};
    this._lastFp = Object.keys(boasts).length + '_' + (this._focusId || '');
    var recMap = data.getRecMap();
    var rivs = data.getRivalries();
    var sls = data.getStorylines();
    var followed = getApp().getFollowed() || [];
    var followedLeagues = getApp().getFollowedLeagues() || data.TOP_LEAGUE_IDS;
    var now = Date.now();

    // 候选开庭场次：全季 1753 场中筛选出所有星级 >= 3 或焦点德比大战 (共约 54 场)
    var allMatches = data.matchesAll();
    var cands = allMatches.filter(function (m) {
      if (m.tbd) return false;
      var ev = engine.evaluate(m, recMap, rivs, sls, followed, followedLeagues);
      return ev.star >= 3 || !!ev.rivalry;
    }).sort(function (a, b) {
      var aFin = a.st === 'done' ? 1 : 0;
      var bFin = b.st === 'done' ? 1 : 0;
      if (aFin !== bFin) return aFin - bFin;
      return engine.ts(a.t) - engine.ts(b.t);
    }).map(function (m) {
      return decorate.dec(m, null, { followed: followed, followedLeagues: followedLeagues });
    });

    if (!cands.length) {
      cands = allMatches.slice(0, 5).map(function (m) {
        return decorate.dec(m, null, { followed: followed, followedLeagues: followedLeagues });
      });
    }

    var pick = null;
    if (this._focusId) {
      pick = cands.find(function (c) { return c.id === that._focusId; }) || data.getMatch(this._focusId);
      if (pick && !pick.home) {
        pick = decorate.dec(pick, null, { followed: followed, followedLeagues: followedLeagues });
      }
    }
    if (!pick && cands.length) {
      // 优先选中尚未完赛的第一场德比
      pick = cands.find(function (c) { return c.st !== 'done'; }) || cands[0];
    }

    // 个人档案统计
    var archive = [];
    var hit = 0, miss = 0;
    Object.keys(boasts).forEach(function (mid) {
      var b = boasts[mid];
      var m = data.getMatch(mid);
      var row = {
        id: mid,
        text: b.text,
        camp: b.camp || 'home',
        md: b.md,
        ts: b.ts || 0,
        names: b.names,
        result: b.result,
        finished: m ? engine.isFinished(m) : false,
        sc: m && m.sc ? m.sc : ''
      };
      if (b.result === 'hit') hit++;
      if (b.result === 'miss') miss++;
      archive.push(row);
    });
    archive.sort(function (a, b) { return b.ts - a.ts; });

    var hasBoasted = !!(pick && boasts[pick.id]);
    var currentText = hasBoasted ? boasts[pick.id].text : '';
    var mySavedCamp = hasBoasted && boasts[pick.id].camp ? boasts[pick.id].camp : 'home';
    this._allArchive = archive;
    this._allCands = cands;

    this.setData({
      cands: cands,
      open: pick,
      openId: pick ? pick.id : '',
      hasBoasted: hasBoasted,
      myCamp: mySavedCamp,
      text: currentText,
      count: currentText.length,
      archive: archive,
      stats: {
        hit: hit, miss: miss, total: archive.length,
        rate: (hit + miss) > 0 ? Math.round(hit * 100 / (hit + miss)) + '%' : '--'
      }
    });

    this.applyPickerFilter();
    this.loadDebatesForMatch(pick);
    this.applyArchiveFilter();
  },

  loadDebatesForMatch: function (m) {
    if (!m) return;
    var that = this;
    var boasts = wx.getStorageSync('boasts') || {};
    var myBoast = boasts[m.id];
    var reactions = wx.getStorageSync('court_reactions') || {};

    // 优先拉取云端本场狂言
    cloud.readBoard('court', 'default', undefined, m.id).then(function (res) {
      var list = (res && res.list) ? res.list : [];
      that.buildDebateStream(m, myBoast, list, reactions);
    }).catch(function () {
      that.buildDebateStream(m, myBoast, [], reactions);
    });
  },

  buildDebateStream: function (m, myBoast, cloudList, reactions) {
    var rawList = [];
    var s = wx.getStorageSync('settings') || {};
    var myNick = s.nick || wx.getStorageSync('nickname') || '我';

    // 1. 如果自己有发言，放在首位
    if (myBoast) {
      rawList.push({
        _id: 'my_' + m.id,
        m: m.id,
        nick: myNick,
        camp: myBoast.camp || 'home',
        text: myBoast.text,
        ts: myBoast.ts || Date.now(),
        timeStr: '刚刚',
        likes: myBoast.likes || 1,
        flags: myBoast.flags || 0,
        milks: myBoast.milks || 0,
        result: myBoast.result || null,
        isMe: true
      });
    }

    // 2. 合并云端真实发言（去重）
    if (cloudList && cloudList.length) {
      cloudList.forEach(function (cb) {
        if (myBoast && cb.isMe) return; // 避免与 myBoast 重复
        rawList.push({
          _id: cb._id || ('cloud_' + cb.ts),
          m: cb.m,
          nick: cb.nick || '夜猫',
          camp: cb.camp || 'neutral',
          text: cb.text,
          ts: cb.ts,
          timeStr: cb.ts ? that_formatTime(cb.ts) : '不久前',
          likes: cb.likes || 0,
          flags: cb.flags || 0,
          milks: cb.milks || 0,
          result: cb.result || null,
          isMe: !!cb.isMe
        });
      });
    }

    // 3. 补充拟真发言以保持对决氛围
    var mocks = genMockDebates(m);
    mocks.forEach(function (mb) {
      if (!rawList.some(function (r) { return r._id === mb._id; })) {
        rawList.push(mb);
      }
    });

    // 4. 挂载本地点赞高亮状态
    var homeCount = 0, awayCount = 0;
    rawList.forEach(function (item) {
      item.myReaction = reactions[item._id] || null;
      if (item.camp === 'home') homeCount += (1 + (item.likes || 0));
      else if (item.camp === 'away') awayCount += (1 + (item.likes || 0));
    });

    var total = homeCount + awayCount;
    var homePct = total > 0 ? Math.round((homeCount / total) * 100) : 50;
    var awayPct = 100 - homePct;

    this._allDebates = rawList;
    this.setData({
      debates: rawList,
      campRatio: {
        homePct: homePct,
        awayPct: awayPct,
        homeCount: homeCount,
        awayCount: awayCount,
        total: total
      }
    });
    this.applyDebateFilter();
  },

  onMainTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (this.data.mainTab === tab) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ mainTab: tab });
  },

  togglePickerModal: function () {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ showPickerModal: !this.data.showPickerModal });
  },

  toggleDrawer: function () {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ showDrawer: !this.data.showDrawer });
  },

  toggleRuleModal: function () {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ showRuleModal: !this.data.showRuleModal });
  },

  onPickerTab: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.pickerFilter === id) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ pickerFilter: id });
    this.applyPickerFilter();
  },

  applyPickerFilter: function () {
    var tab = this.data.pickerFilter;
    var list = this._allCands || [];
    var filtered = list.slice();

    if (tab === 'recent') {
      filtered = filtered.filter(function (m) { return m.st !== 'done'; });
    } else if (tab === 'done') {
      filtered = filtered.filter(function (m) { return m.st === 'done'; });
    }

    if (!filtered.length && tab === 'recent') {
      filtered = list.slice(0, 10);
    }

    this.setData({ displayCands: filtered });
  },

  onSelectMatch: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id || id === this.data.openId) {
      this.setData({ showPickerModal: false });
      return;
    }
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this._focusId = id;
    var target = this.data.cands.find(function (c) { return c.id === id; });
    if (target) {
      var boasts = wx.getStorageSync('boasts') || {};
      var hasBoasted = !!boasts[id];
      var curText = hasBoasted ? boasts[id].text : '';
      var curCamp = hasBoasted && boasts[id].camp ? boasts[id].camp : 'home';
      this.setData({
        open: target,
        openId: id,
        hasBoasted: hasBoasted,
        text: curText,
        count: curText.length,
        myCamp: curCamp,
        showPickerModal: false
      });
      this.loadDebatesForMatch(target);
    }
  },

  onSelectCamp: function (e) {
    if (this.data.hasBoasted) {
      wx.showToast({ title: '本场立场已锁定存据，不可更改', icon: 'none' });
      return;
    }
    var camp = e.currentTarget.dataset.camp;
    if (this.data.myCamp === camp) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ myCamp: camp });
  },

  onDebateTab: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.debateTab === id) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ debateTab: id });
    this.applyDebateFilter();
  },

  applyDebateFilter: function () {
    var tab = this.data.debateTab;
    var list = this._allDebates || [];
    var filtered = list.slice();

    if (tab === 'home') {
      filtered = filtered.filter(function (d) { return d.camp === 'home'; });
    } else if (tab === 'away') {
      filtered = filtered.filter(function (d) { return d.camp === 'away'; });
    } else if (tab === 'hot') {
      filtered.sort(function (a, b) {
        var scoreA = (a.likes || 0) * 2 + (a.flags || 0) + (a.milks || 0);
        var scoreB = (b.likes || 0) * 2 + (b.flags || 0) + (b.milks || 0);
        return scoreB - scoreA;
      });
    }

    this.setData({ displayDebates: filtered });
  },

  onReact: function (e) {
    var id = e.currentTarget.dataset.id;
    var type = e.currentTarget.dataset.type; // 'like' | 'flag' | 'milk'
    if (!id || !type) return;

    var reactions = wx.getStorageSync('court_reactions') || {};
    var cur = reactions[id] || null;
    var debates = this._allDebates || [];
    var target = debates.find(function (d) { return d._id === id; });
    if (!target) return;

    var field = type === 'like' ? 'likes' : (type === 'flag' ? 'flags' : 'milks');
    var delta = 1;

    if (cur === type) {
      // 取消点赞
      delete reactions[id];
      target[field] = Math.max(0, (target[field] || 1) - 1);
      target.myReaction = null;
      delta = -1;
    } else {
      // 切换或新增
      if (cur) {
        var oldField = cur === 'like' ? 'likes' : (cur === 'flag' ? 'flags' : 'milks');
        target[oldField] = Math.max(0, (target[oldField] || 1) - 1);
      }
      reactions[id] = type;
      target[field] = (target[field] || 0) + 1;
      target.myReaction = type;
    }

    wx.setStorageSync('court_reactions', reactions);
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });

    // 上报云端
    cloud.reactBoast({ id: id, type: type, delta: delta });

    // 更新声量天平
    var homeCount = 0, awayCount = 0;
    debates.forEach(function (item) {
      if (item.camp === 'home') homeCount += (1 + (item.likes || 0));
      else if (item.camp === 'away') awayCount += (1 + (item.likes || 0));
    });
    var total = homeCount + awayCount;
    var homePct = total > 0 ? Math.round((homeCount / total) * 100) : 50;

    this.setData({
      campRatio: {
        homePct: homePct,
        awayPct: 100 - homePct,
        homeCount: homeCount,
        awayCount: awayCount,
        total: total
      }
    });
    this.applyDebateFilter();
  },

  onInput: function (e) {
    if (this.data.hasBoasted) return;
    var v = e.detail.value.slice(0, 40);
    this.setData({ text: v, count: v.length });
  },

  onQuickTag: function (e) {
    if (this.data.hasBoasted) return;
    var tag = e.currentTarget.dataset.tag;
    var cur = this.data.text;
    var next = cur ? (cur + ' ' + tag) : tag;
    if (next.length > 40) next = next.slice(0, 40);
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ text: next, count: next.length });
  },

  submit: function () {
    var m = this.data.open;
    var text = this.data.text.trim();
    var camp = this.data.myCamp || 'home';

    if (this.data.hasBoasted) {
      wx.showToast({ title: '本场已立字存据，落槌不可修改！', icon: 'none' });
      return;
    }

    if (!m || !text) {
      wx.showToast({ title: '先留一句狂言呈堂', icon: 'none' });
      return;
    }

    var boasts = wx.getStorageSync('boasts') || {};
    if (boasts[m.id]) {
      wx.showToast({ title: '本场已立字存据，落槌不可修改！', icon: 'none' });
      return;
    }

    boasts[m.id] = {
      text: text,
      camp: camp,
      ts: Date.now(),
      md: m.md,
      names: m.home.zh + ' vs ' + m.away.zh,
      result: null
    };
    wx.setStorageSync('boasts', boasts);

    var that = this;
    cloud.addBoast({
      m: m.id,
      text: text,
      camp: camp,
      ts: boasts[m.id].ts,
      md: m.md,
      names: m.home.zh + ' vs ' + m.away.zh
    }).then(function (sealed) {
      if (sealed === 'rejected') {
        var boasts2 = wx.getStorageSync('boasts') || {};
        delete boasts2[m.id];
        wx.setStorageSync('boasts', boasts2);
        wx.showToast({ title: '开庭已截止或不可重复立据', icon: 'none' });
        that.refresh();
      }
    });

    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '狂言已立字存据，落槌无悔！', icon: 'success' });
    this.setData({ hasBoasted: true, showDrawer: false });
    this.refresh();
  },

  judge: function (e) {
    var id = e.currentTarget.dataset.id, r = e.currentTarget.dataset.r;
    var boasts = wx.getStorageSync('boasts') || {};
    if (boasts[id]) {
      boasts[id].result = r;
      wx.setStorageSync('boasts', boasts);
      cloud.judgeBoast({ id: id, result: r });
    }
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: r === 'hit' ? '已判定：封神应验！' : '已判定：打脸翻车！', icon: 'none' });
    this.refresh();
  },

  onArchiveTab: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.archiveTab === id) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ archiveTab: id });
    this.applyArchiveFilter();
  },

  applyArchiveFilter: function () {
    var tab = this.data.archiveTab;
    var list = this._allArchive || [];
    var filtered = list.filter(function (item) {
      if (tab === 'all') return true;
      if (tab === 'pending') return !item.finished || !item.result;
      if (tab === 'hit') return item.result === 'hit';
      if (tab === 'miss') return item.result === 'miss';
      return true;
    });
    this.setData({ displayArchive: filtered });
  },

  goDetail: function () {
    if (this.data.open) wx.navigateTo({ url: '/pages/detail/detail?id=' + this.data.open.id });
  },

  onTapArchive: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  onShareAppMessage: function () {
    var open = this.data.open;
    var title = open
      ? '【德比法庭】' + open.home.zh + ' vs ' + open.away.zh + ' · 双方阵营火热对决，谁敢来立据？'
      : '【德比法庭】赛前狂言立字为证，赛后开箱审判！谁敢来辩？';
    var path = '/pages/court/court' + (this._focusId ? '?id=' + this._focusId : '');
    return { title: title, path: path };
  }
});

function that_formatTime(ts) {
  var diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  var d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
