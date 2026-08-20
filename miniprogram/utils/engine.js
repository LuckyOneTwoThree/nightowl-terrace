/**
 * 夜猫追球 · 推荐引擎
 * 判据全部可复算，不依赖临场感觉（PM 设计方案第六节）
 * 纯函数实现，与小程序/H5 原型/云函数通用
 */

// ---------- 时间 ----------

function parseMin(t) {
  // "2026-08-22T03:00" → 当日分钟数
  const hm = t.split('T')[1].split(':');
  return Number(hm[0]) * 60 + Number(hm[1]);
}

function dateOf(t) {
  return t.split('T')[0];
}

/**
 * 夜猫口径「展示日」：北京时间 00:00–06:00 的场次归属前一晚（PM 3.2）
 * 纯 UTC 算术实现，不依赖运行环境时区。
 * 例：t="2026-08-22T03:00"（北京 8/22 凌晨）→ 返回 "2026-08-21"（8/21 的夜）
 */
function owlDay(t) {
  var f = String(t || '').split('T');
  var hm = (f[1] || '00:00').split(':');
  var day = f[0];
  if (Number(hm[0]) < 6) {
    var p = day.split('-');
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) - 86400000);
    day = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  return day;
}

/**
 * 夜猫口径「今日」：北京墙钟凌晨 00:00–06:00 归前一晚（与 data.matchesOfDay 展示口径一致）
 * 纯 UTC 算术（+8h 平移读墙钟），设备时区无关——境外设备上「今晚」不错位。
 * @param now Date 对象或毫秒时间戳
 */
function nightOf(now) {
  var ts = (now instanceof Date) ? now.getTime() : Number(now);
  var bj = new Date(ts + 8 * 3600000);
  if (bj.getUTCHours() < 6) bj = new Date(bj.getTime() - 86400000);
  return bj.getUTCFullYear() + '-' + pad2(bj.getUTCMonth() + 1) + '-' + pad2(bj.getUTCDate());
}

// ---------- 睡眠成本分档（北京时间开球） ----------
// S0 ≤22:30 → 0h；S1 22:30–00:30 → 1.0h；S2 00:30–02:30 → 2.5h；S3 02:30–04:00 → 3.5h；S4 ≥04:00 → 4.5h

const TIERS = [
  { tier: 0, label: 'S0', cost: 0, zh: '零成本' },
  { tier: 1, label: 'S1', cost: 1.0, zh: '轻度' },
  { tier: 2, label: 'S2', cost: 2.5, zh: '中度' },
  { tier: 3, label: 'S3', cost: 3.5, zh: '重度' },
  { tier: 4, label: 'S4', cost: 4.5, zh: '极限' }
];

function sleepTier(t) {
  const m = parseMin(t);
  // 跨午夜回绕处理：00:00–06:00 属凌晨档
  if (m <= 30) return TIERS[1];            // 00:00–00:30 → S1
  if (m <= 150) return TIERS[2];           // 00:30–02:30 → S2
  if (m < 240) return TIERS[3];            // 02:30–04:00 → S3
  if (m < 420) return TIERS[4];            // 04:00–07:00 → S4
  if (m <= 22 * 60 + 30) return TIERS[0];  // 白天–22:30 → S0
  return TIERS[1];                         // 22:30–24:00 → S1
}

function tierOf(match) {
  return TIERS[match.s] || TIERS[0];
}

// ---------- 比赛状态 ----------
// 已赛口径统一：ESPN 源为 'done'，手工/历史数据可能为 'ft'，各页统一走本判据
function isFinished(m) {
  return !!m && (m.st === 'done' || m.st === 'ft');
}

// 足球比赛常规预计时长：120 分钟（90m 常规 + 15m 中场 + 补时）
var MATCH_DURATION_MS = 120 * 60 * 1000;

/**
 * 比赛生命周期自动推断状态
 * @param m 比赛对象
 * @param nowTs 当前毫秒时间戳（可选，默认 Date.now()）
 * @return 'finished' | 'live' | 'ended_pending' | 'sched' | 'pp'
 */
function matchState(m, nowTs) {
  if (!m) return 'sched';
  if (isFinished(m)) return 'finished';
  if (m.st === 'pp') return 'pp';
  nowTs = nowTs || Date.now();
  var kickTs = ts(m.t);
  if (isNaN(kickTs)) return m.st || 'sched';
  if (nowTs < kickTs) return 'sched';
  if (nowTs < kickTs + MATCH_DURATION_MS) return 'live';
  return 'ended_pending'; // 已过比赛时长，等待录入比分或结算
}

// ---------- 北京时区日历工具（设备时区无关） ----------

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// 时间戳 → 北京墙钟日期 'YYYY-MM-DD'
function bjDateStr(ts) {
  var b = new Date(ts + 8 * 3600000);
  return b.getUTCFullYear() + '-' + pad2(b.getUTCMonth() + 1) + '-' + pad2(b.getUTCDate());
}

// 墙钟日期 → 所在周的周一（纯日历法，与时区无关）
function mondayOfWall(ds) {
  var f = String(ds || '').split('-');
  var wall = Date.UTC(Number(f[0]), Number(f[1]) - 1, Number(f[2]));
  var wd = new Date(wall).getUTCDay();
  var mon = new Date(wall - ((wd + 6) % 7) * 86400000);
  return mon.getUTCFullYear() + '-' + pad2(mon.getUTCMonth() + 1) + '-' + pad2(mon.getUTCDate());
}

// 当前北京所在周：周一日期串 + 周一 00:00（北京）的真实时间戳
function weekStartBJ(nowTs) {
  var str = mondayOfWall(bjDateStr(nowTs));
  var f = str.split('-');
  return { str: str, ts: Date.UTC(Number(f[0]), Number(f[1]) - 1, Number(f[2])) - 8 * 3600000 };
}

// ---------- 盲评结算判据（records 页 / play 页赛季积分 / 云端 settleMatches 三方一致） ----------
// 胜平负 3 分，比分再 +2，命中冷门预警翻倍（PM 9.4）
function settlePred(pred, m, recMap) {
  if (!m || !m.sc) return null;
  var sc = String(m.sc);
  // 比分格式严格校验：'2-' 会被 Number('') 解析成 0 当成 2-0 骗分（云端 settleMatches 同判据）
  if (!/^\d+-\d+$/.test(sc)) return null;
  var p = sc.split('-');
  var h = Number(p[0]), a = Number(p[1]);
  var fact = h > a ? 'h' : h < a ? 'a' : 'd';
  var hit = pred.pick === fact;
  var pts = hit ? 3 : 0;
  // 比分加分需双方比分都已填写（半比分如只填主队 2、赛果 2-0 不给 +2）
  if (hit && pred.scoreH !== '' && pred.scoreH != null &&
      pred.scoreA !== '' && pred.scoreA != null &&
      Number(pred.scoreH) === h && Number(pred.scoreA) === a) pts += 2;
  var rec = (recMap || {})[m.id];
  if (hit && rec && rec.upset) pts *= 2;
  return { hit: hit, pts: pts, upset: hit && rec && !!rec.upset };
}

// ---------- 星级判据 ----------
// 命中焦点对阵表 → ★★★ 候选；故事线关键节点升一级；关注球队 +1（最高 ★★）
// 有推荐层人工星级时以其为基准，再做升星

const BIG_SIX = ['ARS', 'MCI', 'LIV', 'CHE', 'MUN', 'TOT'];

function rivalryOf(match, rivalries) {
  return (rivalries || []).find(function (r) {
    return r.pair.indexOf(match.h) >= 0 && r.pair.indexOf(match.a) >= 0;
  });
}

function isBigSixClash(match) {
  return BIG_SIX.indexOf(match.h) >= 0 && BIG_SIX.indexOf(match.a) >= 0;
}

function storylinesOf(match, storylines) {
  return (storylines || []).filter(function (s) {
    return s.status !== 'draft' && s.nodes.indexOf(match.id) >= 0;
  });
}

function isKeyNode(match, storylines) {
  return (storylines || []).some(function (s) {
    return (s.keyNodes || []).indexOf(match.id) >= 0;
  });
}

/**
 * 计算一场比赛的最终星级与故事线加成
 * @param match  赛程层记录 {id,h,a,...}
 * @param recMap 推荐层按 m 索引（可为空）
 * @param rivalries 焦点对阵表
 * @param storylines 故事线层
 * @param followed 关注球队 id 数组
 * @return {star, base, stories, keyNode, bonuses:[]}
 */
function evaluate(match, recMap, rivalries, storylines, followed) {
  followed = followed || [];
  var rec = recMap && recMap[match.id];
  var stories = storylinesOf(match, storylines);
  var keyNode = isKeyNode(match, storylines);
  var rivalry = rivalryOf(match, rivalries);
  var bonuses = [];

  // 基准星级：人工推荐层 > 焦点对阵/六强内战(★★★候选) > 故事线节点(★★) > 普通(★)
  var base = 1;
  if (rec && rec.star) base = rec.star;
  else if (rivalry || isBigSixClash(match)) base = 3;
  else if (stories.length) base = 2;

  var star = base;
  if (keyNode && star < 3) { star = 3; bonuses.push('故事线关键节点'); }
  if (followed.indexOf(match.h) >= 0 || followed.indexOf(match.a) >= 0) {
    if (star < 2) { star = 2; bonuses.push('关注球队'); }
  }

  return {
    star: star,
    base: base,
    stories: stories,
    storyIds: stories.map(function (s) { return s.id; }),
    keyNode: keyNode,
    rivalry: rivalry ? rivalry.zh : null,
    rec: rec || null,
    bonuses: bonuses
  };
}

// ---------- 夜猫指数 ----------
// W = star×10 + 故事线加成(0/5/10)；指数 = W ÷ (1 + 睡眠成本)

function storyBonus(ev) {
  if (ev.keyNode) return 10;
  if (ev.storyIds.length) return 5;
  return 0;
}

function owlIndex(ev, match) {
  var w = ev.star * 10 + storyBonus(ev);
  return w / (1 + tierOf(match).cost);
}

// ---------- 今晚之选 ----------
// 当日最高星级为 Hero；并列→睡眠成本低者优先；仍并列→故事线节点优先；其余 ★★ 以上进今日加餐

function pickToday(matches, recMap, rivalries, storylines, followed) {
  var evs = matches
    // tbd 场次时间未定，不担任今晚之选（今日页仍会以「时间待定」列出）
    .filter(function (m) { return m.st === 'sched' && !m.tbd; })
    .map(function (m) {
      var ev = evaluate(m, recMap, rivalries, storylines, followed);
      return { m: m, ev: ev, index: owlIndex(ev, m) };
    });

  evs.sort(function (x, y) {
    if (y.ev.star !== x.ev.star) return y.ev.star - x.ev.star;
    var cx = tierOf(x.m).cost, cy = tierOf(y.m).cost;
    if (cx !== cy) return cx - cy;
    var sx = storyBonus(x.ev), sy = storyBonus(y.ev);
    if (sy !== sx) return sy - sx;
    return y.index - x.index;
  });

  return {
    hero: evs[0] || null,
    extras: evs.slice(1).filter(function (e) { return e.ev.star >= 2; })
  };
}

// ---------- 0-1 背包：本周最优组合 ----------
// 价值 = 夜猫指数×10（取整），重量 = 睡眠成本×2（半小时间隔取整）

function knapsack(entries, budgetHours) {
  var cap = Math.round(budgetHours * 2);
  var n = entries.length;
  var val = entries.map(function (e) { return Math.round(e.index * 10); });
  var wt = entries.map(function (e) { return Math.round(tierOf(e.m).cost * 2); });
  // 二维 DP，避免一维滚动数组下 pick 标记被覆盖的回溯错误
  var i, w;
  var dp = [];
  for (i = 0; i <= n; i++) {
    dp[i] = [];
    for (w = 0; w <= cap; w++) dp[i][w] = 0;
  }
  for (i = 1; i <= n; i++) {
    for (w = 0; w <= cap; w++) {
      dp[i][w] = dp[i - 1][w];
      if (wt[i - 1] <= w && dp[i - 1][w - wt[i - 1]] + val[i - 1] > dp[i][w]) {
        dp[i][w] = dp[i - 1][w - wt[i - 1]] + val[i - 1];
      }
    }
  }
  var chosen = [];
  w = cap;
  for (i = n; i >= 1; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      chosen.unshift(entries[i - 1]);
      w -= wt[i - 1];
    }
  }
  return chosen;
}

function planWeek(matches, recMap, rivalries, storylines, followed, budget) {
  budget = budget || 4.0;
  var evs = matches
    // tbd 场次开球时间未定，成本档不可信，不进背包规划
    .filter(function (m) { return m.st === 'sched' && !m.tbd; })
    .map(function (m) {
      var ev = evaluate(m, recMap, rivalries, storylines, followed);
      return { m: m, ev: ev, index: owlIndex(ev, m) };
    })
    .sort(function (a, b) { return b.index - a.index; });

  var best = knapsack(evs, budget);
  var bestIds = {};
  best.forEach(function (e) { bestIds[e.m.id] = true; });
  var alt = evs.filter(function (e) { return !bestIds[e.m.id]; }).slice(0, 3);

  var usedCost = best.reduce(function (s, e) { return s + tierOf(e.m).cost; }, 0);
  // evs 一并返回供页面复用（focal/highlight 等），避免对同批场次二次全量 evaluate
  return { best: best, alt: alt, budget: budget, used: usedCost, evs: evs };
}

// ---------- 雷区预警 ----------
// 睡眠成本 ≥ S3 且 星级 ≤ ★ 且 不属于任何故事线节点

function minefield(matches, recMap, rivalries, storylines, followed) {
  return matches
    // tbd 场次开球时间未定，S 档不可信，不进雷区
    .filter(function (m) { return m.st === 'sched' && !m.tbd; })
    .map(function (m) { return { m: m, ev: evaluate(m, recMap, rivalries, storylines, followed) }; })
    .filter(function (e) {
      return tierOf(e.m).cost >= 3.5 && e.ev.star <= 1 && e.ev.storyIds.length === 0;
    })
    .map(function (e) {
      e.reason = '凌晨 ' + tierOf(e.m).label + ' 档，看点有限，建议睡觉';
      return e;
    });
}

// ---------- 补番推荐 ----------
// 本季已赛高分场次（replay 标记优先，星级降序）

function replays(matches, recMap, limit) {
  limit = limit || 3;
  var recMapSafe = recMap || {};
  return matches
    // 已赛口径统一走 isFinished（'done'/'ft' 双认，与各页一致）
    .filter(isFinished)
    .map(function (m) {
      var rec = recMapSafe[m.id];
      var star = rec ? rec.star : 1;
      return { m: m, star: star, replay: rec ? !!rec.replay : false };
    })
    .sort(function (a, b) {
      if (a.replay !== b.replay) return b.replay ? 1 : -1;
      return b.star - a.star;
    })
    .slice(0, limit);
}

// ---------- 下一场焦点战（无球日降级用） ----------

function nextFocal(matches, recMap, rivalries, storylines, followed, nowTs) {
  var future = matches
    .filter(function (m) {
      // tbd 占位时间不可信，不作为焦点战倒计时目标
      return m.st === 'sched' && !m.tbd && ts(m.t) > nowTs;
    })
    .map(function (m) {
      var ev = evaluate(m, recMap, rivalries, storylines, followed);
      return { m: m, ev: ev };
    })
    .sort(function (a, b) {
      if (b.ev.star !== a.ev.star) return b.ev.star - a.ev.star;
      return ts(a.m.t) - ts(b.m.t);
    });
  return future[0] || null;
}

// ---------- 倒计时 ----------

function countdown(targetTs, nowTs) {
  var diff = Math.max(0, targetTs - nowTs);
  var d = Math.floor(diff / 86400000);
  var h = Math.floor((diff % 86400000) / 3600000);
  var mi = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  return { d: d, h: h, m: mi, s: s, over: diff <= 0 };
}

function ts(t) {
  var m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600000;
}

module.exports = {
  TIERS: TIERS,
  parseMin: parseMin,
  dateOf: dateOf,
  owlDay: owlDay,
  nightOf: nightOf,
  sleepTier: sleepTier,
  tierOf: tierOf,
  isFinished: isFinished,
  matchState: matchState,
  MATCH_DURATION_MS: MATCH_DURATION_MS,
  bjDateStr: bjDateStr,
  mondayOfWall: mondayOfWall,
  weekStartBJ: weekStartBJ,
  settlePred: settlePred,
  rivalryOf: rivalryOf,
  isBigSixClash: isBigSixClash,
  storylinesOf: storylinesOf,
  evaluate: evaluate,
  storyBonus: storyBonus,
  owlIndex: owlIndex,
  pickToday: pickToday,
  knapsack: knapsack,
  planWeek: planWeek,
  minefield: minefield,
  replays: replays,
  nextFocal: nextFocal,
  countdown: countdown,
  ts: ts,
  BIG_SIX: BIG_SIX
};
