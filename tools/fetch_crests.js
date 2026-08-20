// 一次性脚本：下载 96 支队徽原图到 tools/crests_src/（node tools/fetch_crests.js）
// 数据源：luukhopman/football-logos (GitHub) → jsDelivr CDN
// 注意：本机网络有 TLS 拦截时 node https 会报证书错误，故用系统 curl 下载（curl 走系统钥匙串信任）
// 下载后执行压缩打包：node tools/compress_crests.js png → miniprogram/images/crests/
// 最后把新收录的三字码加进 miniprogram/utils/crest.js 的 BUNDLED 表
var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var BASE = 'https://cdn.jsdelivr.net/gh/luukhopman/football-logos@master/logos';

// 联赛文件夹名（URL 编码）
var LEAGUE_DIR = {
  PL: 'England%20-%20Premier%20League',
  PD: 'Spain%20-%20LaLiga',
  SA: 'Italy%20-%20Serie%20A',
  BL: 'Germany%20-%20Bundesliga',
  FL: 'France%20-%20Ligue%201'
};

// 三字码 → CDN 文件名映射（不含 .png 后缀与联赛文件夹）
var FILE_MAP = {
  // ── 英超 ──
  ARS: 'Arsenal%20FC', AVL: 'Aston%20Villa', BOU: 'AFC%20Bournemouth', BRE: 'Brentford%20FC',
  BHA: 'Brighton%20%26%20Hove%20Albion', CHE: 'Chelsea%20FC', COV: 'Coventry%20City',
  CRY: 'Crystal%20Palace', EVE: 'Everton%20FC', FUL: 'Fulham%20FC', HUL: 'Hull%20City',
  IPS: 'Ipswich%20Town', LEE: 'Leeds%20United', LIV: 'Liverpool%20FC', MCI: 'Manchester%20City',
  MUN: 'Manchester%20United', NEW: 'Newcastle%20United', NFO: 'Nottingham%20Forest',
  SUN: 'Sunderland%20AFC', TOT: 'Tottenham%20Hotspur',

  // ── 西甲 ──
  RMA: 'Real%20Madrid', BAR: 'FC%20Barcelona', ATM: 'Atl%C3%A9tico%20de%20Madrid',
  ATH: 'Athletic%20Bilbao', BET: 'Real%20Betis%20Balompi%C3%A9', CEL: 'Celta%20de%20Vigo',
  ELC: 'Elche%20CF', ESP: 'RCD%20Espanyol%20Barcelona', DEP: 'Deportivo%20A%20Coru%C3%B1a',
  LEV: 'Levante%20UD', MAL: 'M%C3%A1laga%20CF', OSA: 'CA%20Osasuna', RAY: 'Rayo%20Vallecano',
  RAC: 'Racing%20Santander', RSO: 'Real%20Sociedad', SEV: 'Sevilla%20FC', VAL: 'Valencia%20CF',
  VIL: 'Villarreal%20CF', GET: 'Getafe%20CF', ALA: 'Deportivo%20Alav%C3%A9s',

  // ── 意甲 ──
  INT: 'Inter%20Milan', MIL: 'AC%20Milan', JUV: 'Juventus%20FC', NAP: 'SSC%20Napoli',
  ROM: 'AS%20Roma', LAZ: 'SS%20Lazio', FIO: 'ACF%20Fiorentina', ATA: 'Atalanta%20BC',
  BOL: 'Bologna%20FC%201909', TOR: 'Torino%20FC', UDI: 'Udinese%20Calcio', GEN: 'Genoa%20CFC',
  CAG: 'Cagliari%20Calcio', PAR: 'Parma%20Calcio%201913', COM: 'Como%201907', LEC: 'US%20Lecce',
  SAS: 'US%20Sassuolo', FRO: 'Frosinone%20Calcio', VEN: 'Venezia%20FC', MZA: 'AC%20Monza',

  // ── 德甲 ──
  FCB: 'Bayern%20Munich', BVB: 'Borussia%20Dortmund', B04: 'Bayer%2004%20Leverkusen',
  RBL: 'RB%20Leipzig', SGE: 'Eintracht%20Frankfurt', VFB: 'VfB%20Stuttgart', SCF: 'SC%20Freiburg',
  TSG: 'TSG%201899%20Hoffenheim', FCU: '1.FC%20Union%20Berlin', SVW: 'SV%20Werder%20Bremen',
  MAI: '1.FSV%20Mainz%2005', BMG: 'Borussia%20M%C3%B6nchengladbach', FCA: 'FC%20Augsburg',
  KOE: '1.FC%20K%C3%B6ln', HSV: 'Hamburger%20SV', S04: 'FC%20Schalke%2004',
  SCP: 'SC%20Paderborn%2007', ELV: 'SV%2007%20Elversberg',

  // ── 法甲 ──
  PSG: 'Paris%20Saint-Germain', OM: 'Olympique%20Marseille', MCO: 'AS%20Monaco',
  LIL: 'LOSC%20Lille', OL: 'Olympique%20Lyon', NIC: 'OGC%20Nice', LEN: 'RC%20Lens',
  STR: 'RC%20Strasbourg%20Alsace', REN: 'Stade%20Rennais%20FC', TOU: 'FC%20Toulouse',
  BRT: 'Stade%20Brestois%2029', AUX: 'AJ%20Auxerre', ANG: 'Angers%20SCO',
  HAV: 'Le%20Havre%20AC', LOR: 'FC%20Lorient', PAC: 'Paris%20FC', TRO: 'ESTAC%20Troyes',
  LEM: 'Le%20Mans%20FC'
};

var teams = require('../miniprogram/data/teams.js');
var OUT = path.join(__dirname, 'crests_src');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// 三字码 → 联赛（teams.js 提供）
var leagueOf = {};
teams.forEach(function (t) { leagueOf[t.id] = t.league; });

var ok = 0, failed = [];
Object.keys(FILE_MAP).forEach(function (code) {
  var league = leagueOf[code];
  if (!league || !LEAGUE_DIR[league]) { failed.push(code + ': 无联赛映射'); return; }
  var url = BASE + '/' + LEAGUE_DIR[league] + '/' + FILE_MAP[code] + '.png';
  var dest = path.join(OUT, code + '.png');
  try {
    execSync('curl -sS --retry 2 --max-time 30 -o "' + dest + '" "' + url + '"', { stdio: 'pipe' });
    ok++;
  } catch (e) {
    failed.push(code + ': ' + ((e.stderr && e.stderr.toString().trim()) || '下载失败'));
  }
});

console.log('下载完成 ' + ok + '/' + Object.keys(FILE_MAP).length + ' → ' + OUT);
if (failed.length) {
  console.log('失败:\n' + failed.join('\n'));
  process.exit(1);
}
