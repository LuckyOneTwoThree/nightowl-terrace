/**
 * 比赛装饰器：把引擎输出转成 WXML 可直接绑定的字段
 * 各页面（detail/predict/court/board/box/records/today/week）共用
 */
var engine = require('./engine.js');
var data = require('./data.js');

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function lgZh(l) {
  var hit = data.LEAGUES.filter(function (x) { return x.id === l; })[0];
  return hit ? hit.zh : l;
}

// 欧洲夏令时：3 月最后一个周日 01:00 UTC 起，10 月最后一个周日 01:00 UTC 止（英国同日切换）
function lastSundayUTC(year, month0) {
  var lastDay = Date.UTC(year, month0 + 1, 0); // 该月最后一天
  var wd = new Date(lastDay).getUTCDay();
  return lastDay - wd * 86400000 + 3600000;    // 当月最后一个周日 01:00 UTC
}

function isEuDst(ts) {
  var y = new Date(ts).getUTCFullYear();
  return ts >= lastSundayUTC(y, 2) && ts < lastSundayUTC(y, 9); // 3月 / 10月
}

// 当地开球时间（PM 第三节时差表：夏令时英超 -7 / 欧陆 -6，冬令时 -8 / -7）
function localTime(m) {
  var dst = isEuDst(engine.ts(m.t)); // 按开球时刻精确判断，替换 4–10 月近似
  var offset = m.l === 'PL' ? (dst ? 7 : 8) : (dst ? 6 : 7);
  var hm = m.t.split('T')[1].split(':');
  var local = Number(hm[0]) * 60 + Number(hm[1]) - offset * 60;
  if (local < 0) local += 1440;
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return p2(Math.floor(local / 60)) + ':' + p2(local % 60);
}

// 相对自然日天数差（今天=0，明天=1，昨天=-1…）
// 基于北京时间自然日对比，设备时区无关（与 schedule 赛程列表日历严格对齐）
function relDay(t, nowTs) {
  var parts = String(t || '').split('T');
  var mP = (parts[0] || '2026-08-01').split('-').map(Number);
  var cP = engine.bjDateStr(nowTs || Date.now()).split('-').map(Number);
  return Math.round((Date.UTC(mP[0], mP[1] - 1, mP[2]) - Date.UTC(cP[0], cP[1] - 1, cP[2])) / 86400000);
}

function getDayLabel(t, nowTs) {
  var parts = String(t || '').split('T');
  var hm = (parts[1] || '00:00').split(':');
  var hour = Number(hm[0]);
  var isMidnight = hour < 6; // 00:00–06:00 凌晨档
  var d = new Date((parts[0] || '2026-08-01').replace(/-/g, '/') + ' 00:00:00');
  var diff = relDay(t, nowTs);

  if (diff === 0) return isMidnight ? '今天凌晨' : '今天';
  if (diff === 1) return isMidnight ? '明晨' : '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return isMidnight ? '昨天凌晨' : '昨天';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
}

function getDateHeader(t, nowTs) {
  var parts = String(t || '').split('T');
  var hm = (parts[1] || '00:00').split(':');
  var hour = Number(hm[0]);
  var isMidnight = hour < 6;
  var d = new Date((parts[0] || '2026-08-01').replace(/-/g, '/') + ' 00:00:00');
  var mdStr = (d.getMonth() + 1) + '月' + d.getDate() + '日 (周' + WEEK[d.getDay()] + ')';
  var diff = relDay(t, nowTs);

  if (diff === 0) return (isMidnight ? '今天凌晨 · ' : '今天 · ') + mdStr;
  if (diff === 1) return (isMidnight ? '明晨 · ' : '明天 · ') + mdStr;
  if (diff === 2) return '后天 · ' + mdStr;
  if (diff === -1) return (isMidnight ? '昨天凌晨 · ' : '昨天 · ') + mdStr;
  return mdStr;
}

function dpart(t) {
  var parts = String(t || '').split('T');
  var day = parts[0] || '2026-08-01';
  var d = new Date(day.replace(/-/g, '/') + ' 00:00:00');
  return { d: d, hm: parts[1] || '00:00', day: day };
}

/**
 * @param m   赛程层记录
 * @param ev  engine.evaluate 输出（可空，内部自动补算）
 * @param opts {followed:[], followedLeagues:[]}
 */
function dec(m, ev, opts) {
  var followed = (opts && opts.followed) || (typeof getApp === 'function' && getApp() && getApp().getFollowed ? getApp().getFollowed() : []);
  var followedLeagues = (opts && opts.followedLeagues) || (typeof getApp === 'function' && getApp() && getApp().getFollowedLeagues ? getApp().getFollowedLeagues() : ['PL', 'PD', 'SA', 'BL', 'FL']);
  ev = ev || engine.evaluate(m, data.getRecMap(), data.getRivalries(), data.getStorylines(), followed, followedLeagues);
  var h = data.getTeam(m.h);
  var a = data.getTeam(m.a);
  var meta = data.LEAGUE_META[m.l] || {};
  var f = dpart(m.t);
  var tier = engine.tierOf(m);
  var sc = m.sc ? m.sc.split('-') : null;
  return {
    id: m.id,
    lg: m.l, lgZh: lgZh(m.l), lgEn: m.l === 'PL' ? 'Premier League' : m.l === 'PD' ? 'La Liga' : m.l === 'SA' ? 'Serie A' : m.l === 'BL' ? 'Bundesliga' : m.l === 'FL' ? 'Ligue 1' : m.l,
    lgSolid: meta.solid || '#334155', lgAccent: meta.accent || '#1E293B',
    home: { id: h.id, zh: h.zh, logo: h.logo, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
    away: { id: a.id, zh: a.zh, logo: a.logo, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
    hm: f.hm, md: (f.d.getMonth() + 1) + '月' + f.d.getDate() + '日', ms: (f.d.getMonth() + 1) + '/' + f.d.getDate(),
    week: '周' + WEEK[f.d.getDay()], wd: WEEK[f.d.getDay()],
    dayLabel: getDayLabel(m.t),
    dateHeader: getDateHeader(m.t),
    local: localTime(m),
    tbd: !!m.tbd, st: m.st, finished: engine.isFinished(m),
    scH: sc ? sc[0] : '-', scA: sc ? sc[1] : '-', scText: m.sc || '',
    star: ev.star, stars: '★★★'.slice(0, ev.star),
    isFollowed: !!ev.isFollowed,
    isLeagueFollowed: !!ev.isLeagueFollowed,
    points: ev.rec ? (ev.rec.points || []) : [],
    trivia: ev.rec ? ev.rec.trivia : null,
    indexText: engine.owlIndex(ev, m).toFixed(1),
    tierLabel: tier.label, tierZh: tier.zh, cost: tier.cost,
    storyNames: ev.stories.map(function (s) { return s.name; }),
    storyIds: ev.storyIds,
    keyNode: ev.keyNode,
    rivalry: ev.rivalry,
    bonuses: ev.bonuses || [],
    tv: m.tv || null
  };
}

module.exports = {
  dec: dec,
  lgZh: lgZh,
  localTime: localTime,
  WEEK: WEEK,
  getDayLabel: getDayLabel,
  getDateHeader: getDateHeader,
  relDay: relDay
};
