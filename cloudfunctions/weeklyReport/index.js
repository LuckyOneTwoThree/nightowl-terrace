/**
 * 云函数：weeklyReport 周报生成
 * 职责：每周一汇总上周盲评榜 / 修仙榜 / 德比法庭战报，生成分享卡片数据
 * M2 阶段为骨架
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  // 1. 汇总上周 predictions / checkins / boasts
  // 2. 产出周榜 + 最狠一夜 + 最准之口
  // 3. 返回分享卡片参数
  return { ok: true, todo: 'v1 实现', event };
};
