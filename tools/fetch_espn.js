/**
 * M1.1b 全量赛程抓取（原始数据落盘）
 * 主源：ESPN site API（免密钥；按月分块 + limit=300 规避全季超时/截断）
 * 校验源：OpenLigaDB（德甲官方轮次，供轮次聚类算法对照）
 * 产物：tools/raw/espn_{LG}.json / openliga_bl1.json（瘦身：仅保留引擎所需字段）
 * 用法：node tools/fetch_espn.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RAW_DIR = path.join(__dirname, 'raw');
if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const LEAGUES = [
  { lg: 'PL', espn: 'eng.1' },
  { lg: 'PD', espn: 'esp.1' },
  { lg: 'SA', espn: 'ita.1' },
  { lg: 'BL', espn: 'ger.1' },
  { lg: 'FL', espn: 'fra.1' }
];
// 2026-27 赛季跨度（北京时间 2026-08 ～ 2027-05）
const MONTHS = (function () {
  const arr = [];
  for (let y = 2026, m = 8; y * 12 + m <= 2027 * 12 + 5; m++) {
    arr.push({ y, m });
    if (m === 12) { y += 1; m = 0; }
  }
  return arr;
})();

function monthRange(y, m) {
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return `${y}${mm}01-${y}${mm}${last}`;
}

// ESPN 拦截 Node TLS 指纹（ECONNRESET），curl 可正常访问 → execFile 调 curl
function getJSON(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '--max-time', '40', '--compressed', url], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`JSON parse fail (${stdout.length}B) ${url.slice(0, 80)}`)); }
    });
  });
}

function slimEvent(e) {
  const c = e.competitions[0];
  const home = c.competitors.find(x => x.homeAway === 'home');
  const away = c.competitors.find(x => x.homeAway === 'away');
  const score = (x) => (x && x.score != null && x.score !== '' ? String(x.score) : null);
  return {
    id: e.id,
    dateUTC: e.date,                       // 含 Z，北京时间 = +8
    state: e.status.type.state,            // pre / post / in
    statusDetail: e.status.type.detail,    // Postponed / Full-Time 等
    timeValid: c.timeValid === true,       // false → tbd 开球待定
    home: home ? home.team.displayName : null,
    away: away ? away.team.displayName : null,
    homeScore: score(home),
    awayScore: score(away)
  };
}

async function fetchLeague(lg) {
  const map = new Map(); // event id 去重（跨月重抓安全）
  for (const { y, m } of MONTHS) {
    const url = `${ESPN_BASE}/${lg.espn}/scoreboard?dates=${monthRange(y, m)}&limit=300`;
    let j;
    for (let retry = 0; ; retry++) {
      try { j = await getJSON(url); break; }
      catch (err) {
        if (retry >= 2) throw err;
        await new Promise(r => setTimeout(r, 1500 * (retry + 1)));
      }
    }
    (j.events || []).forEach(e => {
      const s = slimEvent(e);
      if (s.home && s.away) map.set(s.id, s);
    });
    await new Promise(r => setTimeout(r, 350)); // 温和限速
  }
  const all = [...map.values()].sort((a, b) => a.dateUTC.localeCompare(b.dateUTC));
  const file = path.join(RAW_DIR, `espn_${lg.lg}.json`);
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  const played = all.filter(x => x.state === 'post').length;
  const tbd = all.filter(x => !x.timeValid).length;
  console.log(`${lg.lg}: ${all.length} 场（已赛 ${played}，tbd ${tbd}）${all.length ? all[0].dateUTC + ' ~ ' + all[all.length - 1].dateUTC : ''} -> ${path.basename(file)}`);
  return all;
}

async function fetchOpenLiga() {
  const j = await getJSON('https://api.openligadb.de/getmatchdata/bl1/2026');
  const slim = j.map(m => ({
    matchID: m.matchID,
    dateUTC: m.matchDateTimeUTC,
    finished: m.matchIsFinished,
    round: m.group.groupOrderID,           // 官方 Spieltag（聚类算法对照基准）
    home: m.team1.teamName,
    away: m.team2.teamName
  }));
  fs.writeFileSync(path.join(RAW_DIR, 'openliga_bl1.json'), JSON.stringify(slim, null, 1));
  console.log(`OpenLigaDB BL: ${slim.length} 场，轮次 ${Math.min(...slim.map(x => x.round))}–${Math.max(...slim.map(x => x.round))}`);
}

(async () => {
  const t0 = Date.now();
  const results = {};
  for (const lg of LEAGUES) results[lg.lg] = await fetchLeague(lg);
  await fetchOpenLiga();
  const total = Object.values(results).reduce((s, a) => s + a.length, 0);
  console.log(`合计 ${total} 场，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // 期望：PL/PD/SA=380，BL/FL=306
  const expect = { PL: 380, PD: 380, SA: 380, BL: 306, FL: 306 };
  Object.entries(expect).forEach(([k, v]) => {
    const got = results[k].length;
    console.log(`${k}: ${got}/${v} ${got === v ? 'OK' : '!! 数量异常'}`);
  });
})().catch(err => { console.error('FETCH FAILED:', err.message); process.exit(1); });
