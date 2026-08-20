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
  sevilla: 'SEV', sevilla: 'SEV', valencia: 'VAL', valenciacf: 'VAL',
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

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse fail')); }
      });
    }).on('error', reject);
  });
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// 当前北京时间近期窗口 YYYYMMDD-YYYYMMDD（过去 3 天 ～ 明天）
function getRecentDateRange() {
  const now = Date.now() + 8 * 3600000;
  const start = new Date(now - 3 * 86400000);
  const end = new Date(now + 86400000);
  const sStr = `${start.getUTCFullYear()}${pad2(start.getUTCMonth() + 1)}${pad2(start.getUTCDate())}`;
  const eStr = `${end.getUTCFullYear()}${pad2(end.getUTCMonth() + 1)}${pad2(end.getUTCDate())}`;
  return `${sStr}-${eStr}`;
}

exports.main = async (event) => {
  const db = cloud.database();
  const _ = db.command;
  const summary = { synced: 0, updated: [], settled: null };

  try {
    // 1. 手动单场/批量补录处理分支
    if (event && event.manual) {
      const items = Array.isArray(event.manual) ? event.manual : [event.manual];
      for (const item of items) {
        if (item.id && /^\d+-\d+$/.test(item.score)) {
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
      // 2. 自动从 ESPN 抓取近期完赛场次
      const range = getRecentDateRange();
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

            // 队名映射未命中 → 跳过并记录（比错配写错场次安全；日志便于补 ALIAS 变体）
            const hCode = ALIAS[norm(home.team.displayName)];
            const aCode = ALIAS[norm(away.team.displayName)];
            if (!hCode || !aCode) {
              (summary.unknown = summary.unknown || []).push({
                lg: lg.lg, h: home.team.displayName, a: away.team.displayName
              });
              continue;
            }
            const scoreStr = `${home.score}-${away.score}`;

            // 在 fixtures 中查找该联赛匹配主客队且尚未完赛（或无比分）的记录
            const cand = await db.collection('fixtures').where({
              l: lg.lg,
              h: hCode,
              a: aCode,
              sc: _.or(_.eq(null), _.eq(''))
            }).limit(1).get();

            if (cand.data && cand.data.length > 0) {
              const target = cand.data[0];
              await db.collection('fixtures').doc(target._id).update({
                data: { st: 'done', sc: scoreStr, settled: false }
              });
              summary.synced++;
              summary.updated.push({ id: target.id, sc: scoreStr, h: hCode, a: aCode });
            }
          }
        } catch (lgErr) {
          console.warn(`同步 ${lg.lg} 比分失败:`, lgErr.message);
        }
      }
    }

    // 3. 联动触发 settleMatches 结算预测与总榜
    try {
      const settleRes = await cloud.callFunction({ name: 'settleMatches', data: {} });
      summary.settled = (settleRes && settleRes.result) || null;
    } catch (settleErr) {
      summary.settledError = settleErr.message;
    }

    return { ok: true, ...summary };
  } catch (err) {
    return { ok: false, error: err.message, ...summary };
  }
};
