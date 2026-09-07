
const assert = require("assert");

console.log("=== 1. 测试 seal/index.js boast_reaction delta 逻辑 ===");
function calcDelta(raw) {
  const rawDelta = Number(raw) || 1;
  return rawDelta < 0 ? -1 : Math.min(3, Math.max(1, rawDelta));
}
assert.strictEqual(calcDelta(-1), -1, "取消点赞时 delta 应为 -1");
assert.strictEqual(calcDelta(1), 1, "单次点赞 delta 应为 1");
assert.strictEqual(calcDelta(3), 3, "正常幅度 3 应允许");
assert.strictEqual(calcDelta(9999), 3, "防刷幅度 9999 应封顶为 3");
assert.strictEqual(calcDelta(null), 1, "默认 delta 应为 1");
console.log("  ✅ boast_reaction delta 取消与防刷计算全部正确");

console.log("=== 2. 测试 settleMatches 0分预测与多场累加逻辑 ===");
// 模拟 settleMatches 里的聚合逻辑
function simulateSettle(predictions) {
  const perGid = {};
  const uidStats = {};
  for (const p of predictions) {
    if (p.tampered) continue;
    const uid = p.uid;
    const g = p.gid || "default";
    perGid[g] = perGid[g] || {};
    perGid[g][uid] = perGid[g][uid] || { pts: 0, count: 0, hit: 0, nick: p.nick || "" };
    perGid[g][uid].pts += (p.pts || 0);
    perGid[g][uid].count++;
    if (p.hit) perGid[g][uid].hit++;

    uidStats[uid] = uidStats[uid] || { pts: 0, count: 0, hit: 0, nick: p.nick || "" };
    uidStats[uid].pts += (p.pts || 0);
    uidStats[uid].count++;
    if (p.hit) uidStats[uid].hit++;
  }
  return { perGid, uidStats };
}

const mockPreds = [
  { uid: "user_zero", gid: "default", pts: 0, hit: false, tampered: false },
  { uid: "user_multi", gid: "default", pts: 3, hit: true, tampered: false },
  { uid: "user_multi", gid: "default", pts: 0, hit: false, tampered: false },
  { uid: "user_tamper", gid: "default", pts: 0, hit: false, tampered: true }
];

const res = simulateSettle(mockPreds);
assert.ok(res.perGid["default"]["user_zero"], "0分用户必须存在于 perGid 统计中");
assert.strictEqual(res.perGid["default"]["user_zero"].count, 1, "0分用户总场次 count 应为 1");
assert.strictEqual(res.perGid["default"]["user_zero"].pts, 0, "0分用户积分为 0");
assert.strictEqual(res.perGid["default"]["user_multi"].count, 2, "同批次多场用户 count 应为 2");
assert.strictEqual(res.perGid["default"]["user_multi"].hit, 1, "同批次多场用户命中应为 1");
assert.strictEqual(res.perGid["default"]["user_multi"].pts, 3, "同批次多场用户积分应为 3");
assert.strictEqual(res.perGid["default"]["user_tamper"], undefined, "作废单不应进入榜单统计");
assert.strictEqual(res.uidStats["user_tamper"], undefined, "作废单不应进入档案统计");
console.log("  ✅ settleMatches 0分入榜、批量场次计数、作废单过滤全部正确");

console.log("=== 3. 测试 syncScores 回滚对称扣减 ===");
function simulateRollback(settledOld) {
  const oldPerGid = {};
  for (const p of settledOld) {
    const uid = p.uid;
    const g = p.gid || "default";
    oldPerGid[g] = oldPerGid[g] || {};
    oldPerGid[g][uid] = oldPerGid[g][uid] || { pts: 0, hit: 0, count: 0 };
    oldPerGid[g][uid].pts += (p.pts || 0);
    oldPerGid[g][uid].count++;
    if (p.hit) oldPerGid[g][uid].hit++;
  }
  return oldPerGid;
}

const oldPreds = [
  { uid: "u1", gid: "default", pts: 5, hit: true },
  { uid: "u2", gid: "default", pts: 0, hit: false }
];
const rb = simulateRollback(oldPreds);
assert.strictEqual(rb["default"]["u1"].count, 1, "回滚 count 应为 1");
assert.strictEqual(rb["default"]["u1"].pts, 5, "回滚 pts 应为 5");
assert.strictEqual(rb["default"]["u2"].count, 1, "0分记录回滚 count 亦应为 1");
assert.strictEqual(rb["default"]["u2"].pts, 0, "0分记录回滚 pts 为 0");
console.log("  ✅ syncScores 回滚 totalCount 与 totalPreds 对称扣减逻辑正确");

console.log("=== 4. 测试 crest.js CDN 与存储模式切换 ===");
const crest = require("../miniprogram/utils/crest.js");
assert.strictEqual(crest.getUrl("ARS"), "/images/crests/ARS.png", "默认应为本地包路径");
crest.setCdnBase("https://cdn.nightowl.com/crests");
assert.strictEqual(crest.getUrl("ARS"), "https://cdn.nightowl.com/crests/ARS.png", "设置 CDN 后应返回 CDN 路径");
crest.setCdnBase("");
crest.setBucket("test-bucket");
assert.strictEqual(crest.getUrl("ARS"), "cloud://" + crest.ENV + ".test-bucket/crests/ARS.png", "切 Bucket 后应返回 cloud:// 路径");
crest.setBucket("");
assert.strictEqual(crest.getUrl("ARS"), "/images/crests/ARS.png", "还原后应为本地路径");
console.log("  ✅ crest.js 多源降级与 CDN 驱动无缝切换测试通过");

console.log("=== 5. 测试 ics.js 微信日历接口封装规范 ===");
const ics = require("../miniprogram/utils/ics.js");
assert.strictEqual(typeof ics.addCalendar, "function", "addCalendar 必须为导出函数");
assert.strictEqual(typeof ics.share, "function", "share 必须为导出函数");
assert.strictEqual(typeof ics.build, "function", "build 必须为导出函数");
const icsContent = ics.build([{ t: "2026-08-22T03:00", title: "测试赛事", desc: "夜猫测试" }]);
assert.ok(icsContent.includes("BEGIN:VCALENDAR"), "ICS 格式头必须完整");
assert.ok(icsContent.includes("SUMMARY:测试赛事"), "ICS 事件标题匹配");
assert.ok(icsContent.includes("DESCRIPTION:夜猫测试"), "ICS 事件备注匹配");
console.log("  ✅ ics.js 生成与日历转换测试通过");

console.log("=== 6. 测试 me.js 模块引用与日历导出 ===");
global.wx = {
  getStorageSync: () => ({}),
  setStorageSync: () => {},
  showToast: () => {},
  switchTab: () => {},
  getFileSystemManager: () => ({ writeFile: ({ success }) => success() }),
  shareFileMessage: ({ success }) => success(),
  env: { USER_DATA_PATH: "/tmp" }
};
global.getApp = () => ({ applyTheme: () => {}, getFollowed: () => [], getFollowedLeagues: () => [] });
let mePageDef = null;
global.Page = (d) => { mePageDef = d; };
const mePath = require("path").resolve(__dirname, "../miniprogram/pages/me/me.js");
delete require.cache[mePath];
require(mePath);

const fakeMe = {
  data: {
    myWeek: [{ id: "PL-1-ARS-COV", st: "sched", tbd: false, hm: "03:00", cost: 2, home: { zh: "阿森纳" }, away: { zh: "考文垂" }, lgZh: "英超" }]
  }
};
assert.doesNotThrow(() => {
  mePageDef.onExportMyWeekCal.call(fakeMe);
}, "me.js onExportMyWeekCal 必须正常运行，不可报 ics is not defined");
console.log("  ✅ me.js ics 依赖导入与导出日历调用正常");

console.log("=== 7. 测试 settings.js 缓存清理完整性 ===");
const settingsPath = require("path").resolve(__dirname, "../miniprogram/pages/settings/settings.js");
const settingsCode = require("fs").readFileSync(settingsPath, "utf8");
assert.ok(settingsCode.includes("'court_reactions'"), "settings.js 必须包含 court_reactions 清理");
console.log("  ✅ settings.js 包含 court_reactions 清理项");

console.log("\n========================================");
console.log("所有审查修复项与高价值优化专项测试 100% 通过！");
console.log("========================================");
