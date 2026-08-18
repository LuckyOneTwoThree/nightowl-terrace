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

// 当地开球时间（PM 第三节时差表：夏令时英超 -7 / 欧陆 -6，冬令时 -8 / -7）
function localTime(m) {
  var month = Number(m.t.split('-')[1]);
  var dst = (month >= 4 && month <= 10); // 8–10月末、3月末–5 近似为 4–10 月
  var offset = m.l === 'PL' ? (dst ? 7 : 8) : (dst ? 6 : 7);
  var hm = m.t.split('T')[1].split(':');
  var local = Number(hm[0]) * 60 + Number(hm[1]) - offset * 60;
  if (local < 0) local += 1440;
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return p2(Math.floor(local / 60)) + ':' + p2(local % 60);
}

// 相对「夜猫今天」的天数差（今天=0，明天=1，昨天=-1…）
function relDay(t) {
  var mD = new Date(engine.owlDay(t).replace(/-/g, '/') + ' 00:00:00');
  var todayD = new Date(engine.nightOf(new Date()).replace(/-/g, '/') + ' 00:00:00');
  return Math.round((mD.getTime() - todayD.getTime()) / 86400000);
}

function getDayLabel(t) {
  var mD = new Date(engine.owlDay(t).replace(/-/g, '/') + ' 00:00:00');
  var diff = relDay(t);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  return (mD.getMonth() + 1) + '月' + mD.getDate() + '日 周' + WEEK[mD.getDay()];
}

function getDateHeader(t) {
  var mD = new Date(engine.owlDay(t).replace(/-/g, '/') + ' 00:00:00');
  var mdStr = (mD.getMonth() + 1) + '月' + mD.getDate() + '日 (周' + WEEK[mD.getDay()] + ')';
  var diff = relDay(t);
  if (diff === 0) return '今天 · ' + mdStr;
  if (diff === 1) return '明天 · ' + mdStr;
  if (diff === 2) return '后天 · ' + mdStr;
  return mdStr;
}

function dpart(t) {
  var day = engine.owlDay(t);
  var d = new Date(day.replace(/-/g, '/') + ' 00:00:00');
  return { d: d, hm: t.split('T')[1], day: day };
}

/**
 * @param m   赛程层记录
 * @param ev  engine.evaluate 输出（可空，内部自动补算）
 * @param opts {followed:[]}
 */
function dec(m, ev, opts) {
  ev = ev || engine.evaluate(m, data.getRecMap(), data.getRivalries(), data.getStorylines(), (opts && opts.followed) || []);
  var h = data.getTeam(m.h);
  var a = data.getTeam(m.a);
  var meta = data.LEAGUE_META[m.l] || {};
  var f = dpart(m.t);
  var tier = engine.tierOf(m);
  var sc = m.sc ? m.sc.split('-') : null;
  return {
    id: m.id,
    lg: m.l, lgZh: lgZh(m.l), lgEn: m.l === 'PL' ? 'Premier League' : m.l === 'PD' ? 'La Liga' : m.l === 'SA' ? 'Serie A' : m.l === 'BL' ? 'Bundesliga' : m.l === 'FL' ? 'Ligue 1' : m.l,
    lgSolid: meta.solid || '#514533', lgAccent: meta.accent || '#514533',
    home: { id: h.id, zh: h.zh, logo: h.logo, bg: data.tint(h.color, .2), bd: data.tint(h.color, .35) },
    away: { id: a.id, zh: a.zh, logo: a.logo, bg: data.tint(a.color, .2), bd: data.tint(a.color, .35) },
    hm: f.hm, md: (f.d.getMonth() + 1) + '月' + f.d.getDate() + '日', ms: (f.d.getMonth() + 1) + '/' + f.d.getDate(),
    week: '周' + WEEK[f.d.getDay()], wd: WEEK[f.d.getDay()],
    dayLabel: getDayLabel(m.t),
    dateHeader: getDateHeader(m.t),
    local: localTime(m),
    tbd: !!m.tbd, st: m.st, finished: m.st === 'ft' || m.st === 'done',
    scH: sc ? sc[0] : '-', scA: sc ? sc[1] : '-', scText: m.sc || '',
    star: ev.star, stars: '★★★'.slice(0, ev.star),
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
  WEEK: WEEK
};
