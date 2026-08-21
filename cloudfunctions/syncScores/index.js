/**
 * 云函数：syncScores 完赛比分自动同步与结算联动
 * 触发：定时（每 15 分钟）或手动管理调用
 * 职责：
 *   1. 扫描 ESPN 接口获取近期完赛场次（state='post'）及其比分；
 *   2. 匹配并更新 fixtures 集合中对应场次的 st='done' 与 sc='X-Y'，标记 settled=false；
 *   3. 支持手动参数录入（event.manual: { id, score }）；
 *   4. 触发 settleMatches 结算链路，使预测积分与 standings 排行榜即时生效。
 */
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LEAGUES = [
  { lg: 'PL', espn: 'eng.1' },
  { lg: 'PD', espn: 'esp.1' },
  { lg: 'SA', espn: 'ita.1' },
  { lg: 'BL', espn: 'ger.1' },
  { lg: 'FL', espn: 'fra.1' }
];

// ESPN displayName（norm 归一化后）→ 项目三字码 全量映射
// 底表：teams.js 全部 96 支（norm(en) → id）+ ESPN 常见变体全名；
// 不再使用 slice(0,3) 兜底——错配（如 realmadrid→REA）会把比分写进错误场次，宁缺勿错
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
  parisfc: 'PAC', troyes: 'TRO', estactroyes: 'TRO', lemans: 'LEM', lemansfc: 'LEM'
};

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getJSON(url, retries = 1) {
  return new Promise((resolve, reject) => {
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
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP error ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse fail')); }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => {
          getJSON(url, retries - 1).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });

    req.end();
  });
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

// 当前北京时间近期窗口 YYYYMMDD-YYYYMMDD（默认过去 14 天 ～ 明天，杜绝历史漏抓）
function getRecentDateRange(daysBack = 14, daysAhead = 1) {
  const now = Date.now() + 8 * 3600000;
  const start = new Date(now - daysBack * 86400000);
  const end = new Date(now + daysAhead * 86400000);
  const sStr = `${start.getUTCFullYear()}${pad2(start.getUTCMonth() + 1)}${pad2(start.getUTCDate())}`;
  const eStr = `${end.getUTCFullYear()}${pad2(end.getUTCMonth() + 1)}${pad2(end.getUTCDate())}`;
  return `${sStr}-${eStr}`;
}

// manual 补录分支的管理员白名单：填入开发者 openid 后开放（获取方式：开发者工具
// 「云开发 → 用户管理」，或先放行一次 seal 的 console 日志 wxCtx.OPENID）。
// 安全默认态：空数组 = 拒绝所有人——微信云函数无法配置自定义环境变量，
// 不能走 process.env 下发（恒为空会导致白名单形同虚设、全员可改比分，四轮 P0-1）
const ADMIN_OPENIDS = [];

exports.main = async (event) => {
  const db = cloud.database();
  const _ = db.command;
  const summary = { synced: 0, updated: [], settled: null };

  try {
    // 1. 手动单场/批量补录处理分支（仅管理员：可录入任意比分并联动结算）
    if (event && event.manual) {
      const wxCtx = cloud.getWXContext();
      const openId = wxCtx.OPENID || '';
      const isAdmin = !!openId && ADMIN_OPENIDS.includes(openId);
      if (!isAdmin) {
        return { ok: false, error: 'forbidden: admin only' };
      }
      const items = Array.isArray(event.manual) ? event.manual : [event.manual];
      for (const item of items) {
        if (item.id && /^\d+-\d+$/.test(item.score)) {
          // 比分修正联动（四轮 P2-7）：若该场已按旧比分结算过，先回滚受影响用户的
          // standings/users 旧积分并清除预测结算标记，随后 settleMatches 按新比分重结；
          // 否则补录只改 fixtures、已结算预测永久锁定旧结果
          try {
            const settledOld = await fetchAll(db, 'predictions', { m: item.id, settledAt: _.exists(true) }, 500);
            if (settledOld.length) {
              const oldPerGid = {};
              for (const p of settledOld) {
                const uid = p.uid || p._openid || '';
                if (!uid) continue;
                const g = p.gid || 'default';
                oldPerGid[g] = oldPerGid[g] || {};
                oldPerGid[g][uid] = oldPerGid[g][uid] || { pts: 0, hit: 0 };
                oldPerGid[g][uid].pts += (p.pts || 0);
                if (p.hit) oldPerGid[g][uid].hit++;
              }
              for (const gid of Object.keys(oldPerGid)) {
                for (const uid of Object.keys(oldPerGid[gid])) {
                  const o = oldPerGid[gid][uid];
                  const sRes = await db.collection('standings').where({ gid, uid }).limit(1).get();
                  if (sRes.data.length) {
                    await db.collection('standings').doc(sRes.data[0]._id).update({
                      data: { pts: _.inc(-o.pts), hitCount: _.inc(-o.hit), updatedTs: Date.now() }
                    });
                  }
                  const uRes = await db.collection('users').where({ uid }).limit(1).get();
                  if (uRes.data.length) {
                    await db.collection('users').doc(uRes.data[0]._id).update({
                      data: { seasonPts: _.inc(-o.pts), hitCount: _.inc(-o.hit), updatedTs: Date.now() }
                    });
                  }
                }
              }
              // 清除结算标记允许重结（tampered 一并复位：旧比分判定的篡改/迟封随修正重算）
              for (const p of settledOld) {
                await db.collection('predictions').doc(p._id).update({
                  data: { settledAt: null, revealed: false, tampered: false, voidReason: null }
                });
              }
            }
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
      const daysBack = (event && Number(event.days)) || 14;
      const range = (event && event.range) || getRecentDateRange(daysBack, 1);
      
      for (const lg of LEAGUES) {
        try {
          const url = `${ESPN_BASE}/${lg.espn}/scoreboard?dates=${range}&limit=100`;
          const j = await getJSON(url);
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

            // 场次匹配加日期邻近约束（四轮 P2-6）：先按 ESPN 比赛日的北京日期精确命中，
            // 避免同季重复对阵（杯赛/tbd 占位）时把比分写到错误场次
            const mD = String(e.date || '').slice(0, 10);
            const matchDay = mD ? toStrOf(Date.parse(mD + 'T00:00:00Z') + 8 * 3600000) : null;
            let cand = { data: [] };
            if (matchDay) {
              cand = await db.collection('fixtures').where({
                l: lg.lg, h: hCode, a: aCode,
                t: _.gte(matchDay + 'T00:00').and(_.lt(matchDay + 'T23:60'))
              }).limit(5).get().catch(() => ({ data: [] }));
            }
            if (!cand.data.length) {
              // 回退：无日期匹配（无索引异常/ESPN 缺 date 字段）时退回全量组合查找
              cand = await db.collection('fixtures').where({
                l: lg.lg, h: hCode, a: aCode
              }).limit(5).get();
            }

            if (cand.data && cand.data.length > 0) {
              // 优先查找未完赛或比分不一致的场次进行更新
              const target = cand.data.find(x => x.st !== 'done' || x.sc !== scoreStr) || cand.data[0];
              if (target.st !== 'done' || target.sc !== scoreStr) {
                await db.collection('fixtures').doc(target._id).update({
                  data: { st: 'done', sc: scoreStr, settled: false }
                });
                summary.synced++;
                summary.updated.push({ id: target.id, sc: scoreStr, h: hCode, a: aCode, prevSt: target.st, prevSc: target.sc });
              }
            }
          }
        } catch (lgErr) {
          console.warn(`同步 ${lg.lg} 比分失败:`, lgErr.message);
          (summary.errors = summary.errors || []).push({ lg: lg.lg, error: lgErr.message });
        }
      }
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
