/**
 * 云函数：pushReminders 开球提醒
 * 触发：定时（每 15 分钟扫描，见 config.json）
 * 职责（PM 十一）：
 *   1. 扫描未来 15~45 分钟内开球的场次
 *   2. 命中条件：用户关注球队出战，或推荐层 ★★★ 焦点战
 *   3. 对已授权订阅的用户下发订阅消息
 * 前置条件（未满足时安全空转，不报错）：
 *   - 小程序后台申请订阅消息模板，把模板 ID 配到本函数环境变量 TMPL_KICKOFF
 *   - 客户端调 wx.requestSubscribeMessage 后，把授权记录写入 subscriptions 集合
 *   - 模板未过审前，客户端走 ICS 日历导出兜底（已上线），本函数保持 notConfigured
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 北京时间 'YYYY-MM-DDTHH:mm' → 时间戳（纯 UTC 算术，不依赖运行环境时区，同 ics.js 思路）
function bjTs(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600000;
}

async function fetchAll(db, coll, where, limit) {
  const out = [];
  const MAX = limit || 1000;
  for (let skip = 0; skip < MAX * 20; skip += 100) {
    const res = await db.collection(coll).where(where).skip(skip).limit(100).get();
    out.push(...res.data);
    if (res.data.length < 100) break;
  }
  return out;
}

exports.main = async () => {
  const db = cloud.database();
  const TMPL = process.env.TMPL_KICKOFF; // 订阅消息模板 ID（环境变量注入）

  try {
    if (!TMPL) return { ok: true, skipped: '模板未配置（TMPL_KICKOFF），ICS 兜底中' };

    // 1. 未来 15~45 分钟开球的场次（北京时间 t 格式 'YYYY-MM-DDTHH:mm'）
    const now = Date.now();
    const from = now + 15 * 60000, to = now + 45 * 60000;
    const fixtures = await fetchAll(db, 'fixtures', { st: 'sched' }, 2000);

    const upcoming = fixtures.filter(m => {
      const ts = bjTs(m.t);
      return !isNaN(ts) && !m.tbd && ts >= from && ts <= to;
    });
    if (!upcoming.length) return { ok: true, sent: 0, reason: '窗口内无场次' };

    // 2. ★★★ 场次（推荐层人工星级）
    const recs = await fetchAll(db, 'recommendations', {}, 1000);
    const star3 = new Set(recs.filter(r => r.star === 3).map(r => r.m));

    // 3. 订阅用户：关注球队命中 或 ★★★ 场次
    const users = await fetchAll(db, 'users', {}, 1000);
    const subs = await fetchAll(db, 'subscriptions', { status: 'accept' }, 2000);
    const subMap = {}; // uid -> 最近一次授权
    subs.forEach(s => { subMap[s.uid] = s; });

    let sent = 0, skipped = 0;
    for (const u of users) {
      const sub = subMap[u.uid];
      if (!sub) continue;
      const followed = u.followed || [];
      const hit = upcoming.find(m =>
        (Array.isArray(followed) && (followed.includes(m.h) || followed.includes(m.a))) ||
        star3.has(m.id)
      );
      if (!hit) continue;

      try {
        await cloud.openapi.subscribeMessage.send({
          touser: u.uid,
          templateId: TMPL,
          page: 'pages/detail/detail?id=' + hit.id,
          data: {
            // 字段名以实际申请到的模板为准，部署前对照后台模板配置
            thing1: { value: (hit.h || '') + ' vs ' + (hit.a || '') },
            time2: { value: hit.t.replace('T', ' ') }
          }
        });
        sent++;
      } catch (e) {
        skipped++; // 用户拒绝过/授权过期/频控，静默跳过
      }
    }
    return { ok: true, window: [from, to], matches: upcoming.length, sent, skipped };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
