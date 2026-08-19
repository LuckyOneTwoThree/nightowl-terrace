/**
 * 云函数：readBoard 榜单读取
 * 触发：客户端调用
 * 职责：盲评周榜 / 夜猫榜 / 德比法庭留言（只读聚合，按 gid 分群）
 * 安全（PM 八节权限规则）：
 *   - predictions / checkins / boasts 客户端只写不读，一律经本函数出聚合结果
 *   - 盲评截止前（各场开球时刻）只返回哈希与人数，不返回明文——防偷看
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 北京时间周一起始（参数 week 为 'YYYY-MM-DD' 时按该周，缺省取当前周）
// 云函数运行环境为 UTC，全部换算走北京墙钟：北京周一 00:00 = UTC 周日 16:00
// 同时返回展示日窗口 [fromStr, toStr)：与客户端 owlDay 口径一致（凌晨场归前一晚）
function weekRange(week) {
  let y, mo, d;
  if (week) {
    const f = week.split('-');
    y = Number(f[0]); mo = Number(f[1]) - 1; d = Number(f[2]);
  } else {
    const bj = new Date(Date.now() + 8 * 3600000); // 平移后 getUTC* 即北京墙钟
    y = bj.getUTCFullYear(); mo = bj.getUTCMonth(); d = bj.getUTCDate();
  }
  const dayStartUtcMs = Date.UTC(y, mo, d) - 8 * 3600000; // 北京当日 00:00 的真实时间戳
  const wd = new Date(Date.UTC(y, mo, d)).getUTCDay();    // 该日星期几（日历法，与时区无关）
  const back = (wd + 6) % 7;                              // 距周一几天（周一=0）
  const from = dayStartUtcMs - back * 86400000;
  return { from, to: from + 7 * 86400000, fromStr: toStrOf(from), toStr: toStrOf(from + 7 * 86400000) };
}

// 北京墙钟串 'YYYY-MM-DDTHH:mm' → 夜猫展示日（凌晨 00:00–06:00 归前一晚，与 engine.owlDay 一致）
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

function toStrOf(ts) {
  return new Date(ts + 8 * 3600000).toISOString().slice(0, 10);
}

/**
 * (uid, m) 去重：清缓存重封/降级直写会产生多条文档，聚合只认最新（sealTs 优先）
 * 与 seal 云函数的唯一性约束互补，防重复计分（审查报告 P1-2）
 */
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

exports.main = async (event) => {
  const db = cloud.database();
  const board = event.board;       // 'guess' | 'owl' | 'court' | 'season'
  const gid = event.gid || 'default';
  const week = event.week;         // 可选 'YYYY-MM-DD'（周内任意一天）

  try {
    if (board === 'guess') {
      // ── 盲评周榜：该周场次的封存预测，按 uid 聚合 ──
      // 周归属走 owlDay 展示日口径（与客户端 board.js 一致）：凌晨场归前一晚所在周
      const { fromStr, toStr } = weekRange(week);
      const _ = db.command;
      // 展示日 [fromStr, toStr) ⟺ 原始 t ∈ [fromStr T06:00, toStr T06:00)，字符串区间查询免全量拉取
      const fixtures = await db.collection('fixtures')
        .where({ t: _.gte(fromStr + 'T06:00').and(_.lt(toStr + 'T06:00')) })
        .limit(1000).get()
        .then(r => r.data)
        .catch(() => fetchAll(db, 'fixtures', {}, 2000)); // 索引/环境异常时回退全量
      const ids = new Set(fixtures
        .filter(m => { const d = owlDayOf(m.t); return d >= fromStr && d < toStr; }) // 双保险
        .map(m => m.id));
      const preds = dedupLatest((await fetchAll(db, 'predictions', { gid }, 2000))
        .filter(p => ids.has(p.m)));

      const now = Date.now();
      const agg = {}; // uid -> { nick, pts, count, hit, sealed: [..] }
      for (const p of preds) {
        const m = fixtures.find(x => x.id === p.m) || {};
        // m 未命中或时间非法时默认「封存中」：NaN > now 为 false，
        // 若直接用 bjTs(m.t) > now 会误判已开箱而泄露明文
        const kt = m.t ? bjTs(m.t) : NaN;
        const sealed = !(kt > now); // 仅明确已开球才视为已开箱
        const uid = p.uid || p._openid || ''; // 客户端直写时 uid 为空，回退 _openid
        agg[uid] = agg[uid] || { nick: p.nick || uid, pts: 0, count: 0, hit: 0, entries: [] };
        const a = agg[uid];
        if (p.pts) a.pts += p.pts;
        if (p.hit) a.hit++;
        a.count++;
        // 截止前只给哈希，截止后给明文（PM 权限规则）；比分串仅双方都填才拼（防 '2-'）
        const hasScore = p.scoreH != null && p.scoreH !== '' && p.scoreA != null && p.scoreA !== '';
        a.entries.push({
          m: p.m,
          nick: a.nick,
          hash: p.hash || null,
          pick: sealed ? null : (p.pick || null),
          score: sealed || !hasScore ? null : (p.scoreH + '-' + p.scoreA),
          pts: sealed ? null : (p.pts || 0),
          tampered: !!p.tampered
        });
      }
      const list = Object.values(agg)
        .sort((x, y) => y.pts - x.pts || y.count - x.count)
        .map((a, i) => ({ rank: i + 1, nick: a.nick, pts: a.pts, count: a.count, hit: a.hit, entries: a.entries }));
      return { ok: true, board, week: week || 'current', gid, sealed: Object.values(agg).some(a => a.entries.some(e => e.pick === null)), list };

    } else if (board === 'owl') {
      // ── 夜猫榜：该周打卡，按熬夜成本聚合 ──
      // 周归属优先用打卡时记录的比赛归属周 c.wk（凌晨场归前一晚，与客户端一致），
      // 无 wk 的旧数据回退打卡时间戳区间；并按 (uid, m) 去重防清缓存重打卡重复计数
      const { from, to, fromStr } = weekRange(week);
      const cis = dedupLatest((await fetchAll(db, 'checkins', { gid }, 2000))
        .filter(c => c.wk ? c.wk === fromStr : (c.ts >= from && c.ts < to)));
      const agg = {};
      for (const c of cis) {
        const uid = c.uid || c._openid || ''; // 客户端直写时回退 _openid
        agg[uid] = agg[uid] || { nick: c.nick || uid, hours: 0, nights: 0, worst: 0, worstM: null };
        const a = agg[uid];
        const cost = c.cost || 0;
        a.hours += cost;
        a.nights++;
        if (cost > a.worst) { a.worst = cost; a.worstM = c.m; }
      }
      const list = Object.values(agg)
        .sort((x, y) => y.hours - x.hours)
        .map((a, i) => ({ rank: i + 1, ...a }));
      // 最狠一夜（PM 9.5）：全群本周单场成本之最
      const worst = list.length ? list.reduce((mx, a) => (a.worst > mx.worst ? a : mx), list[0]) : null;
      return { ok: true, board, gid, list, worst: worst ? { nick: worst.nick, hours: worst.worst, m: worst.worstM } : null };

    } else if (board === 'court') {
      // ── 德比法庭：留言流（近 50 条，含人工判定结果）──
      const res = await db.collection('boasts')
        .where({ gid }).orderBy('ts', 'desc').limit(50).get();
      return {
        ok: true, board, gid,
        list: res.data.map(b => ({
          m: b.m, nick: b.nick || b.uid || b._openid, text: b.text, ts: b.ts,
          result: b.result || null // 'hit' | 'miss' | null（人工判定，PM 九节法庭）
        }))
      };

    } else if (board === 'season') {
      // ── 赛季总榜：standings 直读 ──
      const rows = await fetchAll(db, 'standings', { gid }, 500);
      const list = rows.sort((x, y) => y.pts - x.pts)
        .map((r, i) => ({ rank: i + 1, nick: r.nick || r.uid, pts: r.pts }));
      return { ok: true, board, gid, list };
    }

    return { ok: false, error: 'board 必须是 guess | owl | court | season' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
