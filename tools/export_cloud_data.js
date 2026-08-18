const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../miniprogram/data');
const outDir = path.join(__dirname, '../cloud_data');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const files = [
  { name: 'teams', src: 'teams.json', coll: 'teams' },
  { name: 'fixtures', src: 'fixtures.full.json', coll: 'fixtures' },
  { name: 'fixtures_seed', src: 'fixtures.seed.json', coll: 'fixtures_seed' },
  { name: 'recommendations', src: 'recommendations.seed.json', coll: 'recommendations' },
  { name: 'storylines', src: 'storylines.json', coll: 'storylines' },
  { name: 'rivalries', src: 'rivalries.json', coll: 'rivalries' },
  { name: 'quips', src: 'quips.json', coll: 'quips' }
];

files.forEach(f => {
  const filePath = path.join(srcDir, f.src);
  if (!fs.existsSync(filePath)) {
    console.warn('File not found:', filePath);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error('Error parsing', f.src, err.message);
    return;
  }
  
  if (!Array.isArray(data)) {
    console.error('Expected array in', f.src);
    return;
  }
  
  // 微信云数据库导入标准：Line-delimited JSON (JSON Lines / NDJSON)
  const lines = data.map(item => {
    const doc = Object.assign({}, item);
    if (doc.id && !doc._id) {
      doc._id = String(doc.id);
    }
    // 自动补齐 settled：积分结算标记，初始全部 false（未结算），由 settleMatches 结算后置 true
    if (f.coll === 'fixtures' || f.coll === 'fixtures_seed') {
      if (doc.settled === undefined) {
        doc.settled = false;
      }
    }
    return JSON.stringify(doc);
  });
  
  const outPath = path.join(outDir, f.coll + '.json');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(' Exported ' + lines.length + ' docs -> cloud_data/' + f.coll + '.json (with settled field)');
});

console.log('\nAll cloud database JSONL import files successfully generated in cloud_data/ !');
