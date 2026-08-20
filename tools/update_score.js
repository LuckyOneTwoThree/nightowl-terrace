/**
 * 运营与开发比分补录脚本
 * 功能：
 *   1. 单场更新：node tools/update_score.js --id=PD-1-ATM-MAL --score=2-1
 *   2. 批量更新：node tools/update_score.js --file=tools/patch_scores.json
 *   3. 列出待补录场次：node tools/update_score.js --list-pending
 * 同步更新：
 *   - miniprogram/data/fixtures.full.json
 *   - miniprogram/data/fixtures.full.js
 *   - cloud_data/fixtures.json (JSONL，自动置 settled: false 便于 settleMatches 结算)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FULL_JSON = path.join(ROOT, 'miniprogram', 'data', 'fixtures.full.json');
const FULL_JS = path.join(ROOT, 'miniprogram', 'data', 'fixtures.full.js');
const CLOUD_FIXTURES = path.join(ROOT, 'cloud_data', 'fixtures.json');

// 解析 CLI 参数
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      args[parts[0]] = parts.length > 1 ? parts.slice(1).join('=') : true;
    }
  });
  return args;
}

function loadFixtures() {
  if (!fs.existsSync(FULL_JSON)) {
    throw new Error(`找不到赛程文件: ${FULL_JSON}`);
  }
  return JSON.parse(fs.readFileSync(FULL_JSON, 'utf8'));
}

function saveFixtures(fixtures) {
  // 1. 写 fixtures.full.json
  fs.writeFileSync(FULL_JSON, JSON.stringify(fixtures));
  // 2. 写 fixtures.full.js
  fs.writeFileSync(FULL_JS, 'module.exports = ' + JSON.stringify(fixtures) + ';\n');

  // 3. 同步更新 cloud_data/fixtures.json (JSONL)
  if (fs.existsSync(CLOUD_FIXTURES)) {
    const cloudLines = fs.readFileSync(CLOUD_FIXTURES, 'utf8').trim().split('\n').filter(Boolean);
    const cloudMap = new Map();
    cloudLines.forEach(line => {
      try {
        const doc = JSON.parse(line);
        cloudMap.set(doc.id || doc._id, doc);
      } catch (e) {}
    });

    fixtures.forEach(m => {
      const doc = cloudMap.get(m.id);
      if (doc) {
        doc.st = m.st;
        doc.sc = m.sc;
        if (m.st === 'done') {
          doc.settled = doc.settled || false; // 重置或保持布尔
        }
      }
    });

    const newLines = Array.from(cloudMap.values()).map(doc => JSON.stringify(doc));
    fs.writeFileSync(CLOUD_FIXTURES, newLines.join('\n') + '\n', 'utf8');
  }
}

function validateScore(score) {
  return typeof score === 'string' && /^\d+-\d+$/.test(score.trim());
}

function main() {
  const args = parseArgs();

  if (args.help || (!args.id && !args.file && !args['list-pending'])) {
    console.log(`
夜猫追球 · 比分补录与更新工具
用法：
  1. 单场录入比分：
     node tools/update_score.js --id=<比赛ID> --score=<主队-客队>
     例：node tools/update_score.js --id=PD-1-ATM-MAL --score=2-1

  2. 批量文件录入：
     node tools/update_score.js --file=<json文件路径>
     文件格式：[ { "id": "PD-1-ATM-MAL", "score": "2-1" }, ... ]

  3. 列出已过开球时间但未录入比分的场次：
     node tools/update_score.js --list-pending
`);
    return;
  }

  const fixtures = loadFixtures();
  const matchMap = new Map(fixtures.map(m => [m.id, m]));

  if (args['list-pending']) {
    const nowTs = Date.now();
    // 假设北京时间
    const pending = fixtures.filter(m => {
      const matchTs = new Date(m.t + ':00+08:00').getTime();
      return matchTs <= nowTs && (m.st !== 'done' || !m.sc);
    });

    console.log(`\n=== 当前已过开球时间但未完赛/无比分的场次 (共 ${pending.length} 场) ===`);
    pending.slice(0, 20).forEach(m => {
      console.log(`  [${m.id}] ${m.t} | ${m.h} vs ${m.a} (st: ${m.st}, sc: ${m.sc})`);
    });
    if (pending.length > 20) {
      console.log(`  ... 还有 ${pending.length - 20} 场未列出`);
    }
    return;
  }

  const updates = [];

  if (args.id) {
    const id = String(args.id).trim();
    const score = String(args.score || '').trim();
    if (!validateScore(score)) {
      console.error(`❌ 错误：比分格式不合法 "${score}"，必须为 "X-Y" (如 "2-1")`);
      process.exit(1);
    }
    updates.push({ id, score });
  } else if (args.file) {
    const filePath = path.resolve(process.cwd(), args.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 错误：找不到文件 "${filePath}"`);
      process.exit(1);
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(content)) {
      console.error(`❌ 错误：JSON 文件必须为数组`);
      process.exit(1);
    }
    content.forEach((item, idx) => {
      if (!item.id || !validateScore(item.score)) {
        console.error(`❌ 错误：第 ${idx + 1} 项数据格式不合法: ${JSON.stringify(item)}`);
        process.exit(1);
      }
      updates.push({ id: item.id.trim(), score: item.score.trim() });
    });
  }

  let successCount = 0;
  updates.forEach(({ id, score }) => {
    const match = matchMap.get(id);
    if (!match) {
      console.warn(`⚠ 警告：找不到比赛 ID "${id}"，跳过`);
      return;
    }
    const oldSt = match.st;
    const oldSc = match.sc;
    match.st = 'done';
    match.sc = score;
    console.log(`✅ [${id}] ${match.h} vs ${match.a} 比分更新: ${oldSc || 'null'}(${oldSt}) -> ${score}(done)`);
    successCount++;
  });

  if (successCount > 0) {
    saveFixtures(fixtures);
    console.log(`\n🎉 成功更新 ${successCount} 场比赛比分，已同步写入 fixtures.full.json / .js 及 cloud_data/fixtures.json！`);
  } else {
    console.log(`没有可更新的场次。`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('❌ 执行失败:', err.message);
    process.exit(1);
  }
}

module.exports = {
  validateScore,
  loadFixtures,
  saveFixtures
};
