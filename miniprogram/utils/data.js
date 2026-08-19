/**
 * 数据访问层
 * M2：内置 JSON 直读（无云开发依赖，模拟器可跑）
 * v1：切云数据库拉取，接口签名不变，页面零改动
 */

var teams = require('../data/teams.js');
var crest = require('./crest.js');
var engine = require('./engine.js');
var fixturesSeed = require('../data/fixtures.full.js'); // M1.1 全量 1752 场（ESPN 抓取生成，tools/fetch_espn.js + build_fixtures.js）
var recsSeed = require('../data/recommendations.seed.js');
var storylinesAll = require('../data/storylines.js');
var rivalries = require('../data/rivalries.js');
var quips = require('../data/quips.js');

var LEAGUES = [
  { id: 'PL', zh: '英超' },
  { id: 'PD', zh: '西甲' },
  { id: 'SA', zh: '意甲' },
  { id: 'BL', zh: '德甲' },
  { id: 'FL', zh: '法甲' },
  { id: 'SCG', zh: '超级杯' }
];

// 联赛视觉元数据（对齐 Stitch _4/_5：实心章 / 左色条 / 筛选药丸暗底）
var LEAGUE_META = {
  PL:  { solid: '#7C3AED', accent: '#38003C' },
  PD:  { solid: '#EE8707', accent: '#EE8707' },
  SA:  { solid: '#1E88C7', accent: '#155E9C' },
  BL:  { solid: '#E5322D', accent: '#C8102E' },
  FL:  { solid: '#10B981', accent: '#0B7A55' },
  SCG: { solid: '#F5C518', accent: '#B8860B' }
};

// hex → rgba（球队圆标 20% 底 / 30% 描边用）
function tint(hex, a) {
  var h = hex.replace('#', '');
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

var teamMap = {};
teams.forEach(function (t) {
  t.logo = crest.getUrl(t.id, t.league);
  teamMap[t.id] = t;
});

// 推荐层索引（种子不可变，模块级缓存避免每次全量重建）
var _recMap = null;
function recMap() {
  if (!_recMap) {
    _recMap = {};
    recsSeed.forEach(function (r) { _recMap[r.m] = r; });
  }
  return _recMap;
}

function storylines() {
  // draft 状态故事线（如西甲/意甲争冠线待核实）不参与推荐计算
  return storylinesAll.filter(function (s) { return s.status !== 'draft'; });
}

// 场次索引（种子不可变，模块级缓存；原 filter 全量扫描 O(n) → O(1)）
var _matchMap = null;
function getMatch(id) {
  if (!_matchMap) {
    _matchMap = {};
    fixturesSeed.forEach(function (m) { _matchMap[m.id] = m; });
  }
  return _matchMap[id] || null;
}

module.exports = {
  LEAGUES: LEAGUES,
  LEAGUE_META: LEAGUE_META,
  tint: tint,
  getMatch: getMatch,
  getTeams: function () { return teams; },
  getTeam: function (id) { return teamMap[id] || { id: id, zh: id, color: '#666', logo: null }; },
  getRivalries: function () { return rivalries; },
  getStorylines: function () { return storylines(); },
  getAllStorylines: function () { return storylinesAll; },
  getRecMap: function () { return recMap(); },
  getQuip: function (dateStr) {
    // 按日期取模轮换，保证同一天全群看到同一句
    var seed = dateStr.split('-').reduce(function (s, p) { return s + Number(p); }, 0);
    return quips[seed % quips.length];
  },
  /**
   * 拉取赛程。M2 返回内置种子；v1 切云后改为 wx.cloud.callFunction
   * @return Promise<fixtures[]>
   */
  loadFixtures: function () {
    return Promise.resolve(fixturesSeed);
  },
  matchesAll: function () {
    return fixturesSeed;
  },
  fixturesByDate: function (dateStr) {
    return fixturesSeed.filter(function (m) { return m.t.split('T')[0] === dateStr; });
  },
  matchesOfDay: function (dateStr) {
    // 北京时间口径：凌晨场（00:00–06:00）归属前一晚（统一走 engine.owlDay，避免双份口径漂移）
    return fixturesSeed.filter(function (m) { return engine.owlDay(m.t) === dateStr; });
  },
  getInitTheme: function () {
    try {
      var s = wx.getStorageSync('settings') || {};
      var mode = s.theme || 'dark';
      if (mode === 'auto') {
        var info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
        return info.theme === 'light' ? 'light' : 'dark';
      }
      return mode === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  }
};
