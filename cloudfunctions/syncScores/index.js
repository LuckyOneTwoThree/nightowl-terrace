/**
 * 云函数：syncScores 完赛比分自动同步与结算联动
 * 触发：定时（每 15 分钟）或手动管理调用
 * 职责：
 *   1. 扫描 ESPN 开放接口获取近期完赛场次（state='post'）及其比分；
 *   2. 匹配并更新 fixtures 集合中对应场次的 st='done' 与 sc='X-Y'，标记 settled=false；
 *   3. 支持手动参数录入（event.manual: { id, score }）；
 *   4. 触发 settleMatches 结算链路，使预测积分与 standings 排行榜即时生效。
 */
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 主地址采用开放的 site.web.api 接口（规避 site.api 的 WAF 403 拦截）
const ESPN_BASES = [
  'https://site.web.api.espn.com/apis/site/v2/sports/soccer',
  'https://site.api.espn.com/apis/site/v2/sports/soccer'
];

const LEAGUES = [
  { lg: 'PL', espn: 'eng.1' },
  { lg: 'PD', espn: 'esp.1' },
  { lg: 'SA', espn: 'ita.1' },
  { lg: 'BL', espn: 'ger.1' },
  { lg: 'FL', espn: 'fra.1' },
  { lg: 'UCL', espn: 'uefa.champions' },
  { lg: 'SCG', espn: 'ger.super_cup' },
  { lg: 'SCG', espn: 'esp.super_cup' },
  { lg: 'SCG', espn: 'ita.super_cup' },
  { lg: 'SCG', espn: 'fra.super_cup' },
  { lg: 'SCG', espn: 'uefa.super_cup' }
];

// ESPN displayName（norm 归一化后）→ 项目三字码 全量映射
const ALIAS = {
  // ── 英超（PL）──
  arsenal: 'ARS', astonvilla: 'AVL', bournemouth: 'BOU', brentford: 'BRE', brighton: 'BHA',
  chelsea: 'CHE', coventrycity: 'COV', crystalpalace: 'CRY', everton: 'EVE', fulham: 'FUL',
  hullcity: 'HUL', ipswichtown: 'IPS', leedsunited: 'LEE', liverpool: 'LIV',
  manchestercity: 'MCI', manchesterunited: 'MUN', newcastleunited: 'NEW',
  nottinghamforest: 'NFO', sunderland: 'SUN', tottenhamhotspur: 'TOT',
  // ESPN 变体（全名/缩写差异）
  brightonhovealbion: 'BHA', afcbournemouth: 'BOU',

  // ── 西甲（PD）──
  realmadrid: 'RMA', fcbarcelona: 'BAR', barcelona: 'BAR', atleticomadrid: 'ATM',
  athleticbilbao: 'ATH', athleticclub: 'ATH', realbetis: 'BET', realbetisbalompie: 'BET',
  celtavigo: 'CEL', celtadevigo: 'CEL', elche: 'ELC', elchecf: 'ELC',
  espanyol: 'ESP', rcdespanyol: 'ESP', deportivolacoruna: 'DEP', deportivo: 'DEP',
  levante: 'LEV', levanteud: 'LEV', malaga: 'MAL', malagacf: 'MAL', osasuna: 'OSA',
  caosasuna: 'OSA', rayovallecano: 'RAY', racingsantander: 'RAC', realsociedad: 'RSO',
  sevilla: 'SEV', valencia: 'VAL', valenciacf: 'VAL',
  villarreal: 'VIL', villarrealcf: 'VIL', getafe: 'GET', getafecf: 'GET', alaves: 'ALA', deportivoalaves: 'ALA',

  // ── 意甲（SA）──
  intermilan: 'INT', internazionale: 'INT', inter: 'INT', acmilan: 'MIL', milan: 'MIL',
  juventus: 'JUV', juventusfc: 'JUV', napoli: 'NAP', sscnapoli: 'NAP',
  asroma: 'ROM', roma: 'ROM', lazio: 'LAZ', sslazio: 'LAZ',
  fiorentina: 'FIO', acffiorentina: 'FIO', atalanta: 'ATA', atalantabc: 'ATA',
  bologna: 'BOL', bolognafc1909: 'BOL', torino: 'TOR', torinofc: 'TOR',
  udinese: 'UDI', udinesecalcio: 'UDI', genoa: 'GEN', genoacfc: 'GEN',
  cagliari: 'CAG', cagliaricalcio: 'CAG', parma: 'PAR', parmacalcio1913: 'PAR',
  como: 'COM', como1907: 'COM', lecce: 'LEC', uslecce: 'LEC',
  sassuolo: 'SAS', ussassuolo: 'SAS', frosinone: 'FRO', frosinonecalcio: 'FRO',
  venezia: 'VEN', veneziafc: 'VEN', monza: 'MZA', acmonza: 'MZA',

  // ── 德甲（BL）──
  bayernmunich: 'FCB', bayern: 'FCB', borussiadortmund: 'BVB', dortmund: 'BVB',
  bayerleverkusen: 'B04', bayer04leverkusen: 'B04', rbleipzig: 'RBL',
  eintrachtfrankfurt: 'SGE', frankfurt: 'SGE', vfbstuttgart: 'VFB', stuttgart: 'VFB',
  freiburg: 'SCF', scfreiburg: 'SCF', hoffenheim: 'TSG', tsghoffenheim: 'TSG',
  unionberlin: 'FCU', '1fcunionberlin': 'FCU', werderbremen: 'SVW',
  mainz: 'MAI', mainz05: 'MAI', '1fsvmainz05': 'MAI',
  borussiamonchengladbach: 'BMG', gladbach: 'BMG', augsburg: 'FCA', fcaugsburg: 'FCA',
  koln: 'KOE', fckoln: 'KOE', fccologne: 'KOE',
  hamburgersv: 'HSV', hamburgsv: 'HSV', hamburger: 'HSV',
  schalke04: 'S04', fcschalke04: 'S04', paderborn: 'SCP', scpaderborn07: 'SCP',
  elversberg: 'ELV', svelversberg: 'ELV', 'sv07elversberg': 'ELV',

  // ── 法甲（FL）──
  parissaintgermain: 'PSG', psg: 'PSG', marseille: 'OM', olympiquemarseille: 'OM',
  monaco: 'MCO', asmonaco: 'MCO', lille: 'LIL', losclille: 'LIL',
  lyon: 'OL', olympiquelyon: 'OL', nice: 'NIC', ogcnice: 'NIC',
  lens: 'LEN', rclens: 'LEN', strasbourg: 'STR', rcstrasbourgalsace: 'STR',
  rennes: 'REN', staderennais: 'REN', staderennaisfc: 'REN',
  toulouse: 'TOU', fctoulouse: 'TOU', brest: 'BRT', stadebrestois29: 'BRT',
  auxerre: 'AUX', ajauxerre: 'AUX', angers: 'ANG', angerssco: 'ANG',
  lehavre: 'HAV', lehavreac: 'HAV', lorient: 'LOR', fclorient: 'LOR',
  parisfc: 'PAC', troyes: 'TRO', estactroyes: 'TRO', lemans: 'LEM', lemansfc: 'LEM',

  // ── 欧冠（UCL 非五大联赛）──
  sportingcp: 'SPO', sporting: 'SPO', fcporto: 'POR', porto: 'POR',
  fenerbahce: 'FEN', galatasaray: 'GAL', bodoglimt: 'BOD',
  shaktardonetsk: 'SHK', shakhtardonetsk: 'SHK', slaviaprague: 'SLA',
  slovanbratislava: 'SLO', clubbrugge: 'BRU', lasklinz: 'LAS',
  feyenoordrotterdam: 'FEY', feyenoord: 'FEY', psveindhoven: 'PSV',
  sabahfk: 'SAB', sabah: 'SAB', vikingfk: 'VIK', viking: 'VIK', aekathens: 'AEK'
};

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getJSON(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let finished = false;

    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout: timeoutMs
    };

    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // 释放 socket 资源，防止连接挂起
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          reject(new Error(`HTTP error ${res.statusCode}`));
        }
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse fail')); }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(new Error('Request timeout'));
      }
    });

    req.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    timer = setTimeout(() => {
      req.destroy();
      if (!finished) {
        finished = true;
        reject(new Error('Request hard timeout'));
      }
    }, timeoutMs + 1000);

    req.end();
  });
}

// 尝试多个可用节点，防止单点故障
async function fetchScoreboard(espnLeague, dateRange) {
  let lastErr = null;
  for (const base of ESPN_BASES) {
    try {
      const url = `${base}/${espnLeague}/scoreboard?dates=${dateRange}&limit=100`;
      const res = await getJSON(url, 8000);
      if (res && Array.isArray(res.events)) {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw (lastErr || new Error('Fetch scoreboard failed'));
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// 真实时间戳 → 北京日期 'YYYY-MM-DD'（与 fixtures.t 的北京墙钟口径一致）
function toStrOf(ts) {
  return new Date(ts + 8 * 3600000).toISOString().slice(0, 10);
}

// 分页拉全量（云数据库单次 limit 100；manual 回滚旧结算需拿全该场已结算预测）
async function fetchAll(db, coll, where, limit) {
  const out = [];
  const MAX = limit || 1000;
  for (let skip = 0; skip < MAX; skip += 100) {
    const res = await db.collection(coll).where(where).skip(skip).limit(100).get();
    out.push(...res.data);
    if (res.data.length < 100) break;
  }
  return out;
}

// 当前北京时间近期窗口 YYYYMMDD-YYYYMMDD（默认过去 30 天 ～ 明天，杜绝历史漏抓）
function getRecentDateRange(daysBack = 30, daysAhead = 2) {
  const now = Date.now() + 8 * 3600000;
  const start = new Date(now - daysBack * 86400000);
  const end = new Date(now + daysAhead * 86400000);
  const sStr = `${start.getUTCFullYear()}${pad2(start.getUTCMonth() + 1)}${pad2(start.getUTCDate())}`;
  const eStr = `${end.getUTCFullYear()}${pad2(end.getUTCMonth() + 1)}${pad2(end.getUTCDate())}`;
  return `${sStr}-${eStr}`;
}

// manual 补录分支的管理员白名单：填入开发者 openid 后开放
const ADMIN_OPENIDS = [];

// 结算回滚：当比分变更且该场此前已结算时，扣减 standings/users 旧积分与总场次，并清除 predictions 结算标记
async function rollbackSettledMatch(db, mid) {
  const _ = db.command;
  const settledOld = await fetchAll(db, 'predictions', { m: mid, settledAt: _.exists(true) }, 500);
  if (!settledOld.length) return;
  const oldPerGid = {};
  for (const p of settledOld) {
    const uid = p.uid || p._openid || '';
    if (!uid) continue;
    const g = p.gid || 'default';
    oldPerGid[g] = oldPerGid[g] || {};
    oldPerGid[g][uid] = oldPerGid[g][uid] || { pts: 0, hit: 0, count: 0 };
    oldPerGid[g][uid].pts += (p.pts || 0);
    oldPerGid[g][uid].count++;
    if (p.hit) oldPerGid[g][uid].hit++;
  }
  for (const gid of Object.keys(oldPerGid)) {
    for (const uid of Object.keys(oldPerGid[gid])) {
      const o = oldPerGid[gid][uid];
      const sRes = await db.collection('standings').where({ gid, uid }).limit(1).get();
      if (sRes.data.length) {
        await db.collection('standings').doc(sRes.data[0]._id).update({
          data: {
            pts: _.inc(-o.pts),
            hitCount: _.inc(-o.hit),
            totalCount: _.inc(-o.count),
            updatedTs: Date.now()
          }
        });
      }
      const uRes = await db.collection('users').where({ uid }).limit(1).get();
      if (uRes.data.length) {
        await db.collection('users').doc(uRes.data[0]._id).update({
          data: {
            seasonPts: _.inc(-o.pts),
            hitCount: _.inc(-o.hit),
            totalPreds: _.inc(-o.count),
            updatedTs: Date.now()
          }
        });
      }
    }
  }
  // 清除结算标记允许重结
  for (const p of settledOld) {
    await db.collection('predictions').doc(p._id).update({
      data: { settledAt: null, revealed: false, tampered: false, voidReason: null }
    });
  }
}

exports.main = async (event) => {
  const db = cloud.database();
  const _ = db.command;
  const summary = { synced: 0, updated: [], leaguesProcessed: 0, settled: null };

  try {
    // 1. 手动单场/批量补录处理分支（仅管理员：可录入任意比分并联动结算）
    if (event && event.manual) {
      const wxCtx = cloud.getWXContext();
      const openId = wxCtx.OPENID || '';
      const isAdmin = !ADMIN_OPENIDS.length || (!!openId && ADMIN_OPENIDS.includes(openId));
      if (!isAdmin) {
        return { ok: false, error: 'forbidden: admin only' };
      }
      const items = Array.isArray(event.manual) ? event.manual : [event.manual];
      for (const item of items) {
        if (item.id && /^\d+-\d+$/.test(item.score)) {
          // 比分修正联动：若该场已按旧比分结算过，先回滚受影响用户的 standings/users 旧积分与总场次并清除预测结算标记
          try {
            await rollbackSettledMatch(db, item.id);
          } catch (rbErr) {
            console.warn(`[syncScores] manual ${item.id} 结算回滚失败:`, rbErr.message);
          }
          const res = await db.collection('fixtures').where({ id: item.id }).update({
            data: { st: 'done', sc: item.score, settled: false }
          });
          if (res.stats && res.stats.updated) {
            summary.synced++;
            summary.updated.push({ id: item.id, sc: item.score, manual: true });
          }
        }
      }
    } else {
      // 2. 自动从 ESPN 抓取完赛场次（支持外部传入 range 或 days 自定义回溯范围）
      const daysBack = (event && Number(event.days)) || 30;
      const range = (event && event.range) || getRecentDateRange(daysBack, 2);

      // 计算窗口对应的北京时间起止字符串（按 daysBack 回溯 + 4 天前瞻，涵盖跨午夜及可能的微调）
      const startDayStr = toStrOf(Date.now() - (daysBack + 2) * 86400000);
      const endDayStr = toStrOf(Date.now() + 4 * 86400000);

      // 一次性拉取窗口期内所有场次至内存，建立 O(1) 查找索引，避免 160+ 场次循环扫库导致连接耗尽与 60s 超时
      let windowFixtures = [];
      try {
        windowFixtures = await fetchAll(db, 'fixtures', {
          t: _.gte(startDayStr + 'T00:00').and(_.lte(endDayStr + 'T23:59'))
        }, 1000);
      } catch (fetchErr) {
        console.warn('[syncScores] 窗口期按时间查询失败，尝试全量兜底:', fetchErr.message);
        try {
          windowFixtures = await fetchAll(db, 'fixtures', {}, 2000);
        } catch (fErr2) {
          windowFixtures = [];
        }
      }

      // 构建基于对阵与主客倒置的内存索引 Map
      const fixtureIndex = new Map();
      windowFixtures.forEach(f => {
        const k = `${f.l}|${f.h}|${f.a}`;
        if (!fixtureIndex.has(k)) fixtureIndex.set(k, []);
        fixtureIndex.get(k).push(f);
      });

      // 并行拉取五大联赛与欧冠完赛比分
      const leagueTasks = LEAGUES.map(async (lg) => {
        try {
          const j = await fetchScoreboard(lg.espn, range);
          const events = (j && j.events) || [];

          for (const e of events) {
            const comp = (e.competitions && e.competitions[0]) || {};
            const state = e.status && e.status.type && e.status.type.state;
            if (state !== 'post') continue; // 仅处理完赛场次

            const home = (comp.competitors || []).find(x => x.homeAway === 'home');
            const away = (comp.competitors || []).find(x => x.homeAway === 'away');
            if (!home || !away || home.score == null || away.score == null) continue;

            const hTeam = home.team || {};
            const aTeam = away.team || {};
            const hCode = ALIAS[norm(hTeam.displayName)] || ALIAS[norm(hTeam.name)] || ALIAS[norm(hTeam.shortDisplayName)];
            const aCode = ALIAS[norm(aTeam.displayName)] || ALIAS[norm(aTeam.name)] || ALIAS[norm(aTeam.shortDisplayName)];
            if (!hCode || !aCode) {
              (summary.unknown = summary.unknown || []).push({
                lg: lg.lg, h: hTeam.displayName || hTeam.name, a: aTeam.displayName || aTeam.name
              });
              continue;
            }
            const scoreStr = `${home.score}-${away.score}`;

            // 比赛日的北京日期精确换算（修正 UTC 时间戳直接截断导致跨午夜比赛日期偏移的 Bug）
            const matchDay = e.date ? toStrOf(Date.parse(e.date)) : null;

            // 内存极速查找（支持常规主客对阵及主客倒置）
            const cand1 = fixtureIndex.get(`${lg.lg}|${hCode}|${aCode}`) || [];
            const cand2 = cand1.length === 0 ? (fixtureIndex.get(`${lg.lg}|${aCode}|${hCode}`) || []) : [];
            let candDocs = cand1.length > 0 ? cand1 : cand2;

            // 若窗口期未命中（可能因延期超出窗口），单场兜底查库
            if (candDocs.length === 0) {
              const cRes = await db.collection('fixtures').where({
                l: lg.lg, h: hCode, a: aCode
              }).limit(5).get().catch(() => ({ data: [] }));
              candDocs = cRes.data || [];
              if (candDocs.length === 0) {
                const cRes2 = await db.collection('fixtures').where({
                  l: lg.lg, h: aCode, a: hCode
                }).limit(5).get().catch(() => ({ data: [] }));
                candDocs = cRes2.data || [];
              }
            }

            if (candDocs.length > 0) {
              let target = null;
              if (matchDay) {
                target = candDocs.find(x => x.t && x.t.startsWith(matchDay));
              }
              if (!target) {
                target = candDocs.find(x => x.st !== 'done') || candDocs[0];
              }

              if (target) {
                const isReversed = target.h === aCode && target.a === hCode;
                const finalScore = isReversed ? `${away.score}-${home.score}` : scoreStr;

                if (target.st !== 'done' || target.sc !== finalScore) {
                  // 比分修正联动：若该场此前已按旧比分完赛结算过，先回滚旧结算并清空 predictions.settledAt
                  if (target.st === 'done' && target.sc !== finalScore) {
                    try {
                      await rollbackSettledMatch(db, target.id);
                    } catch (rbErr) {
                      console.warn(`[syncScores] espn ${target.id} 结算回滚失败:`, rbErr.message);
                    }
                  }
                  await db.collection('fixtures').doc(target._id).update({
                    data: { st: 'done', sc: finalScore, settled: false }
                  });
                  // 同步更新内存对象状态，防止并发重复更新
                  target.st = 'done';
                  target.sc = finalScore;
                  summary.synced++;
                  summary.updated.push({ id: target.id, sc: finalScore, h: target.h, a: target.a, prevSt: target.st, prevSc: target.sc });
                }
              }
            }
          }
          summary.leaguesProcessed++;
        } catch (lgErr) {
          console.warn(`同步 ${lg.lg} 比分失败:`, lgErr.message);
          (summary.errors = summary.errors || []).push({ lg: lg.lg, error: lgErr.message });
        }
      });

      await Promise.allSettled(leagueTasks);
    }

    // 3. 联动触发 settleMatches 结算预测与总榜
    if (summary.synced > 0 || (event && event.settle)) {
      try {
        const settleRes = await cloud.callFunction({ name: 'settleMatches', data: {} });
        summary.settled = (settleRes && settleRes.result) || null;
      } catch (settleErr) {
        summary.settledError = settleErr.message;
      }
    }

    return { ok: true, ...summary };
  } catch (err) {
    return { ok: false, error: err.message, ...summary };
  }
};
