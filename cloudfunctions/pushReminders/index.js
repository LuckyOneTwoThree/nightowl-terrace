/**
 * 云函数：pushReminders 开球提醒 + 盲评截止提醒
 * 触发：定时（每 15 分钟扫描，见 config.json）
 * 职责（PM 十一 / 9.4）：
 *   1. 开球提醒：扫描未来 [15, 30) 分钟内开球的场次（窗口与触发周期一致，衔接不重叠）
 *      命中条件：用户关注球队出战，或推荐层 ★★★ 焦点战
 *   2. 截止提醒（PM 9.4）：扫描未来 [15, 30) 分钟截止（=开球）的本周竞猜场次，
 *      提醒「已订阅且尚未封存」的用户：盲评即将截止
 * 前置条件（未满足时安全空转，不报错）：
 *   - 小程序后台申请订阅消息模板，把模板 ID 配到本函数环境变量 TMPL_KICKOFF / TMPL_DEADLINE
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
  const TMPL = process.env.TMPL_KICKOFF;     // 开球提醒模板
  const TMPL_DL = process.env.TMPL_DEADLINE; // 盲评截止提醒模板（PM 9.4）

  try {
    // 1. 未来 [15, 30) 分钟开球的场次（北京时间 t 格式 'YYYY-MM-DDTHH:mm'）
    // 窗口宽度与触发周期一致（15 分钟），相邻触发无缝衔接不重叠，同一场不会推两次
    const now = Date.now();
    const from = now + 15 * 60000, to = now + 30 * 60000;
    const fixtures = await fetchAll(db, 'fixtures', { st: 'sched' }, 2000);

    const upcoming = fixtures.filter(m => {
      const ts = bjTs(m.t);
      return !isNaN(ts) && !m.tbd && ts >= from && ts < to;
    });

    // 2. ★★★ 场次（推荐层人工星级）
    const recs = await fetchAll(db, 'recommendations', {}, 1000);
    const star3 = new Set(recs.filter(r => r.star === 3).map(r => r.m));

    // 3. 订阅用户（subscriptions 直写文档无 uid，云库自动补 _openid）
    const users = await fetchAll(db, 'users', {}, 1000);
    const userMap = {};
    users.forEach(u => {
      const uid = u.uid || u._openid || '';
      if (uid) userMap[uid] = u;
    });

    const subs = await fetchAll(db, 'subscriptions', { status: 'accept' }, 2000);
    const subMap = {}; // uid -> 最近一次授权；uid|tmplId -> 模板维度授权（多模板不互相覆盖）
    const subscriberUids = new Set();
    subs.forEach(s => {
      const uid = s.uid || s._openid || '';
      if (!uid) return;
      subscriberUids.add(uid);
      if (!subMap[uid]) subMap[uid] = s;
      if (s.tmplId) subMap[uid + '|' + s.tmplId] = s;
    });

    let sent = 0, skipped = 0;

    // 授权核销（三轮 P1-10）：微信一次性订阅=一次授权只能推一条，发送成功后
    // 标记 consumed 防止后续触发反复对已耗尽授权发送（静默失败+浪费调用）；
    // 43101（用户已拒收）也核销——该授权已不可用
    async function consume(sub, reason) {
      if (!sub || !sub._id) return;
      try {
        await db.collection('subscriptions').doc(sub._id).update({
          data: { status: 'consumed', usedTs: Date.now(), usedReason: reason || 'sent' }
        });
      } catch (e) { /* 核销失败不影响主流程 */ }
    }

    // ── 开球提醒（模板未配置则跳过该段，不影响截止提醒） ──
    if (TMPL && upcoming.length) {
      for (const uid of subscriberUids) {
        const sub = subMap[uid + '|' + TMPL] || subMap[uid];
        if (!sub) continue;
        const u = userMap[uid] || { uid: uid, followed: [] };
        const followed = u.followed || [];
        const hit = upcoming.find(m =>
          (Array.isArray(followed) && (followed.includes(m.h) || followed.includes(m.a))) ||
          star3.has(m.id)
        );
        if (!hit) continue;

        try {
          await cloud.openapi.subscribeMessage.send({
            touser: uid,
            templateId: TMPL,
            page: 'pages/detail/detail?id=' + hit.id,
            data: {
              // 字段名以实际申请到的模板为准，部署前对照后台模板配置（thing 字段微信硬限制 20 字符）
              thing1: { value: String((hit.h || '') + ' vs ' + (hit.a || '')).slice(0, 20) },
              time2: { value: hit.t.replace('T', ' ') }
            }
          });
          sent++;
          await consume(sub, 'kickoff_sent'); // 一次性授权已消耗，核销
        } catch (e) {
          skipped++; // 用户拒绝过/授权过期/频控，静默跳过
          if (String((e && e.errCode) || '') === '43101') await consume(sub, 'rejected_43101');
        }
      }
    }

    // ── 盲评截止提醒（PM 9.4）：窗口内开球 = 竞猜即将截止，提醒未封存用户 ──
    let dlSent = 0, dlSkipped = 0;
    if (TMPL_DL && upcoming.length) {
      const ids = upcoming.map(m => m.id);
      const preds = await fetchAll(db, 'predictions', {}, 3000);
      // 已封存用户 × 场次（uid 回退 _openid，与 readBoard 口径一致）
      const sealed = new Set(preds
        .filter(p => ids.includes(p.m))
        .map(p => (p.uid || p._openid || '') + '|' + p.m));

      for (const uid of subscriberUids) {
        const sub = subMap[uid + '|' + TMPL_DL] || subMap[uid];
        if (!sub) continue;
        const pend = upcoming.find(m => !sealed.has(uid + '|' + m.id));
        if (!pend) continue;

        try {
          await cloud.openapi.subscribeMessage.send({
            touser: uid,
            templateId: TMPL_DL,
            page: 'pages/predict/predict',
            data: {
              // 字段名以实际申请到的模板为准，部署前对照后台模板配置（thing 字段微信硬限制 20 字符）
              thing1: { value: '盲评即将截止' },
              thing2: { value: String((pend.h || '') + ' vs ' + (pend.a || '') + ' 开球封卷').slice(0, 20) }
            }
          });
          dlSent++;
          await consume(sub, 'deadline_sent'); // 一次性授权已消耗，核销
        } catch (e) {
          dlSkipped++;
          if (String((e && e.errCode) || '') === '43101') await consume(sub, 'rejected_43101');
        }
      }
    }

    return {
      ok: true,
      window: [from, to],
      matches: upcoming.length,
      sent, skipped,
      deadlineSent: dlSent, deadlineSkipped: dlSkipped,
      skippedReason: (!TMPL && !TMPL_DL) ? '模板未配置（TMPL_KICKOFF / TMPL_DEADLINE），ICS 兜底中' : undefined
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
