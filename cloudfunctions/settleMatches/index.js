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

// (uid, m) 去重：与 readBoard 同款（seal findExisting→add 非原子、seal 成功后超时误降级直写
// 都会产生重复文档），结算只认最新一条（sealTs 优先），防总榜重复计分（二轮 P0-3）
function dedupLatest(rows) {
  const latest = {};
  for (const r of rows) {
    const uid = r.uid || r._openid || '';
    const k = uid + '|' + r.m;
    const cur = r.sealTs || r.ts || 0;
    if (!latest[k] || cur > (latest[k].sealTs || latest[k].ts || 0)) latest[k] = r;
  }
  return Object.values(latest);
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
      // 2. 该场全部封存预测，(uid,m) 去重只结算最新一条（二轮 P0-3）
      const rawPreds = await fetchAll(db, 'predictions', { m: m.id }, 500);
      const preds = dedupLatest(rawPreds);
      const kickTs = bjTs(m.t);

      // 被取代的旧文档标记作废（防未来规则变更时复活计分；幂等：已结算的跳过）
      const keepIds = new Set(preds.map(p => p._id));
      for (const old of rawPreds) {
        if (keepIds.has(old._id) || old.settledAt) continue;
        await db.collection('predictions').doc(old._id).update({
          data: { revealed: true, settledAt: Date.now(), hit: false, pts: 0, voidReason: 'superseded' }
        });
      }

      // uid -> 本场积分增量（跨群按 gid 分账）；
      // uidStats 同步累加命中/场次——注意结算前拉取的 preds 文档上没有 hit 字段
      // （hit 只随 update 落库），必须用本场结算算出的 update.hit 累加，
      // 否则 standings/users 的 hitCount 恒为 0（四轮 P1-2）
      const perGid = {};
      const uidStats = {};
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
        uidStats[uid] = uidStats[uid] || { pts: 0, count: 0, hit: 0, nick: p.nick || '' };
        uidStats[uid].pts += (update.pts || 0);
        uidStats[uid].count++;
        if (update.hit) uidStats[uid].hit++;
      }

      // 3. 写回 standings 总榜（按 gid 分群，uid 维度 upsert，nick 随最新封存同步）
      for (const gid of Object.keys(perGid)) {
        for (const uid of Object.keys(perGid[gid])) {
          const delta = perGid[gid][uid];
          if (!delta) continue;
          const st = uidStats[uid] || { hit: 0, nick: '' };
          const exist = await db.collection('standings')
            .where({ gid, uid }).limit(1).get();
          if (exist.data.length) {
            const patch = {
              pts: _.inc(delta),
              totalCount: _.inc(1),
              hitCount: _.inc(st.hit),
              updatedTs: Date.now()
            };
            if (st.nick) patch.nick = st.nick; // 改昵称后总榜同步展示
            await db.collection('standings').doc(exist.data[0]._id).update({ data: patch });
          } else {
            await db.collection('standings').add({
              data: {
                gid, uid,
                nick: st.nick || uid,
                pts: delta,
                totalCount: 1,
                hitCount: st.hit,
                updatedTs: Date.now()
              }
            });
            summary.standings++;
          }
        }
      }

      // 3.5 users 主表同步：按 uid 汇总本场跨 gid 全部增量后只写一次（四轮 P2-9），
      // seasonPts/等级以服务端结算为唯一权威来源（客户端不再回推，四轮 P2-5）
      for (const uid of Object.keys(uidStats)) {
        const st = uidStats[uid];
        if (!st.count) continue;
        try {
          const uExist = await db.collection('users').where({ uid }).limit(1).get();
          const basePts = uExist.data.length ? (uExist.data[0].seasonPts || 0) : 0;
          const finalPts = basePts + st.pts;
          const lvInfo = finalPts >= 150 ? { level: 6, levelTitle: '铁血名宿' }
            : finalPts >= 100 ? { level: 5, levelTitle: '战术宗师' }
            : finalPts >= 60 ? { level: 4, levelTitle: '预言大师' }
            : finalPts >= 30 ? { level: 3, levelTitle: '看台老炮' }
            : finalPts >= 10 ? { level: 2, levelTitle: '熬夜死忠' }
            : { level: 1, levelTitle: '新晋球客' };
          const uPatch = {
            seasonPts: _.inc(st.pts),
            ...lvInfo,
            totalPreds: _.inc(st.count),
            hitCount: _.inc(st.hit),
            updatedTs: Date.now()
          };
          if (st.nick) uPatch.nick = st.nick;
          if (uExist.data.length) {
            await db.collection('users').doc(uExist.data[0]._id).update({ data: uPatch });
          } else {
            // add 不支持 _.inc，首条文档直接落数值
            await db.collection('users').add({
              data: {
                uid, nick: st.nick || uid, seasonPts: finalPts,
                level: lvInfo.level, levelTitle: lvInfo.levelTitle,
                totalPreds: st.count, hitCount: st.hit,
                createdTs: Date.now(), updatedTs: Date.now()
              }
            });
          }
        } catch (uErr) {
          console.warn('[settleMatches] sync users table warning:', uErr.message);
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
