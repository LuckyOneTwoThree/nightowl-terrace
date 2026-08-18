/**
 * 云开发服务层（最小闭环，PM 八节）
 * - 写入：best-effort 双写。本地 storage 始终为主数据源（M2 可跑），云端异步同步
 * - 读取：优先云函数聚合（readBoard），失败回退页面内置演示数据
 * - 降级：云环境未开通 / 集合未建 / 网络失败 → 标记本会话不可用，静默走本地，不弹错
 *   （下次冷启动自动重试；也可在设置页「重新连接云端」手动复位）
 */

var DOWN_KEY = '_cloudDown';
var down = false;
try { down = !!wx.getStorageSync(DOWN_KEY); } catch (e) { /* 忽略 */ }

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

/** 直写云数据库集合（客户端只写不读：predictions / checkins / boasts，PM 权限规则） */
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

// ---------- 玩法写入（字段对齐 PM 八节集合 schema；uid 由云端 _openid 自动补） ----------

function addPrediction(p) {
  return add('predictions', {
    m: p.m,
    gid: 'default', // openGid 群维度待分享卡片（T14）接入后替换
    nick: myNick(),
    pick: p.pick,
    score: (p.scoreH !== '' && p.scoreH != null) ? (p.scoreH + '-' + (p.scoreA || '0')) : null,
    salt: p.salt,   // 服务端结算复算哈希用；集合只写不读，截止前不外泄
    hash: p.hash,
    revealed: false,
    ts: p.ts
  });
}

function addCheckin(c) {
  return add('checkins', {
    m: c.m,
    gid: 'default',
    nick: myNick(),
    md: c.md,
    names: c.names,
    cost: c.cost,
    ts: c.ts
  });
}

function addBoast(b) {
  return add('boasts', {
    m: b.m,
    gid: 'default',
    nick: myNick(),
    text: b.text,
    result: null,
    ts: b.ts
  });
}

/** 榜单读取：readBoard 云函数聚合；失败 reject 由页面回退演示数据 */
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
  readBoard: readBoard
};
