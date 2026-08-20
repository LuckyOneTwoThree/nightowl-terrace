const path = require('path');
const ROOT = path.join(__dirname, '..', 'miniprogram');
const engine = require(path.join(ROOT, 'utils', 'engine.js'));
const decorate = require(path.join(ROOT, 'utils', 'decorate.js'));
const data = require(path.join(ROOT, 'utils', 'data.js'));

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

console.log('=== 1. 测试相对日期与标签（针对 8/20 03:00 凌晨场） ===');

const matchT = '2026-08-20T03:00';
const matchObj = { id: 'PD-1-ATM-MAL', t: matchT, st: 'sched', h: 'ATM', a: 'MAL', s: 3 };

// 时间点 A: 8/19 22:00（比赛前夜）
const ts19_22 = new Date('2026-08-19T22:00:00+08:00').getTime();
assert(decorate.getDayLabel(matchT, ts19_22) === '明晨', '8/19 22:00 查看 8/20 03:00 应显示为「明晨」');
assert(decorate.getDateHeader(matchT, ts19_22).indexOf('明晨 · 8月20日') >= 0, '8/19 22:00 日期头包含「明晨 · 8月20日」');
assert(engine.matchState(matchObj, ts19_22) === 'sched', '8/19 22:00 比赛状态应为 sched (未开球)');

// 时间点 B: 8/20 02:00（开球前 1 小时）
const ts20_02 = new Date('2026-08-20T02:00:00+08:00').getTime();
assert(decorate.getDayLabel(matchT, ts20_02) === '今天凌晨', '8/20 02:00 查看 8/20 03:00 应显示为「今天凌晨」');
assert(engine.matchState(matchObj, ts20_02) === 'sched', '8/20 02:00 比赛状态应为 sched');

// 时间点 C: 8/20 03:30（开球后 30 分钟，进行中）
const ts20_0330 = new Date('2026-08-20T03:30:00+08:00').getTime();
assert(engine.matchState(matchObj, ts20_0330) === 'live', '8/20 03:30 比赛状态应为 live (比赛中)');

// 时间点 D: 8/20 14:00（今天下午，已结束 9 小时，st 仍为 sched）
const ts20_14 = new Date('2026-08-20T14:00:00+08:00').getTime();
assert(decorate.getDayLabel(matchT, ts20_14) === '今天凌晨', '8/20 14:00 查看 8/20 03:00 应显示为「今天凌晨」（不再显示「昨天」！）');
assert(decorate.getDateHeader(matchT, ts20_14).indexOf('今天凌晨 · 8月20日') >= 0, '8/20 14:00 日期头包含「今天凌晨 · 8月20日」');
assert(engine.matchState(matchObj, ts20_14) === 'ended_pending', '8/20 14:00 未更新比分时状态应为 ended_pending (已完赛待录入)');

// 时间点 E: 8/21 10:00（次日白天）
const ts21_10 = new Date('2026-08-21T10:00:00+08:00').getTime();
assert(decorate.getDayLabel(matchT, ts21_10) === '昨天凌晨', '8/21 10:00 查看 8/20 03:00 应显示为「昨天凌晨」');

// 时间点 F: 8/25 10:00（多日后）
const ts25_10 = new Date('2026-08-25T10:00:00+08:00').getTime();
assert(decorate.getDayLabel(matchT, ts25_10) === '8月20日 周四', '8/25 查看 8/20 03:00 应显示绝对日期「8月20日 周四」');

console.log('\n=== 2. 测试非凌晨场次（如 8/20 22:30） ===');
const matchDayT = '2026-08-20T22:30';
assert(decorate.getDayLabel(matchDayT, ts20_14) === '今天', '8/20 14:00 查看 8/20 22:30 应显示为「今天」');
assert(decorate.getDateHeader(matchDayT, ts20_14).indexOf('今天 · 8月20日') >= 0, '8/20 14:00 日期头应为「今天 · 8月20日」');

console.log('\n=== 3. 测试已赛场次（st: done） ===');
const matchDone = { id: 'PD-1-ALA-GET', t: '2026-08-16T01:30', st: 'done', sc: '3-0' };
assert(engine.isFinished(matchDone) === true, 'st=done 时 isFinished 必须为 true');
assert(engine.matchState(matchDone, ts20_14) === 'finished', 'st=done 时 matchState 必须为 finished');

console.log(`\n测试总结: ${passCount} 通过, ${failCount} 失败`);
if (failCount > 0) process.exit(1);
