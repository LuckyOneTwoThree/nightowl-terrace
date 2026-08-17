/**
 * 云函数：settleMatches 比分结算
 * 触发：数据源补录比分后（定时或手动）
 * 职责：拉取已赛未结算场次 → 结算盲评猜球 / 德比法庭应验翻车 / 夜猫榜
 * M2 阶段为骨架，v1 云开发就绪后补全
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  // 1. fixtures 集合中 st=done 且 sc 非空、未结算的场次
  // 2. 逐场结算 predictions（commit-reveal 开箱计分）与 boasts（应验/翻车）
  // 3. 写回周榜 / 赛季榜
  return { ok: true, todo: 'v1 实现', event };
};
