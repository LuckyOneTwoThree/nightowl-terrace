/**
 * 完赛比分更新与结算全链路集成自动化测试
 * 用法：node tools/test_score_pipeline.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const updateScoreTool = require(path.join(ROOT, 'tools', 'update_score.js'));
const engine = require(path.join(ROOT, 'miniprogram', 'utils', 'engine.js'));
const decorate = require(path.join(ROOT, 'miniprogram', 'utils', 'decorate.js'));
const data = require(path.join(ROOT, 'miniprogram', 'utils', 'data.js'));

let passCount = 0;
let failCount = 0;

function assert(condition, desc) {
  if (condition) {
    console.log('  ✅ ' + desc);
    passCount++;
  } else {
    console.error('  ❌ FAIL: ' + desc);
    failCount++;
  }
}

console.log('=== 1. 测试 update_score.js 比分校验与文件写入 ===');

// 比分格式校验测试
assert(updateScoreTool.validateScore('2-1') === true, '合法比分 "2-1" 应该返回 true');
assert(updateScoreTool.validateScore('0-0') === true, '合法比分 "0-0" 应该返回 true');
assert(updateScoreTool.validateScore('10-1') === true, '合法比分 "10-1" 应该返回 true');
assert(updateScoreTool.validateScore('2-') === false, '半比分 "2-" 应该返回 false');
assert(updateScoreTool.validateScore('abc') === false, '非法字符串 "abc" 应该返回 false');
assert(updateScoreTool.validateScore(null) === false, 'null 应该返回 false');

// 模拟更新一场比赛比分
const fixtures = updateScoreTool.loadFixtures();
const testMid = 'PD-1-ATM-MAL';
const match = fixtures.find(m => m.id === testMid);
assert(!!match, `测试场次 ${testMid} 应该存在`);

match.st = 'done';
match.sc = '2-1';
updateScoreTool.saveFixtures(fixtures);

// 验证写入结果
const reloaded = updateScoreTool.loadFixtures();
const updatedMatch = reloaded.find(m => m.id === testMid);
assert(updatedMatch.st === 'done', '保存后重新读取 st 应为 "done"');
assert(updatedMatch.sc === '2-1', '保存后重新读取 sc 应为 "2-1"');

console.log('\n=== 2. 测试 data.js 动态数据读取与 decorate.dec 呈现 ===');

const mDec = decorate.dec(data.getMatch(testMid), null, { followed: [] });
assert(mDec.finished === true, '已完赛场次 finished 应该为 true');
assert(mDec.scH === '2', '主队得分应为 2');
assert(mDec.scA === '1', '客队得分应为 1');
assert(mDec.scText === '2-1', '比分文本应为 "2-1"');

console.log('\n=== 3. 测试 engine.settlePred 积分结算模型 ===');

// 模拟玩家预测
const recMap = data.getRecMap();

// Case A: 猜中胜负且猜中精确比分（主胜 2-1）-> 3分胜负 + 2分精确比分 = 5分
const predExact = { pick: 'h', scoreH: '2', scoreA: '1' };
const resExact = engine.settlePred(predExact, updatedMatch, recMap);
assert(resExact.hit === true, '精确命中结果 hit 应该为 true');
assert(resExact.pts === 5, '胜平负3分+比分2分，总分应为 5 分 (实际: ' + resExact.pts + ')');

// Case B: 猜中胜负但比分不符（主胜 1-0）-> 3分
const predHitOnly = { pick: 'h', scoreH: '1', scoreA: '0' };
const resHitOnly = engine.settlePred(predHitOnly, updatedMatch, recMap);
assert(resHitOnly.hit === true, '命中胜负 hit 应该为 true');
assert(resHitOnly.pts === 3, '仅命中胜平负应为 3 分 (实际: ' + resHitOnly.pts + ')');

// Case C: 猜错胜负（客胜 0-2）-> 0分
const predMiss = { pick: 'a', scoreH: '0', scoreA: '2' };
const resMiss = engine.settlePred(predMiss, updatedMatch, recMap);
assert(resMiss.hit === false, '未命中 hit 应该为 false');
assert(resMiss.pts === 0, '未命中积分应为 0 分');

// Case D: 冷门翻倍测试（若 rec.upset 为 true）
const upsetRecMap = { [testMid]: { upset: true } };
const resUpset = engine.settlePred(predExact, updatedMatch, upsetRecMap);
assert(resUpset.pts === 10, '冷门预警场次翻倍，5分*2 应为 10 分 (实际: ' + resUpset.pts + ')');

console.log('\n=== 4. 测试 cloud_data/fixtures.json 同步完整性 ===');
const cloudFixturesPath = path.join(ROOT, 'cloud_data', 'fixtures.json');
assert(fs.existsSync(cloudFixturesPath), 'cloud_data/fixtures.json 应该存在');
const cloudLines = fs.readFileSync(cloudFixturesPath, 'utf8').trim().split('\n');
const atmDoc = cloudLines.map(l => JSON.parse(l)).find(d => (d.id || d._id) === testMid);
assert(!!atmDoc, 'cloud_data/fixtures.json 中应能找到对应记录');
assert(atmDoc.st === 'done' && atmDoc.sc === '2-1', 'cloud_data 中 st 与 sc 保持同步');
assert(atmDoc.settled === false, '新更新比分后 settled 应该为 false 以待云函数结算');

console.log(`\n========================================`);
console.log(`全链路集成测试结果: ${passCount} 通过, ${failCount} 失败`);
console.log(`========================================`);

if (failCount > 0) process.exit(1);
