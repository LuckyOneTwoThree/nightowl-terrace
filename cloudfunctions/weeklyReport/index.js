/**
 * 云函数：weeklyReport 周报生成
 * 触发：定时（周一 10:00 北京时间，见 config.json）或手动
 * 职责（PM 云函数清单）：
 *   1. 汇总上周 predictions / checkins / boasts
 *   2. 产出盲评周榜 + 修仙榜 + 最狠一夜 + 最准之口 + 法庭战报
 *   3. 快照写入 weeklyReports 集合（幂等：同周重复执行覆盖）
 *   4. 返回分享卡片数据
 * 依赖：settleMatches 已跑过（比分结算先行，周报只聚合）
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 北京时间「上一周」范围：周一 00:00 ～ 周日 24:00（云函数运行环境为 UTC）
// 附带展示日窗口 [fromStr, toStr)：与客户端 owlDay 口径一致（凌晨场归前一晚）
function lastWeekRange() {
  const bj = new Date(Date.now() + 8 * 3600000); // 平移后 getUTC* 即北京墙钟
  const dayStart = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - 8 * 3600000;
  const wd = new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate())).getUTCDay();
  const back = (wd + 6) % 7; // 距本周一几天
  const thisMonday = dayStart - back * 86400000;
  const from = thisMonday - 7 * 86400000, to = thisMonday;
  return { from, to, fromStr: toStrOf(from), toStr: toStrOf(to) };
}

function toStrOf(ts) {
  return new Date(ts + 8 * 3600000).toISOString().slice(0, 10);
}

// 北京墙钟串 → 夜猫展示日（凌晨 00:00–06:00 归前一晚，与 engine.owlDay / readBoard 一致）
function owlDayOf(t) {
  const f = String(t || '').split('T');
  const hm = (f[1] || '00:00').split(':');
  let day = f[0];
  if (Number(hm[0]) < 6) {
    const p = day.split('-').map(Number);
    day = new Date(Date.UTC(p[0], p[1] - 1, p[2]) - 86400000).toISOString().slice(0, 10);
  }
  return day;
}

// (uid, m) 去重：聚合只认最新文档（sealTs 优先），防重复计分（同 readBoard）
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

// 北京时间 'YYYY-MM-DDTHH:mm' → 时间戳（周归属按比赛开球时间，与 readBoard 一致）
function bjTs(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600000;
}

exports.main = async (event) => {
  const db = cloud.database();
  const { from, to, fromStr, toStr } = lastWeekRange();

  try {
    // ── 1. 盲评周榜（已结算积分）+ 最准之口 ──
    // 周归属按 owlDay 展示日（凌晨场归前一晚，与 readBoard/客户端一致）；
    // (uid, m) 去重防重复计分；uid 统一回退 _openid（客户端直写不携带 uid）
    const fixtures = await fetchAll(db, 'fixtures', {}, 2000);
    const mOwl = {};
    fixtures.forEach(f => { mOwl[f.id] = owlDayOf(f.t); });
    const preds = dedupLatest(await fetchAll(db, 'predictions', {}, 3000))
      .filter(p => !p.tampered && mOwl[p.m] != null && mOwl[p.m] >= fromStr && mOwl[p.m] < toStr);
    const guessAgg = {};
    for (const p of preds) {
      const uid = p.uid || p._openid || '';
      const k = (p.gid || 'default') + '|' + uid;
      guessAgg[k] = guessAgg[k] || { gid: p.gid || 'default', uid: uid, nick: p.nick || uid, pts: 0, hit: 0, count: 0 };
      guessAgg[k].pts += p.pts || 0;
      guessAgg[k].count++;
      if (p.hit) guessAgg[k].hit++;
    }
    const guessBoards = {};
    Object.values(guessAgg).forEach(a => {
      guessBoards[a.gid] = guessBoards[a.gid] || [];
      guessBoards[a.gid].push(a);
    });
    Object.keys(guessBoards).forEach(g => {
      guessBoards[g].sort((x, y) => y.pts - x.pts || y.hit - x.hit);
      guessBoards[g].forEach((a, i) => { a.rank = i + 1; });
    });
    const sharpest = {}; // 最准之口：各群周榜第一
    Object.keys(guessBoards).forEach(g => { if (guessBoards[g].length) sharpest[g] = guessBoards[g][0]; });

    // ── 2. 修仙榜（熬夜成本）+ 最狠一夜（PM 9.5）──
    // 周归属优先 c.wk（打卡时记录的比赛归属周），回退时间戳区间；去重防重复计数
    const cis = dedupLatest(await fetchAll(db, 'checkins', {}, 3000))
      .filter(c => c.wk ? c.wk === fromStr : (c.ts >= from && c.ts < to));
    const owlAgg = {};
    for (const c of cis) {
      const g = c.gid || 'default';
      owlAgg[g] = owlAgg[g] || {};
      const uid = c.uid || c._openid || '';
      owlAgg[g][uid] = owlAgg[g][uid] || { uid: uid, nick: c.nick || uid, hours: 0, nights: 0, worst: 0, worstM: null };
      const a = owlAgg[g][uid];
      const cost = c.cost || 0;
      a.hours += cost;
      a.nights++;
      if (cost > a.worst) { a.worst = cost; a.worstM = c.m; }
    }
    const owlBoards = {}, worstNight = {};
    Object.keys(owlAgg).forEach(g => {
      const list = Object.values(owlAgg[g]).sort((x, y) => y.hours - x.hours);
      list.forEach((a, i) => { a.rank = i + 1; });
      owlBoards[g] = list;
      if (list.length) {
        const w = list.reduce((mx, a) => (a.worst > mx.worst ? a : mx), list[0]);
        worstNight[g] = { nick: w.nick, hours: w.worst, m: w.worstM };
      }
    });

    // ── 3. 法庭战报（人工判定结果聚合：应验/翻车）──
    const boasts = (await fetchAll(db, 'boasts', {}, 2000))
      .filter(b => b.ts >= from && b.ts < to);
    const courtAgg = {};
    for (const b of boasts) {
      const g = b.gid || 'default';
      courtAgg[g] = courtAgg[g] || { total: 0, hit: 0, miss: 0, pending: 0, top: [] };
      const a = courtAgg[g];
      a.total++;
      if (b.result === 'hit') a.hit++;
      else if (b.result === 'miss') a.miss++;
      else a.pending++;
      a.top.push({ nick: b.nick || b.uid, text: b.text, result: b.result || null, m: b.m, ts: b.ts || 0 });
    }
    // 战报取最新 5 条：按 ts 降序截取（原 slice(-5) 截取的是未排序返回序）
    Object.values(courtAgg).forEach(a => {
      a.top.sort((x, y) => (y.ts || 0) - (x.ts || 0));
      a.top = a.top.slice(0, 5);
    });

    // ── 3.5 透支快照（PM 9.1 周一结算：上周实际 vs 预算）──
    const users = await fetchAll(db, 'users', {}, 2000);
    const budgetMap = {}; // uid -> 每周睡眠预算（默认 4h，PM 7.3）
    users.forEach(u => { const uid = u.uid || u._openid || ''; budgetMap[uid] = (u.budget != null ? u.budget : 4); });
    const overdraft = {}; // gid -> [{nick, hours, budget, over}]
    Object.keys(owlBoards).forEach(g => {
      overdraft[g] = owlBoards[g]
        .map(a => {
          const budget = budgetMap[a.uid] != null ? budgetMap[a.uid] : 4;
          return { uid: a.uid, nick: a.nick, hours: a.hours, budget, over: Math.max(0, +(a.hours - budget).toFixed(1)) };
        })
        .filter(a => a.over > 0)
        .sort((x, y) => y.over - x.over);
    });

    // ── 4. 快照落库（weeklyReports，同周覆盖）──
    const gids = Array.from(new Set([
      ...Object.keys(guessBoards), ...Object.keys(owlBoards), ...Object.keys(courtAgg)
    ]));
    const weekKey = new Date(from + 8 * 3600000).toISOString().slice(0, 10); // 周一日期
    const cards = [];
    for (const g of gids) {
      const report = {
        gid: g, week: weekKey, from, to, generatedAt: Date.now(),
        guess: guessBoards[g] || [],
        owl: owlBoards[g] || [],
        sharpest: sharpest[g] || null,
        worstNight: worstNight[g] || null,
        court: courtAgg[g] || { total: 0, hit: 0, miss: 0, pending: 0, top: [] },
        overdraft: overdraft[g] || []
      };
      const exist = await db.collection('weeklyReports').where({ gid: g, week: weekKey }).limit(1).get();
      if (exist.data.length) {
        await db.collection('weeklyReports').doc(exist.data[0]._id).update({ data: report });
      } else {
        await db.collection('weeklyReports').add({ data: report });
      }
      // 分享卡片数据（PM 九节：周一战报可分享进群）
      cards.push({
        gid: g, week: weekKey,
        title: '夜猫周报 · ' + weekKey,
        lines: [
          (report.sharpest ? '最准之口 ' + report.sharpest.nick + ' ' + report.sharpest.pts + ' 分' : '本周无人参战'),
          (report.worstNight ? '最狠一夜 ' + report.worstNight.nick + ' 熬 ' + report.worstNight.hours + 'h' : ''),
          '法庭应验 ' + report.court.hit + ' / 翻车 ' + report.court.miss,
          (report.overdraft.length ? '透支 ' + report.overdraft.length + ' 人，榜首 ' + report.overdraft[0].nick + ' 超 ' + report.overdraft[0].over + 'h' : '全员预算内')
        ].filter(Boolean)
      });
    }

    return { ok: true, week: weekKey, groups: gids.length, cards };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
