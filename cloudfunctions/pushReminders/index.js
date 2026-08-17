/**
 * 云函数：pushReminders 开球提醒
 * 职责：按关注球队与 ★★★ 场次，在开球前 30 分钟下发订阅消息
 * 依赖：Lucky 申请订阅消息模板（未过审前 ICS 兜底，本函数不启用）
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  // 1. 查询今日关注球队 / ★★★ 场次
  // 2. 匹配已订阅用户 openid
  // 3. cloud.openapi.subscribeMessage.send
  return { ok: true, todo: '模板过审后实现', event };
};
