/**
 * 云函数：settleMatches 比分结算
 * 触发：比分补录后手动触发（每周一，或赛果同步后）
 * 职责：
 *   1. fixtures 集合中 st=done、sc 非空、未结算的场次
 *   2. 逐场结算 predictions：commit-reveal 校验（哈希不一致作废）→ 胜平负 3 分、比分再 +2（与本地 records.js 判据一致）
 *   3. 写回 standings 总榜（按 gid 分群）
 *   4. boasts 为自由文本狠话，无法由比分自动判定应验/翻车——保持法庭页人工判定，本函数只聚合
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

// 胜平负 3 分，比分再 +2（PM 9.4，本地结算同款判据）
function settle(pred, sc) {
  const parts = String(sc).split('-');
  const h = Number(parts[0]), a = Number(parts[1]);
  const fact = h > a ? 'h' : h < a ? 'a' : 'd';
  const hit = pred.pick === fact;
  let pts = hit ? 3 : 0;
  if (hit && pred.scoreH !== '' && pred.scoreH != null &&
      Number(pred.scoreH) === h && Number(pred.scoreA) === a) pts += 2;
  return { hit, pts };
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
    // 1. 已赛未结算场次
    const matches = await fetchAll(db, 'fixtures', {
      st: 'done',
      sc: _.neq('').and(_.exists(true)),
      settled: _.neq(true)
    }, 200);

    for (const m of matches) {
      // 2. 该场全部封存预测
      const preds = await fetchAll(db, 'predictions', { m: m.id }, 500);

      // uid -> 本场积分增量（跨群按 gid 分账）
      const perGid = {};
      for (const p of preds) {
        const update = { revealed: true, settledAt: Date.now(), sc: m.sc };
        if (p.salt && p.hash && commitHash(p) !== p.hash) {
          // 封存校验失败 → 作废不计分（PM 八节）
          update.hit = false;
          update.pts = 0;
          update.tampered = true;
          summary.void++;
        } else {
          const r = settle(p, m.sc);
          update.hit = r.hit;
          update.pts = r.pts;
          update.tampered = false;
        }
        await db.collection('predictions').doc(p._id).update({ data: update });
        summary.predictions++;

        const g = p.gid || 'default';
        perGid[g] = perGid[g] || {};
        perGid[g][p.uid] = (perGid[g][p.uid] || 0) + (update.pts || 0);
      }

      // 3. 写回 standings 总榜（uid 维度 upsert）
      for (const gid of Object.keys(perGid)) {
        for (const uid of Object.keys(perGid[gid])) {
          const delta = perGid[gid][uid];
          if (!delta) continue;
          const exist = await db.collection('standings')
            .where({ gid, uid }).limit(1).get();
          if (exist.data.length) {
            await db.collection('standings').doc(exist.data[0]._id).update({
              data: { pts: _.inc(delta), updatedTs: Date.now() }
            });
          } else {
            await db.collection('standings').add({
              data: { gid, uid, nick: (preds.find(x => x.uid === uid) || {}).nick || uid, pts: delta, updatedTs: Date.now() }
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
