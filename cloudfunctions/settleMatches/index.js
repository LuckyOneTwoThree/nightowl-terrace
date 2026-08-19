/**
 * 云函数：settleMatches 比分结算
 * 触发：定时（每小时第 5 分钟，见 config.json）或手动（比分补录后即时验证）
 * 职责：
 *   1. fixtures 集合中 st=done、sc 非空、未结算的场次
 *   2. 逐场结算 predictions：commit-reveal 校验（哈希不一致作废）→ 截止校验（sealTs 服务端
 *      时间优先，降级直写旧数据回退客户端 ts + 60s 宽容）→ 胜平负 3 分、比分再 +2（与本地 records.js 判据一致）
 *   3. 写回 standings 总榜（按 gid 分群，nick 随最新封存同步）
 *   4. boasts 为自由文本狠话，无法由比分自动判定应验/翻车——保持法庭页人工判定，本函数只聚合（见 weeklyReport）
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 与 miniprogram/utils/crypt.js commitHash 载荷格式完全一致
function commitHash(p) {
  return crypto.createHash('sha256')
    .update(p.pick + '|' + (p.scoreH || '-') + ':' + (p.scoreA || '-') + '|' + p.salt, 'utf8')
    .digest('hex');
}

// 胜平负 3 分，比分再 +2，命中冷门预警翻倍（PM 9.4，本地结算同款判据）
function settle(pred, sc, upset) {
  const s = String(sc);
  // 比分格式严格校验：'2-' 会被 Number('') 解析成 0 当成 2-0 骗分（与本地 settlePred 同判据）
  if (!/^\d+-\d+$/.test(s)) return { hit: false, pts: 0 };
  const parts = s.split('-');
  const h = Number(parts[0]), a = Number(parts[1]);
  const fact = h > a ? 'h' : h < a ? 'a' : 'd';
  const hit = pred.pick === fact;
  let pts = hit ? 3 : 0;
  // 比分加分需双方比分都已填写（半比分如只填主队 2、赛果 2-0 不给 +2）
  if (hit && pred.scoreH !== '' && pred.scoreH != null &&
      pred.scoreA !== '' && pred.scoreA != null &&
      Number(pred.scoreH) === h && Number(pred.scoreA) === a) pts += 2;
  if (hit && upset) pts *= 2;
  return { hit, pts };
}

// 北京时间 'YYYY-MM-DDTHH:mm' → 时间戳（截止校验用，纯 UTC 算术）
function bjTs(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600000;
}

// 分页拉全量（云数据库单次 limit 100）
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

exports.main = async (event) => {
  const db = cloud.database();
  const _ = db.command;
  const summary = { matches: 0, predictions: 0, void: 0, standings: 0 };

  try {
    // 0. 推荐层冷门标记（PM 9.4：命中冷门预警翻倍，判据可复算）
    const recs = await fetchAll(db, 'recommendations', {}, 1000);
    const upsetSet = new Set(recs.filter(r => r.upset).map(r => r.m));

    // 1. 已赛未结算场次（sc 需非空且非 null：String(null) 会解析成 NaN 被误判平局）
    const matches = await fetchAll(db, 'fixtures', {
      st: 'done',
      sc: _.neq('').and(_.neq(null)).and(_.exists(true)),
      settled: _.neq(true)
    }, 200);

    for (const m of matches) {
      // 2. 该场全部封存预测
      const preds = await fetchAll(db, 'predictions', { m: m.id }, 500);
      const kickTs = bjTs(m.t);

      // uid -> 本场积分增量（跨群按 gid 分账）
      // 客户端直写时不带 uid，云库自动补 _openid，此处统一回退（与 readBoard 口径一致）
      const perGid = {};
      for (const p of preds) {
        // 幂等：带条件更新，仅当该预测尚未结算时才写入并计分——
        // 超时重跑/并发触发时已结算的预测不会再次累加进 standings
        const cond = { _id: p._id, settledAt: _.exists(false) };
        const update = { revealed: true, settledAt: Date.now(), sc: m.sc };
        // 截止判据：seal 云函数封存用服务端 sealTs（可信时钟，无宽容）；
        // 降级直写的旧文档回退客户端 ts + 60s 时钟宽容（审查报告 P0-1 修复）
        const late = !Number.isNaN(kickTs) && (
          p.sealTs ? p.sealTs > kickTs : (!!p.ts && p.ts > kickTs + 60000)
        );
        if ((p.salt && p.hash && commitHash(p) !== p.hash) || late) {
          // 封存校验失败 / 截止后封存 → 作废不计分（PM 八节）
          update.hit = false;
          update.pts = 0;
          update.tampered = true;
          update.voidReason = late ? 'late_seal' : 'hash_mismatch';
          summary.void++;
        } else {
          const r = settle(p, m.sc, upsetSet.has(m.id));
          update.hit = r.hit;
          update.pts = r.pts;
          update.tampered = false;
        }
        const applied = await db.collection('predictions')
          .where(cond).update({ data: update });
        if (!applied.stats || !applied.stats.updated) continue; // 已被并发结算，跳过计分
        summary.predictions++;

        const uid = p.uid || p._openid || '';
        if (!uid) continue; // 无 uid 无法归属（理论上不会发生）
        const g = p.gid || 'default';
        perGid[g] = perGid[g] || {};
        perGid[g][uid] = (perGid[g][uid] || 0) + (update.pts || 0);
      }

      // 3. 写回 standings 总榜（uid 维度 upsert，nick 随最新封存同步）
      for (const gid of Object.keys(perGid)) {
        for (const uid of Object.keys(perGid[gid])) {
          const delta = perGid[gid][uid];
          if (!delta) continue;
          const nickSrc = (preds.find(x => (x.uid || x._openid) === uid) || {}).nick;
          const exist = await db.collection('standings')
            .where({ gid, uid }).limit(1).get();
          if (exist.data.length) {
            const patch = { pts: _.inc(delta), updatedTs: Date.now() };
            if (nickSrc) patch.nick = nickSrc; // 改昵称后总榜同步展示
            await db.collection('standings').doc(exist.data[0]._id).update({ data: patch });
          } else {
            await db.collection('standings').add({
              data: { gid, uid, nick: nickSrc || uid, pts: delta, updatedTs: Date.now() }
            });
            summary.standings++;
          }
        }
      }

      // 4. 标记该场已结算
      await db.collection('fixtures').doc(m._id).update({ data: { settled: true } });
      summary.matches++;
    }

    return { ok: true, ...summary };
  } catch (err) {
    return { ok: false, error: err.message, ...summary };
  }
};
