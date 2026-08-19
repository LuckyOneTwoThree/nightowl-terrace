var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');

// 豪门集合：英超六强 + 各国传统豪门（PM 9.6 星级下限/豪门出战筛选）
var GIANTS = ['ARS', 'MCI', 'LIV', 'CHE', 'MUN', 'TOT', 'RMA', 'BAR', 'ATM', 'MIL', 'INT', 'JUV', 'FCB', 'BVB', 'PSG'];

Page({
  _currentMatchId: null,
  _shuffleTimer: null,

  data: {
    theme: data.getInitTheme(),
    pills: [
      { key: 'prime', label: '仅黄金档', on: false },
      { key: 'star2', label: '★★以上', on: false },
      { key: 'giant', label: '豪门出战', on: false }
    ],
    front: null,       // { tags, stars, cost, isTonight }
    back: null,        // decorate.dec 结果
    revealed: false,
    shuffling: false,
    poolType: 'tonight' // 'tonight' | 'upcoming' | 'none'
  },

  onShow: function () {
    getApp().applyTheme(this);
  },

  onUnload: function () {
    if (this._shuffleTimer) clearTimeout(this._shuffleTimer);
  },

  onLoad: function () {
    this.draw(true);
  },

  /**
   * 构建盲盒比赛候选池
   * 优先今晚未赛场次；若今晚无球，智能 fallback 到近期焦点未赛比赛，杜绝空池死锁
   */
  buildPool: function () {
    var recMap = data.getRecMap(), rivs = data.getRivalries(), sls = data.getStorylines();
    var today = engine.nightOf(new Date());

    var flags = {};
    this.data.pills.forEach(function (p) { flags[p.key] = p.on; });

    var filterMatch = function (m) {
      if (m.st !== 'sched' || m.tbd) return null;
      var ev = engine.evaluate(m, recMap, rivs, sls, []);
      if (flags.prime && m.s > 1) return null;                     // 黄金档：S1 及以前 (23:00前)
      if (flags.star2 && ev.star < 2) return null;                 // 星级下限
      if (flags.giant && GIANTS.indexOf(m.h) < 0 && GIANTS.indexOf(m.a) < 0) return null;
      return { m: m, ev: ev };
    };

    // 1. 优先今晚
    var tonightPool = [];
    data.matchesOfDay(today).forEach(function (m) {
      var item = filterMatch(m);
      if (item) tonightPool.push(item);
    });

    if (tonightPool.length > 0) {
      return { pool: tonightPool, isTonight: true };
    }

    // 2. 今晚无球，智能扩大到未来所有未赛场次（按时间升序）
    var upcomingPool = [];
    var allMatches = data.matchesAll() || [];
    for (var i = 0; i < allMatches.length; i++) {
      var m = allMatches[i];
      var item = filterMatch(m);
      if (item) {
        upcomingPool.push(item);
        if (upcomingPool.length >= 30) break; // 取近期 30 场
      }
    }

    return { pool: upcomingPool, isTonight: false };
  },

  /**
   * 抽盲盒
   * @param {Boolean} isInitial 是否为页面首次加载
   */
  draw: function (isInitial) {
    var res = this.buildPool();
    var pool = res.pool;
    var isTonight = res.isTonight;

    if (!pool || !pool.length) {
      this.setData({
        front: null,
        back: null,
        revealed: false,
        shuffling: false,
        poolType: 'none'
      });
      if (!isInitial) {
        wx.showToast({ title: '当前筛选条件下暂无比赛', icon: 'none' });
      }
      return;
    }

    // 去重算法：若池子有多场，优先排除当前展示的这一场
    var available = pool;
    if (pool.length > 1 && this._currentMatchId) {
      var filtered = pool.filter(function (item) {
        return item.m.id !== this._currentMatchId;
      }.bind(this));
      if (filtered.length > 0) available = filtered;
    }

    var pick = available[Math.floor(Math.random() * available.length)];
    var m = pick.m, ev = pick.ev;
    this._currentMatchId = m.id;

    // 正面提示标签：看点、德比、故事线
    var tags = [];
    if (ev.rivalry) tags.push(ev.rivalry);
    if (ev.keyNode) tags.push('关键节点');
    if (!tags.length && ev.stories && ev.stories.length) {
      tags = ev.stories.map(function (s) { return s.name; }).slice(0, 2);
    }
    if (!tags.length) tags.push('悬念对决');

    // 触感震动反馈
    if (!isInitial && wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }

    var backDec = decorate.dec(m, ev, { followed: getApp().getFollowed() });

    this.setData({
      front: {
        tags: tags,
        stars: '★★★'.slice(0, ev.star),
        cost: engine.tierOf(m).cost,
        isTonight: isTonight
      },
      back: backDec,
      revealed: false,
      shuffling: true,
      poolType: isTonight ? 'tonight' : 'upcoming'
    });

    if (this._shuffleTimer) clearTimeout(this._shuffleTimer);
    this._shuffleTimer = setTimeout(function () {
      this.setData({ shuffling: false });
    }.bind(this), 350);
  },

  openBox: function () {
    if (!this.data.front) return;
    this.setData({ revealed: true });
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'medium' });
    }
  },

  flip: function () {
    if (!this.data.front) return;
    var nextState = !this.data.revealed;
    this.setData({ revealed: nextState });

    // 翻牌揭晓触感震动
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'medium' });
    }
  },

  toggle: function (e) {
    var i = e.currentTarget.dataset.i;
    var pills = this.data.pills.map(function (p, idx) {
      if (idx === i) p.on = !p.on;
      return p;
    });
    this.setData({ pills: pills });
    this.draw(false);
  },

  resetPills: function () {
    var pills = this.data.pills.map(function (p) {
      p.on = false;
      return p;
    });
    this.setData({ pills: pills });
    this.draw(false);
  },

  watchIt: function () {
    if (this.data.back && this.data.back.id) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + this.data.back.id });
    }
  },

  redraw: function () {
    this.draw(false);
  },

  callFriends: function () {
    var b = this.data.back;
    if (!b) return;
    var text = '【盲盒开球】我抽到了 ' + b.md + ' ' + b.hm + ' ' + b.home.zh + ' vs ' + b.away.zh + '（' + b.stars + '），你也来抽一场？';
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '已复制，去群里喊人', icon: 'none' });
      }
    });
  }
});

