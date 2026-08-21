/**
 * 云函数：seal 玩法写入收口（盲评封存 / 打卡 / 狂言 / 用户偏好同步）
 * 触发：客户端调用（替代 predictions/checkins/boasts 集合直写）
 * 职责（PM 八节权限规则 + 审查报告 P0-1/P1-2/P1-7）：
 *   1. 服务端落 sealTs（Date.now()，云环境可信时钟）——封存截止判据不再信任客户端 ts
 *   2. 归属写 uid（OPENID），云端结算/榜单聚合统一口径
 *   3. (uid, m) 唯一性：重复封存/打卡返回已有文档不重复计分；狂言为覆盖语义（同场可改口）
 *   4. prediction 前置校验：服务端复算 commit-reveal 哈希，不一致拒绝；开球后拒绝
 *   5. action=user：settings 变更 upsert users 集合（周报透支段 / 推送依赖）
 * 降级兼容：云函数不可用时客户端回退集合直写（无 sealTs），结算侧回退 ts+60s 宽容判据
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 与 miniprogram/utils/crypt.js、settleMatches 完全一致的载荷格式
function commitHash(p) {
  return crypto.createHash('sha256')
    .update(p.pick + '|' + (p.scoreH || '-') + ':' + (p.scoreA || '-') + '|' + p.salt, 'utf8')
    .digest('hex');
}

// 北京墙钟 'YYYY-MM-DDTHH:mm' → 时间戳（纯 UTC 算术）
function bjTs(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600000;
}

// (uid, m) 查重：返回已有文档或 null
async function findExisting(db, coll, uid, m) {
  const res = await db.collection(coll).where({ uid, m }).limit(1).get();
  return res.data.length ? res.data[0] : null;
}

// 场次校验（三轮 P0-2）：返回 { ok, kickTs }
// - 场次必须存在于 fixtures（挡住对不存在场次打卡/立据）
// - checkin/boast 窗口：开球前 6h ~ 开球后 36h（赛前立 flag + 看完补打两语义，
//   封死遍历历史/未来场次刷夜猫榜；tbd 占位时间双方相同，无法区分，窗口判据已尽力）
async function fixtureCheck(db, mId) {
  const fix = await db.collection('fixtures').where({ id: mId }).limit(1).get();
  if (!fix.data.length) return { ok: false, reason: 'match not found' };
  return { ok: true, kickTs: bjTs(fix.data[0].t) };
}

exports.main = async (event) => {
  const db = cloud.database();
  const wxCtx = cloud.getWXContext();
  const uid = wxCtx.OPENID || '';
  if (!uid) return { ok: false, error: 'no openid' };

  const action = event.action;
  const now = Date.now();

  try {
    // ── 盲评封存 ──
    if (action === 'prediction') {
      const p = {
        m: event.m, gid: event.gid || 'default', nick: event.nick || '夜猫',
        pick: event.pick, scoreH: event.scoreH || '', scoreA: event.scoreA || '',
        salt: event.salt, hash: event.hash
      };
      if (!p.m || !p.pick || !p.salt || !p.hash) return { ok: false, error: 'bad payload' };
      // 哈希前置校验：载荷被客户端篡改的封存直接拒绝入库
      if (commitHash(p) !== p.hash) return { ok: false, error: 'hash mismatch' };

      const fix = await db.collection('fixtures').where({ id: p.m }).limit(1).get();
      const kickTs = fix.data.length ? bjTs(fix.data[0].t) : NaN;
      if (!isNaN(kickTs) && kickTs <= now) {
        return { ok: false, error: 'kickoff passed' }; // 开球后禁封（服务端时钟）
      }

      const dup = await findExisting(db, 'predictions', uid, p.m);
      if (dup) return { ok: true, dup: true, id: dup._id }; // 已封存不重复写

      const doc = Object.assign({}, p, {
        score: (p.scoreH !== '' && p.scoreA !== '') ? (p.scoreH + '-' + p.scoreA) : null,
        uid, revealed: false, sealTs: now, ts: now
      });
      const added = await db.collection('predictions').add({ data: doc });
      return { ok: true, id: added._id, sealTs: now };
    }

    // ── 夜猫打卡 ──
    if (action === 'checkin') {
      const c = { m: event.m, gid: event.gid || 'default', nick: event.nick || '夜猫' };
      if (!c.m || event.cost == null) return { ok: false, error: 'bad payload' };
      // 场次存在 + 打卡窗口校验（三轮 P0-2：封死对未来/不存在场次批量打卡刷榜）
      const fk = await fixtureCheck(db, c.m);
      if (!fk.ok) return { ok: false, error: fk.reason };
      if (!isNaN(fk.kickTs) && (now < fk.kickTs - 6 * 3600000 || now > fk.kickTs + 36 * 3600000)) {
        return { ok: false, error: 'checkin window: 开球前6小时至后36小时' };
      }
      const dup = await findExisting(db, 'checkins', uid, c.m);
      if (dup) return { ok: true, dup: true, id: dup._id };
      const doc = Object.assign({}, c, {
        md: event.md || '', names: event.names || '', cost: Number(event.cost) || 0,
        wk: event.wk || null, // 比赛归属周（凌晨场归前一晚口径），榜单周过滤优先用
        uid, sealTs: now, ts: now
      });
      const added = await db.collection('checkins').add({ data: doc });
      return { ok: true, id: added._id, sealTs: now };
    }

    // ── 德比法庭狂言（支持赛前下战书立据与同人同场次安全覆盖更新） ──
    if (action === 'boast') {
      const b = { m: event.m, gid: event.gid || 'default', nick: event.nick || '夜猫' };
      if (!b.m || !event.text) return { ok: false, error: 'bad payload' };
      // 场次存在校验：狂言须挂在真实场次上
      const fb = await fixtureCheck(db, b.m);
      if (!fb.ok) return { ok: false, error: fb.reason };

      const doc = Object.assign({}, b, {
        text: String(event.text).slice(0, 40),
        md: event.md || '',
        names: event.names || '',
        camp: event.camp || 'neutral',
        likes: 0,
        flags: 0,
        milks: 0,
        result: null,
        uid,
        sealTs: now,
        ts: now
      });
      const dup = await findExisting(db, 'boasts', uid, b.m);
      if (dup) {
        // 同人同场次支持安全覆盖更新自己的狂言
        await db.collection('boasts').doc(dup._id).update({
          data: {
            text: doc.text,
            camp: doc.camp,
            md: doc.md,
            names: doc.names,
            nick: doc.nick,
            updatedTs: now,
            sealTs: now
          }
        });
        return { ok: true, id: dup._id, updated: true, sealTs: now };
      }
      const added = await db.collection('boasts').add({ data: doc });
      return { ok: true, id: added._id, sealTs: now };
    }

    // ── 德比法庭互动反应（点赞/插旗/毒奶） ──
    if (action === 'boast_reaction') {
      const boastId = event.id;
      const type = event.type; // 'like' | 'flag' | 'milk'
      // 幅度封顶 1~3：delta 完全信任客户端会被传 9999 刷榜（四轮 P2-8）
      const rawDelta = Number(event.delta) || 1;
      const delta = Math.min(3, Math.max(1, rawDelta));
      if (!boastId || !['like', 'flag', 'milk'].includes(type)) return { ok: false, error: 'bad payload' };
      const field = type === 'like' ? 'likes' : (type === 'flag' ? 'flags' : 'milks');
      try {
        const _ = db.command;
        if (_) {
          await db.collection('boasts').doc(boastId).update({ data: { [field]: _.inc(delta) } });
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    // ── 德比法庭判定 ──
    if (action === 'judge') {
      const boastId = event.id;
      const result = event.result; // 'hit' | 'miss' | null
      if (!boastId) return { ok: false, error: 'bad payload' };
      try {
        await db.collection('boasts').doc(boastId).update({ data: { result: result } });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    // ── 用户全景档案同步（首登初始化 / 偏好与战绩变动时 upsert users） ──
    if (action === 'user') {
      const exist = await db.collection('users').where({ uid }).limit(1).get();
      if (exist.data.length) {
        const u = exist.data[0];
        const patch = { updatedTs: now };
        if (event.nick) patch.nick = event.nick;
        if (event.budget != null) patch.budget = Number(event.budget);
        if (Array.isArray(event.followed)) patch.followed = event.followed;
        if (Array.isArray(event.followedLeagues)) patch.followedLeagues = event.followedLeagues;
        if (event.level != null) patch.level = Number(event.level);
        else if (u.level == null) patch.level = 1;
        if (event.levelTitle) patch.levelTitle = String(event.levelTitle);
        else if (!u.levelTitle) patch.levelTitle = '新晋球客';
        if (event.seasonPts != null) patch.seasonPts = Number(event.seasonPts);
        else if (u.seasonPts == null) patch.seasonPts = 0;
        if (event.hours != null) patch.hours = String(event.hours);
        else if (u.hours == null) patch.hours = '0h';
        if (event.totalPreds != null) patch.totalPreds = Number(event.totalPreds);
        else if (u.totalPreds == null) patch.totalPreds = 0;
        if (event.hitCount != null) patch.hitCount = Number(event.hitCount);
        else if (u.hitCount == null) patch.hitCount = 0;

        await db.collection('users').doc(u._id).update({ data: patch });
        return { ok: true, updated: true };
      }

      // 新用户建档：赋予全量完整规范字段
      const fullDoc = {
        uid,
        nick: event.nick || '夜猫',
        level: event.level != null ? Number(event.level) : 1,
        levelTitle: event.levelTitle || '新晋球客',
        seasonPts: event.seasonPts != null ? Number(event.seasonPts) : 0,
        hours: event.hours || '0h',
        totalPreds: event.totalPreds != null ? Number(event.totalPreds) : 0,
        hitCount: event.hitCount != null ? Number(event.hitCount) : 0,
        budget: event.budget != null ? Number(event.budget) : 4.0,
        followed: Array.isArray(event.followed) ? event.followed : ['ARS'],
        followedLeagues: Array.isArray(event.followedLeagues) ? event.followedLeagues : ['PL'],
        createdTs: now,
        updatedTs: now
      };
      await db.collection('users').add({ data: fullDoc });
      return { ok: true, created: true };
    }

    return { ok: false, error: 'action 必须是 prediction | checkin | boast | boast_reaction | judge | user' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
