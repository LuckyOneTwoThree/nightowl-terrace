/**
 * M1.1d 解析合并：ESPN 原始数据 → miniprogram/data/fixtures.full.json
 * - ESPN 队名 → teams.json 三字码（norm 精确匹配 + 显式别名表，未命中即报错）
 * - 轮次聚类：按 UTC 排序，同队重复即开新轮；校验每轮 n/2 场、每队一次、总轮数 38/34
 * - BL 轮次与 OpenLigaDB 官方 Spieltag 对照（±2 日内同对阵）
 * - UTC → 北京时间（+8，无时区标记）；s 档复用 engine.sleepTier
 * - tbd = !timeValid；st: post→done / Postponed→pp / 其余 sched；sc 由比分合成
 * - 附带完整性检查：推荐层/故事线层引用的 match id 是否可解析
 * 用法：node tools/build_fixtures.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAW = p => path.join(__dirname, 'raw', p);
const DATA = p => path.join(ROOT, 'miniprogram', 'data', p);
const engine = require(path.join(ROOT, 'miniprogram', 'utils', 'engine.js'));
const teams = require(DATA('teams.json'));
const seed = require(DATA('fixtures.seed.json'));

const LGS = [
  { lg: 'PL', file: 'espn_PL.json', n: 20, rounds: 38 },
  { lg: 'PD', file: 'espn_PD.json', n: 20, rounds: 38 },
  { lg: 'SA', file: 'espn_SA.json', n: 20, rounds: 38 },
  { lg: 'BL', file: 'espn_BL.json', n: 18, rounds: 34 },
  { lg: 'FL', file: 'espn_FL.json', n: 18, rounds: 34 }
];

// ESPN 命名 → 三字码 显式别名（norm 后精确匹配之外的特殊情况）
const ALIAS = {
  PL: { 'brightonhovealbion': 'BHA', 'afcbournemouth': 'BOU' },
  PD: { 'barcelona': 'BAR', 'atleticomadrid': 'ATM', 'athleticclub': 'ATH', 'deportivo': 'DEP', 'malaga': 'MAL' },
  SA: { 'internazionale': 'INT' },
  BL: {
    '1fcunionberlin': 'FCU', 'fccologne': 'KOE', 'tsghoffenheim': 'TSG', 'mainz': 'MAI',
    'scpaderborn07': 'SCP', 'borussamonchengladbach': 'BMG', 'svelversberg': 'ELV',
    'hamburgsv': 'HSV', 'scfreiburg': 'SCF', 'fcaugsburg': 'FCA'
  },
  FL: { 'asmonaco': 'MCO', 'staderennais': 'REN', 'ajauxerre': 'AUX', 'lehavreac': 'HAV' }
};

function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildTeamMap(lg) {
  const dict = teams.filter(t => t.league === lg);
  const byNorm = {};
  dict.forEach(t => { byNorm[norm(t.en)] = t.id; });
  const alias = ALIAS[lg] || {};
  const map = {}; // espnName → code
  const raw = JSON.parse(fs.readFileSync(RAW(LGS.find(x => x.lg === lg).file)));
  const names = new Set();
  raw.forEach(m => { names.add(m.home); names.add(m.away); });
  const unmapped = [];
  [...names].forEach(name => {
    const n = norm(name);
    if (byNorm[n]) { map[name] = byNorm[n]; return; }
    if (alias[n]) { map[name] = alias[n]; return; }
    unmapped.push(name);
  });
  if (unmapped.length) throw new Error(`${lg} 未映射队名: ${unmapped.join(' / ')}`);
  // 双向校验：每个 code 恰被一个 ESPN 名命中
  const hit = {};
  Object.values(map).forEach(c => { hit[c] = (hit[c] || 0) + 1; });
  const dup = Object.entries(hit).filter(([, k]) => k !== 1);
  if (dup.length) throw new Error(`${lg} 映射多义: ${JSON.stringify(dup)}`);
  const missing = dict.filter(t => !hit[t.id]);
  if (missing.length) throw new Error(`${lg} 字典未被覆盖: ${missing.map(t => t.id).join(',')}`);
  return map;
}

function toBeijing(dateUTC) { // "2026-08-21T19:00Z" → "2026-08-22T03:00"
  const d = new Date(dateUTC);
  const b = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = x => String(x).padStart(2, '0');
  return b.getUTCFullYear() + '-' + p(b.getUTCMonth() + 1) + '-' + p(b.getUTCDate()) +
    'T' + p(b.getUTCHours()) + ':' + p(b.getUTCMinutes());
}

/**
 * 轮次分配 v3（冻结 + 回溯精确分解）：
 * 1) 冻结：同日场次恰为 n/2 且每队一次 → 整轮冻结（占位日期块 / 单日整轮）
 * 2) 回溯：剩余场次按日期序，逐场尝试「日期最近的可用轮」或开新轮，
 *    约束：轮容量 n/2、同轮同队唯一、新轮总数恰为剩余场次/cap —— 精确分解必有解
 *    （五联赛已验证：每队主客 n-1 场、每对恰相遇两次，即完美匹配分解存在）
 * 3) 按每轮中位日期重排轮号（BL 对照 OpenLigaDB 90/90 一致）
 */
function assignRounds(items, n) {
  const cap = n / 2;
  const median = r => {
    const arr = r.items || r;
    const ds = arr.map(m => m.dateUTC).sort();
    return ds[Math.floor(ds.length / 2)];
  };

  // 1) 日期块冻结
  const byDate = new Map();
  items.forEach(m => {
    const d = m.dateUTC.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(m);
  });
  const frozen = [];
  const rest = [];
  for (const [d, ms] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ts = new Set(ms.flatMap(m => [m.h, m.a]));
    if (ms.length === cap && ts.size === n) frozen.push(ms.slice());
    else rest.push(...ms);
  }
  rest.sort((a, b) => a.dateUTC.localeCompare(b.dateUTC));

  // 2) 回溯分解（解空间小：rest 通常 ≤ 50 场；PL 等贪心即首个可行解，无回溯）
  const targetRounds = rest.length / cap;
  if (!Number.isInteger(targetRounds)) throw new Error(`轮次分解无解：剩余 ${rest.length} 场非 cap=${cap} 整数倍`);
  let solution = null;
  const rounds = []; // { items:[], teams:Set, med:ts }
  const ts = m => new Date(m.dateUTC).getTime();

  function backtrack(i, openCount) {
    if (solution) return;
    if (i === rest.length) {
      if (rounds.every(r => r.items.length === cap)) {
        solution = rounds.map(r => r.items.slice());
      }
      return;
    }
    const m = rest[i];
    const mts = ts(m);
    // 候选轮：现有未满轮按日期邻近排序 + 可能的新轮
    const cand = [];
    rounds.forEach((r, ri) => {
      if (r.items.length < cap && !r.teams.has(m.h) && !r.teams.has(m.a)) {
        cand.push({ ri, diff: Math.abs(mts - new Date(median(r)).getTime()) });
      }
    });
    cand.sort((a, b) => a.diff - b.diff);
    for (const c of cand) {
      const r = rounds[c.ri];
      r.items.push(m); r.teams.add(m.h); r.teams.add(m.a);
      backtrack(i + 1, openCount);
      if (solution) return;
      r.items.pop(); r.teams.delete(m.h); r.teams.delete(m.a);
    }
    // 开新轮（受目标轮数约束）
    if (openCount < targetRounds) {
      const r = { items: [m], teams: new Set([m.h, m.a]) };
      rounds.push(r);
      backtrack(i + 1, openCount + 1);
      if (solution) return;
      rounds.pop();
    }
  }
  backtrack(0, 0);
  if (!solution) throw new Error(`轮次回溯无解（${rest.length} 场 / 目标 ${targetRounds} 轮）`);

  const all = [...frozen, ...solution];
  all.sort((a, b) => median(a).localeCompare(median(b)));
  return all;
}

function crossCheckBL(map, itemsWithR) {
  const olg = JSON.parse(fs.readFileSync(RAW('openliga_bl1.json')));
  const rev = {}; // code → norm(ESPN name)
  Object.entries(map).forEach(([k, v]) => { rev[v] = norm(k); });
  const olgN = olg.map(m => ({
    home: norm(m.home), away: norm(m.away), round: m.round, ts: new Date(m.dateUTC).getTime()
  }));
  let checked = 0, agree = 0;
  const mismatch = [];
  itemsWithR.forEach(m => {
    const cand = olgN.filter(x => x.home === rev[m.h] && x.away === rev[m.a] &&
      Math.abs(x.ts - new Date(m._d).getTime()) < 3 * 86400e3);
    if (cand.length) {
      checked++;
      if (cand[0].round === m.r) agree++;
      else mismatch.push(`${m.id}: 聚类r${m.r} vs OpenLigaDB r${cand[0].round}`);
    }
  });
  return { checked, agree, mismatch };
}

// ---------- 主流程 ----------
const out = [];
const report = [];
const maps = {};
for (const cfg of LGS) {
  const map = buildTeamMap(cfg.lg);
  maps[cfg.lg] = map;
  const raw = JSON.parse(fs.readFileSync(RAW(cfg.file)));
  const items = raw.map(m => ({
    ...m, h: map[m.home], a: map[m.away]
  })).sort((x, y) => x.dateUTC.localeCompare(y.dateUTC));

  const rounds = assignRounds(items, cfg.n);
  // 轮次校验
  const sizeOK = rounds.every(r => r.length === cfg.n / 2);
  const teamOnce = rounds.every(r => {
    const s = new Set(); r.forEach(m => { s.add(m.h); s.add(m.a); });
    return s.size === cfg.n;
  });
  report.push(`${cfg.lg}: ${items.length}场 / 聚类${rounds.length}轮(期望${cfg.rounds}) ` +
    `每轮${cfg.n / 2}场:${sizeOK ? 'OK' : 'FAIL'} 每队一次:${teamOnce ? 'OK' : 'FAIL'}`);
  if (!sizeOK || !teamOnce || rounds.length !== cfg.rounds) {
    rounds.forEach((r, i) => {
      if (r.length !== cfg.n / 2) report.push(`  !! ${cfg.lg} 轮${i + 1} 场数=${r.length}: ${r.map(m => m.h + '-' + m.a + '@' + m.dateUTC.slice(0, 10)).join(' ')}`);
    });
  }

  rounds.forEach((r, ri) => {
    r.forEach(m => {
      const t = toBeijing(m.dateUTC);
      const postponed = /postpon/i.test(m.statusDetail || '');
      const st = m.state === 'post' ? 'done' : (postponed ? 'pp' : 'sched');
      const sc = (m.state === 'post' && m.homeScore != null && m.awayScore != null)
        ? `${m.homeScore}-${m.awayScore}` : null;
      out.push({
        l: cfg.lg, r: ri + 1, id: `${cfg.lg}-${ri + 1}-${m.h}-${m.a}`,
        t, tbd: !m.timeValid, st, h: m.h, a: m.a,
        s: engine.sleepTier(t).tier, sc, tv: null,
        _d: m.dateUTC // BL 对照用，写出前剔除
      });
    });
  });
}

// SCG（德国超级杯）从种子保留
seed.filter(m => m.l === 'SCG').forEach(m => out.push({ ...m }));

// BL 轮次对照（依赖 _d，剔除前执行）
const bl = crossCheckBL(maps.BL, out.filter(m => m.l === 'BL'));
out.forEach(m => { delete m._d; });

out.sort((x, y) => x.t.localeCompare(y.t) || x.id.localeCompare(y.id));
fs.writeFileSync(DATA('fixtures.full.json'), JSON.stringify(out));

// ---------- 报告 ----------
console.log(report.join('\n'));
console.log(`BL 轮次对照 OpenLigaDB: ${bl.agree}/${bl.checked} 一致${bl.mismatch.length ? '  差异:\n  ' + bl.mismatch.join('\n  ') : ''}`);

// 推荐层/故事线层引用完整性
const ids = new Set(out.map(m => m.id));
const recs = require(DATA('recommendations.seed.json'));
const orphanRecs = recs.filter(r => !ids.has(r.m));
console.log(`推荐层引用: ${recs.length - orphanRecs.length}/${recs.length} 可解析${orphanRecs.length ? '；失联: ' + orphanRecs.map(r => r.m).join(', ') : ''}`);
const story = require(DATA('storylines.json'));
const orphanNodes = [];
story.forEach(s => (s.nodes || []).forEach(n => { if (!ids.has(n)) orphanNodes.push(s.id + ':' + n); }));
console.log(`故事线节点: ${orphanNodes.length ? '失联 ' + orphanNodes.join(', ') : '全部可解析'}`);

const st = { done: 0, sched: 0, pp: 0, tbd: 0 };
out.forEach(m => { st[m.st]++; if (m.tbd) st.tbd++; });
console.log(`产出 fixtures.full.json：${out.length} 条（done ${st.done} / sched ${st.sched} / pp ${st.pp} / tbd ${st.tbd}），${out[0].t} ~ ${out[out.length - 1].t}`);
