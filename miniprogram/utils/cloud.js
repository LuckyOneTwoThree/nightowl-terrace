/**
 * 云开发服务层（最小闭环，PM 八节）
 * - 写入：优先走 seal 云函数（服务端 sealTs + openid + (uid,m) 唯一性，防伪造时间戳/重复计分）
 *        seal 不可用时降级集合直写（本地 storage 始终为主数据源，M2 可跑）
 * - 读取：优先云函数聚合（readBoard），失败时榜单显示空态引导
 * - 降级：云环境未开通 / 集合未建 / 网络失败 → 标记本会话不可用，静默走本地，不弹错
 *   （下次冷启动自动重试；也可在设置页「重新连接云端」手动复位）
 */

var DOWN_KEY = '_cloudDown';
var DOWN_TTL = 10 * 60 * 1000; // 降级闩锁时长：瞬时失败（断网等）10 分钟后自动重试
var down = false;
try {
  var downAt = wx.getStorageSync(DOWN_KEY);
  // 仅在闩锁有效期内保持降级；过期自动复位（防止一次飞行模式导致永久断云、云端数据分叉）
  down = !!downAt && (Date.now() - downAt < DOWN_TTL);
  if (!down && downAt) { try { wx.removeStorageSync(DOWN_KEY); } catch (e2) { /* 忽略 */ } }
} catch (e) { /* 忽略 */ }

function markDown() {
  down = true;
  try { wx.setStorageSync(DOWN_KEY, Date.now()); } catch (e) { /* 忽略 */ }
}
function markUp() {
  if (down) {
    down = false;
    try { wx.removeStorageSync(DOWN_KEY); } catch (e) { /* 忽略 */ }
  }
}

function available() {
  return !down && !!wx.cloud;
}

/** 调云函数；失败标记降级并 reject（调用方自行回退） */
function call(name, payload) {
  if (!available()) return Promise.reject(new Error('cloud unavailable'));
  return wx.cloud.callFunction({ name: name, data: payload }).then(function (r) {
    markUp();
    var res = r && r.result;
    if (res && res.ok === false) throw new Error(res.error || 'cloud fn error');
    return res;
  }).catch(function (err) {
    markDown();
    throw err;
  });
}

/**
 * seal 云函数调用：失败只降级不闩锁（seal 未部署 ≠ 云环境断连，
 * 降级直写仍可用；闩锁留给 readBoard 等纯读链路）
 */
function callSeal(payload) {
  if (!available() || !wx.cloud.callFunction) return Promise.resolve(false);
  return wx.cloud.callFunction({ name: 'seal', data: payload }).then(function (r) {
    var res = r && r.result;
    if (res && res.ok === false) return false; // 业务拒绝（重复封存/哈希不符等）静默降级
    markUp();
    return true;
  }).catch(function () { return false; });
}

/** 直写云数据库集合（降级路径：客户端只写不读，_openid 由云端自动补） */
function add(coll, doc) {
  if (!available() || !wx.cloud.database) return Promise.resolve(false);
  return wx.cloud.database().collection(coll).add({ data: doc })
    .then(function () { markUp(); return true; })
    .catch(function () { markDown(); return false; });
}

function myNick() {
  var s = wx.getStorageSync('settings') || {};
  return s.nick || wx.getStorageSync('nickname') || '夜猫';
}

// ---------- 玩法写入（字段对齐 PM 八节集合 schema；uid/sealTs 由 seal 云函数服务端落） ----------

function addPrediction(p) {
  var doc = {
    m: p.m,
    gid: 'default', // openGid 群维度待分享卡片（T14）接入后替换
    nick: myNick(),
    pick: p.pick,
    // 比分串仅双方都填写时写入（半比分不拼 '2-0'，与结算判据一致）
    score: (p.scoreH !== '' && p.scoreH != null && p.scoreA !== '' && p.scoreA != null) ? (p.scoreH + '-' + p.scoreA) : null,
    scoreH: p.scoreH || '', // 服务端复算哈希 + 比分加分判据都要用到
    scoreA: p.scoreA || '',
    salt: p.salt,   // 服务端结算复算哈希用；集合只写不读，截止前不外泄
    hash: p.hash,
    revealed: false,
    ts: p.ts
  };
  // 优先 seal 云函数（服务端 sealTs + (uid,m) 唯一 + 哈希前置校验）；失败降级直写
  return callSeal({
    action: 'prediction', m: doc.m, gid: doc.gid, nick: doc.nick,
    pick: doc.pick, scoreH: doc.scoreH, scoreA: doc.scoreA, salt: doc.salt, hash: doc.hash
  }).then(function (sealed) {
    return sealed ? true : add('predictions', doc);
  });
}

function addCheckin(c) {
  return callSeal({
    action: 'checkin', m: c.m, gid: 'default', nick: myNick(),
    md: c.md, names: c.names, cost: c.cost, wk: c.wk || null
  }).then(function (sealed) {
    return sealed ? true : add('checkins', {
      m: c.m,
      gid: 'default',
      nick: myNick(),
      md: c.md,
      names: c.names,
      cost: c.cost,
      wk: c.wk || null,
      ts: c.ts
    });
  });
}

function addBoast(b) {
  return callSeal({
    action: 'boast', m: b.m, gid: 'default', nick: myNick(),
    text: b.text, md: b.md || '', names: b.names || ''
  }).then(function (sealed) {
    return sealed ? true : add('boasts', {
      m: b.m,
      gid: 'default',
      nick: myNick(),
      text: b.text,
      result: null,
      ts: b.ts
    });
  });
}

/**
 * 用户偏好同步：settings 变更时 upsert users 集合
 * （weeklyReport 透支预算段 / pushReminders 关注推送依赖该集合）
 */
function syncUser(settings) {
  settings = settings || {};
  return callSeal({
    action: 'user',
    nick: settings.nick || myNick(),
    budget: settings.budget,
    followed: settings.followed || undefined
  });
}

// ---------- 订阅消息（模板 ID 在微信后台申请后填入；空值时客户端跳过授权请求） ----------
var TMPL = {
  kickoff: '',   // 开球提醒模板（pushReminders TMPL_KICKOFF 同步配置）
  deadline: ''   // 盲评截止提醒模板（pushReminders TMPL_DEADLINE 同步配置）
};

/** 授权结果落库 subscriptions（pushReminders 扫描 status:'accept'） */
function saveSubscription(tmplId, status) {
  return add('subscriptions', { tmplId: tmplId, status: status, ts: Date.now() });
}

/** 榜单读取：readBoard 云函数聚合；失败 reject 由页面渲染空态引导 */
function readBoard(board, gid, week) {
  return call('readBoard', { board: board, gid: gid || 'default', week: week || undefined });
}

module.exports = {
  available: available,
  reset: function () { // 设置页「重新连接云端」用
    down = false;
    try { wx.removeStorageSync(DOWN_KEY); } catch (e) { /* 忽略 */ }
  },
  call: call,
  addPrediction: addPrediction,
  addCheckin: addCheckin,
  addBoast: addBoast,
  syncUser: syncUser,
  saveSubscription: saveSubscription,
  TMPL: TMPL,
  readBoard: readBoard
};
