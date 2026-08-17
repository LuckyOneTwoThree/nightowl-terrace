/**
 * 云函数：readBoard 榜单读取
 * 职责：盲评周榜/赛季榜、夜猫榜、德比法庭留言列表（只读聚合）
 * 安全：predictions / checkins / boasts 只写不读，统一经本函数出聚合结果，
 *       结算前不暴露任何个人答案（防偷看）
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const { board, week } = event;
  // board: 'guess' | 'owl' | 'court'
  // 1. 校验该周是否已结算，未结算返回占位（盲评封存中）
  // 2. 已结算返回榜单与留言聚合
  return { ok: true, board, week, todo: 'v1 实现' };
};
