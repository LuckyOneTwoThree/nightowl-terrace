const fs = require('fs');
const path = require('path');

console.log('==============================================');
console.log('   夜猫看台 欧冠(UCL) 深度排查与全链路审计   ');
console.log('==============================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

// 1. 数据层完整性审计
console.log('--- 1. 数据层与实体关系审计 ---');
const data = require('../miniprogram/utils/data.js');
const engine = require('../miniprogram/utils/engine.js');
const decorate = require('../miniprogram/utils/decorate.js');

const allMatches = data.matchesAll();
assert(allMatches.length === 1897, `全量比赛数应为 1,897 场 (实际: ${allMatches.length})`);

const uclMatches = allMatches.filter(m => m.l === 'UCL');
assert(uclMatches.length === 144, `欧冠联赛阶段比赛数应为 144 场 (实际: ${uclMatches.length})`);

// 轮次分布检查
const roundCount = {};
uclMatches.forEach(m => {
  roundCount[m.r] = (roundCount[m.r] || 0) + 1;
});
assert(Object.keys(roundCount).length === 8, `欧冠应有 8 个轮次 (实际: ${Object.keys(roundCount).length})`);
let allRounds18 = true;
for (let r = 1; r <= 8; r++) {
  if (roundCount[r] !== 18) {
    allRounds18 = false;
    console.error(`    轮次 R${r} 场次数异常: ${roundCount[r]} (期望 18)`);
  }
}
assert(allRounds18, '欧冠全部 8 轮每轮均正好 18 场比赛');

// 36 支参赛队检查
const uclTeamSet = new Set();
uclMatches.forEach(m => {
  uclTeamSet.add(m.h);
  uclTeamSet.add(m.a);
});
assert(uclTeamSet.size === 36, `欧冠参赛队应为 36 支 (实际: ${uclTeamSet.size})`);

// 检查每支球队是否在 teams 字典中存在，且都有队徽文件
const crestsDir = path.join(__dirname, '../miniprogram/images/crests');
let allTeamsExist = true;
let allCrestsExist = true;
uclTeamSet.forEach(tid => {
  const team = data.getTeam(tid);
  if (!team) {
    allTeamsExist = false;
    console.error(`    球队缺失: ${tid}`);
  } else {
    const crestPath = path.join(crestsDir, `${tid}.png`);
    if (!fs.existsSync(crestPath)) {
      allCrestsExist = false;
      console.error(`    队徽图片缺失: ${crestPath}`);
    }
  }
});
assert(allTeamsExist, '欧冠全部 36 支球队均已注册在 teams 字典中');
assert(allCrestsExist, '欧冠全部 36 支球队的队徽本地 PNG 文件均存在');

// 检查全量 ID 唯一性
const idSet = new Set();
let hasDuplicate = false;
allMatches.forEach(m => {
  if (idSet.has(m.id)) {
    hasDuplicate = true;
    console.error(`    发现重复 ID: ${m.id}`);
  }
  idSet.add(m.id);
});
assert(!hasDuplicate, '全量 1,897 场比赛无任何重复 ID');

// 2. 推荐算法与熬夜指数审计
console.log('\n--- 2. 算法与指数评定审计 ---');
const recMap = data.getRecMap();
const rivs = data.getRivalries();
const sls = data.getStorylines();

const rmaInt = data.getMatch('UCL-1-RMA-INT');
assert(!!rmaInt, '焦点场次 UCL-1-RMA-INT 应存在');
if (rmaInt) {
  const ev = engine.evaluate(rmaInt, recMap, rivs, sls, ['RMA'], ['UCL', 'PL']);
  assert(ev.star === 3, `皇马vs国米评星应为 3 星三星推荐 (实际: ${ev.star})`);
  assert(ev.isFollowed === true, '皇马作为关注主队应被命中 isFollowed');
  assert(ev.isLeagueFollowed === true, '欧冠作为关注联赛应被命中 isLeagueFollowed');
  
  const d = decorate.dec(rmaInt, ev);
  assert(d.local === '21:00', `皇马主场(欧陆 CEST) 03:00 开球当地时间应为 21:00 (实际: ${d.local})`);
}

const livAtm = data.getMatch('UCL-1-LIV-ATM');
assert(!!livAtm, '焦点场次 UCL-1-LIV-ATM 应存在');
if (livAtm) {
  const d = decorate.dec(livAtm);
  assert(d.local === '20:00', `利物浦主场(英国 BST) 03:00 开球当地时间应为 20:00 (实际: ${d.local})`);
}

// 3. 页面场景模拟审计 (选周/选今日)
console.log('\n--- 3. 决策引擎场景仿真审计 ---');
const uclDay1Matches = data.matchesOfDay('2026-09-08');
assert(uclDay1Matches.length > 0, `2026-09-08 应有欧冠比赛 (实际: ${uclDay1Matches.length} 场)`);

const pickToday = engine.pickToday(uclDay1Matches, recMap, rivs, sls, ['RMA', 'LIV'], ['UCL']);
assert(!!pickToday, '欧冠比赛日 pickToday 应能成功挑选今日主推');
if (pickToday && pickToday.hero) {
  assert(pickToday.hero.m.l === 'UCL', `今日主推联赛应为 UCL (实际: ${pickToday.hero.m.l})`);
  console.log(`    今日主推: ${pickToday.hero.m.id} (${pickToday.hero.m.h} vs ${pickToday.hero.m.a}), 星级: ${pickToday.hero.ev.star}★, 熬夜指数: ${pickToday.hero.index}`);
}

const weekMatches = allMatches.filter(m => {
  const d = engine.owlDay(m.t);
  return d >= '2026-09-07' && d <= '2026-09-13';
});
assert(weekMatches.length >= 18, `2026-09-07~13 周计划比赛数应 >= 18 场 (实际: ${weekMatches.length})`);
const plan = engine.planWeek(weekMatches, recMap, rivs, sls, ['RMA'], 4.0, ['UCL', 'PL']);
assert(plan.evs.length > 0, `周计划 0-1 背包规划应成功安排比赛 (安排了 ${plan.evs.length} 场)`);
console.log(`    周计划预算: 4.0h, 已排比赛总耗时: ${plan.usedCost}h, 场次数: ${plan.evs.length}`);

// 4. ESPN 云同步别名覆盖审计
console.log('\n--- 4. ESPN 比分自动同步别名覆盖审计 ---');
const syncScoresCode = fs.readFileSync(path.join(__dirname, '../cloudfunctions/syncScores/index.js'), 'utf8');

// 提取 ALIAS 对象
const aliasMatch = syncScoresCode.match(/const ALIAS = \{([\s\S]*?)\};/);
assert(!!aliasMatch, 'syncScores 中应包含 ALIAS 映射表');

let allUclTeamsHaveAlias = true;
const missingAliases = [];
uclTeamSet.forEach(tid => {
  // 检查 tid 是否在 ALIAS 的值中出现
  const regex = new RegExp(`['"]?([a-z0-9]+)['"]?\\s*:\\s*['"]${tid}['"]`);
  if (!regex.test(syncScoresCode)) {
    allUclTeamsHaveAlias = false;
    missingAliases.push(tid);
  }
});
assert(allUclTeamsHaveAlias, `欧冠 36 支球队在 syncScores 中均有 ESPN 别名反查规则${missingAliases.length ? ' (缺失: ' + missingAliases.join(', ') + ')' : ''}`);

// 5. 小程序包体积安全审计
console.log('\n--- 5. 小程序代码包体积审计 ---');
function getDirSize(dir, ignorePattern) {
  let size = 0;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    if (ignorePattern && ignorePattern.test(full)) return;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      size += getDirSize(full, ignorePattern);
    } else {
      size += stat.size;
    }
  });
  return size;
}

const mpDir = path.join(__dirname, '../miniprogram');
const rawSize = getDirSize(mpDir);
const packedSize = getDirSize(mpDir, /data\/[^/]*\.json$/);
const packedKB = (packedSize / 1024).toFixed(1);
const packedMB = (packedSize / (1024 * 1024)).toFixed(2);
console.log(`    本地目录未过滤体积: ${(rawSize / 1024).toFixed(1)} KB`);
console.log(`    微信打包实际体积 (按 project.config.json 过滤 data/*.json 后): ${packedKB} KB (${packedMB} MB)`);
assert(packedSize < 2 * 1024 * 1024, `小程序主包真实上传大小必须小于 2048 KB 微信上限 (实际: ${packedKB} KB, 距上限余量: ${(2048 - packedKB).toFixed(1)} KB)`);

console.log(`\n==============================================`);
console.log(`排查测试总结: ${passed} 项通过, ${failed} 项失败`);
console.log(`==============================================`);

if (failed > 0) process.exit(1);
