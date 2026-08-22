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

var TOP_LEAGUE_IDS = ['PL', 'PD', 'SA', 'BL', 'FL'];

var LEAGUE_INFO = {
  PL:  { id: 'PL', zh: '英超', en: 'Premier League', solid: '#7C3AED', accent: '#38003C', tagline: '世界第一联赛 · 对抗激烈', desc: '争冠争四白热化，顶级名帅豪门齐聚' },
  PD:  { id: 'PD', zh: '西甲', en: 'La Liga',         solid: '#EE8707', accent: '#EE8707', tagline: '豪门争雄 · 艺术足球', desc: '世纪德比巅峰碰撞，技术流华丽盛宴' },
  SA:  { id: 'SA', zh: '意甲', en: 'Serie A',         solid: '#1E88C7', accent: '#155E9C', tagline: '战术博弈 · 群雄并起', desc: '链式防守与战术美学，格局扑朔迷离' },
  BL:  { id: 'BL', zh: '德甲', en: 'Bundesliga',      solid: '#E5322D', accent: '#C8102E', tagline: '进球狂潮 · 激情狂热', desc: '大开大合进攻风暴，球场氛围极度震撼' },
  FL:  { id: 'FL', zh: '法甲', en: 'Ligue 1',         solid: '#10B981', accent: '#0B7A55', tagline: '青春风暴 · 天赋对决', desc: '速度灵动与新星摇篮，豪强争霸' },
  SCG: { id: 'SCG', zh: '超级杯', en: 'Super Cup',    solid: '#F5C518', accent: '#B8860B', tagline: '赛季揭幕 · 王者决战', desc: '各大联赛超级杯前哨战' }
};

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
  t.logo = crest.getUrl(t.id);
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

// 场次索引与动态比分缓存
var _matchMap = null;
var _dynamicFixtures = null;

function initFixtures() {
  if (!_matchMap) {
    _matchMap = {};
    _dynamicFixtures = fixturesSeed.map(function (m) {
      return Object.assign({}, m);
    });
    _dynamicFixtures.forEach(function (m) { _matchMap[m.id] = m; });

    // 应用本地已缓存的比分数据（保证离线秒开即有最新比分）
    try {
      var cached = (typeof wx !== 'undefined' && wx.getStorageSync) ? (wx.getStorageSync('cached_scores') || {}) : {};
      Object.keys(cached).forEach(function (id) {
        var patch = cached[id];
        if (_matchMap[id] && patch) {
          if (patch.st) _matchMap[id].st = patch.st;
          if (patch.sc) _matchMap[id].sc = patch.sc;
        }
      });
    } catch (e) {}
  }
}

function getMatch(id) {
  initFixtures();
  return _matchMap[id] || null;
}

function matchesAll() {
  initFixtures();
  return _dynamicFixtures;
}

// 事件发布订阅总线（比分同步后通知页面刷新）
var _scoreListeners = [];
function onScoresUpdated(fn) {
  if (typeof fn === 'function' && _scoreListeners.indexOf(fn) < 0) {
    _scoreListeners.push(fn);
  }
}
function offScoresUpdated(fn) {
  var idx = _scoreListeners.indexOf(fn);
  if (idx >= 0) _scoreListeners.splice(idx, 1);
}
function emitScoresUpdated(info) {
  _scoreListeners.slice().forEach(function (fn) {
    try { fn(info); } catch (e) { console.warn('[nightowl] onScoresUpdated listener error:', e); }
  });
}

function syncScores(options) {
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve(false);
  initFixtures();
  
  options = options || {};
  // 窗口保持 10 天（四轮 P1-4）：小程序端单次 get 上限 100 条且无 orderBy，
  // 窗口拉长到 30 天后赛季中期完赛场次会超上限，云库返回任意子集导致新比分丢失
  var daysBack = typeof options.days === 'number' ? options.days : 10;
  var since = engine.bjDateStr(Date.now() - daysBack * 86400000) + 'T00:00';

  function applyDocs(docs) {
    var cache = {};
    try { cache = wx.getStorageSync('cached_scores') || {}; } catch (e) {}
    var changed = false;
    var updatedIds = [];

    docs.forEach(function (doc) {
      var matchId = doc.id || doc._id;
      if (matchId && doc.sc) {
        cache[matchId] = { st: doc.st, sc: doc.sc };
        var m = _matchMap[matchId];
        if (m && (m.st !== doc.st || m.sc !== doc.sc)) {
          m.st = doc.st;
          m.sc = doc.sc;
          changed = true;
          updatedIds.push(matchId);
        }
      }
    });

    try { wx.setStorageSync('cached_scores', cache); } catch (e2) {}

    if (changed || options.forceEmit) {
      emitScoresUpdated({ changed: changed, count: docs.length, updatedIds: updatedIds });
    }
    return changed;
  }

  // 优先直接读取云数据库集合（按开球时间倒序取最近完赛场次，确保最新比分绝对不遗漏）
  if (wx.cloud.database) {
    var db = wx.cloud.database();
    var _ = db.command;
    return db.collection('fixtures').where({ st: 'done', t: _.gte(since) }).orderBy('t', 'desc').limit(100).get().then(function (res) {
      var docs = (res && res.data) || [];
      return applyDocs(docs);
    }).catch(function (err) {
      // 降级：若无复合索引则无 orderBy 查询
      return db.collection('fixtures').where({ st: 'done', t: _.gte(since) }).limit(100).get().then(function (res) {
        var docs = (res && res.data) || [];
        return applyDocs(docs);
      }).catch(function (err2) {
        console.warn('[nightowl] 直读 fixtures 集合失败，本次跳过云端比分:', err2 && err2.message);
        return false;
      });
    });
  }

  return Promise.resolve(false);
}

// 下拉刷新统一入口（四轮 P3）：各页 onPullDownRefresh 收拢到此处，
// 不强制 emit；有变更时 emit 已通知全部监听页（含当前页）刷新，after 仅作无变更兜底
function pullRefresh(after) {
  return syncScores().catch(function () { return false; }).then(function (changed) {
    if (!changed && typeof after === 'function') after();
    if (typeof wx !== 'undefined' && wx.stopPullDownRefresh) wx.stopPullDownRefresh();
  });
}

module.exports = {
  LEAGUES: LEAGUES,
  LEAGUE_META: LEAGUE_META,
  LEAGUE_INFO: LEAGUE_INFO,
  TOP_LEAGUE_IDS: TOP_LEAGUE_IDS,
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
    dateStr = dateStr || engine.nightOf(Date.now());
    var seed = dateStr.split('-').reduce(function (s, p) { return s + Number(p); }, 0);
    return quips[seed % quips.length];
  },
  /**
   * 拉取赛程。M2 返回内置种子；v1 切云后改为 wx.cloud.callFunction
   * @return Promise<fixtures[]>
   */
  loadFixtures: function () {
    return Promise.resolve(matchesAll());
  },
  matchesAll: matchesAll,
  syncScores: syncScores,
  pullRefresh: pullRefresh,
  onScoresUpdated: onScoresUpdated,
  offScoresUpdated: offScoresUpdated,
  emitScoresUpdated: emitScoresUpdated,
  fixturesByDate: function (dateStr) {
    return matchesAll().filter(function (m) { return m.t.split('T')[0] === dateStr; });
  },
  matchesOfDay: function (dateStr) {
    // 北京时间口径：凌晨场（00:00–06:00）归属前一晚（统一走 engine.owlDay，避免双份口径漂移）
    return matchesAll().filter(function (m) { return engine.owlDay(m.t) === dateStr; });
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
