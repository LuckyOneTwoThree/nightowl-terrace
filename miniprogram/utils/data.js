/**
 * 数据访问层
 * M2：内置 JSON 直读（无云开发依赖，模拟器可跑）
 * v1：切云数据库拉取，接口签名不变，页面零改动
 */

var teams = require('../data/teams.json');
var fixturesSeed = require('../data/fixtures.seed.json');
var recsSeed = require('../data/recommendations.seed.json');
var storylinesAll = require('../data/storylines.json');
var rivalries = require('../data/rivalries.json');
var quips = require('../data/quips.json');

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
teams.forEach(function (t) { teamMap[t.id] = t; });

function recMap() {
  var map = {};
  recsSeed.forEach(function (r) { map[r.m] = r; });
  return map;
}

function storylines() {
  // draft 状态故事线（如西甲/意甲争冠线待核实）不参与推荐计算
  return storylinesAll.filter(function (s) { return s.status !== 'draft'; });
}

function getMatch(id) {
  return matchesAll().filter(function (m) { return m.id === id; })[0] || null;
}

module.exports = {
  LEAGUES: LEAGUES,
  LEAGUE_META: LEAGUE_META,
  tint: tint,
  getMatch: getMatch,
  getTeams: function () { return teams; },
  getTeam: function (id) { return teamMap[id] || { id: id, zh: id, color: '#666' }; },
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
    // 北京时间口径：凌晨场（00:00–06:00）归属前一晚
    return fixturesSeed.filter(function (m) {
      var parts = m.t.split('T');
      var day = parts[0];
      var hm = parts[1].split(':');
      if (Number(hm[0]) < 6) {
        var d = new Date(day.replace(/-/g, '/') + ' 00:00:00');
        d.setDate(d.getDate() - 1);
        var m2 = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
        var dd = (d.getDate() < 10 ? '0' : '') + d.getDate();
        day = d.getFullYear() + '-' + m2 + '-' + dd;
      }
      return day === dateStr;
    });
  }
};
