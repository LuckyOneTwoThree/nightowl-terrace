const fs = require('fs');
const path = require('path');
const storage = {
  followed: ['ARS', 'RMA', 'LIV'],
  followedLeagues: ['PL', 'PD'],
  predictions: {},
  boasts: {},
  checkins: {},
  settings: { nick: '测试夜猫', budget: 4.0, theme: 'dark' },
  onboarded: true
};

global.wx = {
  getStorageSync: (k) => storage[k] || null,
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  showToast: () => {},
  showModal: ({ success }) => { if (success) success({ confirm: true }); },
  navigateTo: () => {}, switchTab: () => {}, redirectTo: () => {}, navigateBack: () => {},
  createCanvasContext: () => ({ draw: () => {}, fillRect: () => {}, fillText: () => {} }),
  canvasToTempFilePath: ({ success }) => { if (success) success({ tempFilePath: 'mock.png' }); },
  getSystemInfoSync: () => ({ theme: 'dark', windowWidth: 375, windowHeight: 667 }),
  vibrateShort: () => {},
  pageScrollTo: () => {},
  cloud: { init: () => {}, callFunction: () => Promise.resolve({ result: {} }), database: () => ({ collection: () => ({ where: () => ({ get: () => Promise.resolve({ data: [] }) }), doc: () => ({ get: () => Promise.resolve({ data: {} }) }) }) }) }
};

const appInstance = {
  globalData: { theme: 'dark', followedTeams: ['ARS', 'RMA', 'LIV'], followedLeagues: ['PL', 'PD'] },
  getFollowed: () => storage.followed || [],
  setFollowed: (list) => { storage.followed = list; },
  getFollowedLeagues: () => storage.followedLeagues || ['PL', 'PD', 'SA', 'BL', 'FL'],
  setFollowedLeagues: (list) => { storage.followedLeagues = list; },
  applyTheme: () => {}
};

global.getApp = () => appInstance;
global.App = (def) => Object.assign(appInstance, def);
const pagesDir = path.join(__dirname, '..', 'miniprogram', 'pages');
const pageFolders = fs.readdirSync(pagesDir).filter(f => fs.statSync(path.join(pagesDir, f)).isDirectory());
let passed = 0, failed = 0;
console.log('=== 全小程序 16 个页面运行时生命周期仿真测试 ===');
pageFolders.forEach(folder => {
  const jsPath = path.join(pagesDir, folder, folder + '.js');
  if (!fs.existsSync(jsPath)) return;
  let pageDef = null;
  global.Page = (def) => { pageDef = def; };
  try {
    delete require.cache[require.resolve(jsPath)];
    require(jsPath);
    if (!pageDef) { console.log('❌ [' + folder + '] 未注册'); failed++; return; }
    const ctx = { data: JSON.parse(JSON.stringify(pageDef.data || {})), setData: function(up) { Object.assign(this.data, up); }, ...pageDef };
    if (typeof ctx.onLoad === 'function') ctx.onLoad({ id: 'PL-1-ARS-COV', tab: 'leagues' });
    if (typeof ctx.onShow === 'function') ctx.onShow();
    if (typeof ctx.refresh === 'function') ctx.refresh();

    // 针对 onboarding 测试步骤切换
    if (folder === 'onboarding') {
      if (typeof ctx.goStep2 === 'function') ctx.goStep2();
      if (typeof ctx.goStep1 === 'function') ctx.goStep1();
      if (typeof ctx.toggleAllLeagues === 'function') ctx.toggleAllLeagues();
    }
    // 针对 teams 测试 tab 切换
    if (folder === 'teams') {
      if (typeof ctx.switchTab === 'function') {
        ctx.switchTab({ currentTarget: { dataset: { tab: 'teams' } } });
        ctx.switchTab({ currentTarget: { dataset: { tab: 'leagues' } } });
      }
    }
    // 针对 court 测试德比法庭两栏切换、抽屉与互动点赞
    if (folder === 'court') {
      if (typeof ctx.onMainTab === 'function') {
        ctx.onMainTab({ currentTarget: { dataset: { tab: 'dossier' } } });
        ctx.onMainTab({ currentTarget: { dataset: { tab: 'court' } } });
      }
      if (typeof ctx.togglePickerModal === 'function') ctx.togglePickerModal();
      if (typeof ctx.onPickerTab === 'function') {
        ctx.onPickerTab({ currentTarget: { dataset: { id: 'season' } } });
        ctx.onPickerTab({ currentTarget: { dataset: { id: 'done' } } });
        ctx.onPickerTab({ currentTarget: { dataset: { id: 'recent' } } });
      }
      if (typeof ctx.toggleDrawer === 'function') ctx.toggleDrawer();
      if (typeof ctx.toggleRuleModal === 'function') ctx.toggleRuleModal();
      if (typeof ctx.onSelectMatch === 'function' && ctx.data.cands && ctx.data.cands.length) {
        ctx.onSelectMatch({ currentTarget: { dataset: { id: ctx.data.cands[0].id } } });
      }
      if (typeof ctx.onSelectCamp === 'function') ctx.onSelectCamp({ currentTarget: { dataset: { camp: 'away' } } });
      if (typeof ctx.onQuickTag === 'function') ctx.onQuickTag({ currentTarget: { dataset: { tag: '🔥 零封拿下' } } });
      if (typeof ctx.submit === 'function') {
        ctx.submit(); // 首次提交
        ctx.submit(); // 二次尝试修改被阻断
      }
      if (typeof ctx.onReact === 'function') {
        ctx.onReact({ currentTarget: { dataset: { id: 'mock_h1_PL-1-ARS-COV', type: 'like' } } });
        ctx.onReact({ currentTarget: { dataset: { id: 'mock_h1_PL-1-ARS-COV', type: 'flag' } } });
        ctx.onReact({ currentTarget: { dataset: { id: 'mock_h1_PL-1-ARS-COV', type: 'milk' } } });
      }
      if (typeof ctx.onDebateTab === 'function') {
        ctx.onDebateTab({ currentTarget: { dataset: { id: 'home' } } });
        ctx.onDebateTab({ currentTarget: { dataset: { id: 'hot' } } });
      }
      if (typeof ctx.onArchiveTab === 'function') {
        ctx.onArchiveTab({ currentTarget: { dataset: { id: 'hit' } } });
      }
      if (typeof ctx.judge === 'function') {
        ctx.judge({ currentTarget: { dataset: { id: 'PL-1-ARS-COV', r: 'hit' } } });
      }
    }

    console.log('  ✅ [pages/' + folder + '] onLoad & onShow & 交互逻辑通过');
    passed++;
  } catch (err) {
    console.error('  ❌ [pages/' + folder + '] 异常:', err.stack || err.message);
    failed++;
  }
});

console.log('\n=== 推荐算法与关注联赛逻辑断言测试 ===');
try {
  const engine = require('../miniprogram/utils/engine.js');
  const data = require('../miniprogram/utils/data.js');

  const sampleMatches = [
    { id: 'PL-1-ARS-COV', l: 'PL', h: 'ARS', a: 'COV', t: '2026-08-22T03:00', st: 'sched', s: 3 },
    { id: 'PD-1-RMA-OSA', l: 'PD', h: 'RMA', a: 'OSA', t: '2026-08-22T03:00', st: 'sched', s: 3 },
    { id: 'FL-1-PSG-NAN', l: 'FL', h: 'PSG', a: 'NAN', t: '2026-08-22T03:00', st: 'sched', s: 3 },
    { id: 'SA-1-JUV-MIL', l: 'SA', h: 'JUV', a: 'MIL', t: '2026-08-22T03:00', st: 'sched', s: 3 }
  ];

  // 1. 用户关注英超（PL）与西甲（PD），无主队
  const evPL = engine.evaluate(sampleMatches[0], null, null, null, [], ['PL', 'PD']);
  const evFL = engine.evaluate(sampleMatches[2], null, null, null, [], ['PL', 'PD']);
  if (!evPL.isLeagueFollowed || evFL.isLeagueFollowed) {
    throw new Error('关注联赛标记判定错误');
  }
  const idxPL = engine.owlIndex(evPL, sampleMatches[0]);
  const idxFL = engine.owlIndex(evFL, sampleMatches[2]);
  if (idxPL <= idxFL) {
    throw new Error('关注联赛加成未正确提升夜猫指数: idxPL=' + idxPL + ', idxFL=' + idxFL);
  }
  console.log('  ✅ 关注联赛指数加成断言成功 (PL: ' + idxPL.toFixed(2) + ' > FL: ' + idxFL.toFixed(2) + ')');

  // 2. pickToday 测试
  const pickRes = engine.pickToday(sampleMatches, null, null, null, [], ['PL']);
  if (pickRes.hero.m.l !== 'PL') {
    throw new Error('pickToday 未优先选择关注联赛');
  }
  console.log('  ✅ pickToday 优先选中关注联赛 Hero (' + pickRes.hero.m.id + ')');

  // 3. planWeek 背包测试
  const plan = engine.planWeek(sampleMatches, null, null, null, [], 4.0, ['PL']);
  if (!plan.best.some(e => e.m.l === 'PL')) {
    throw new Error('planWeek 未将关注联赛排入背包');
  }
  console.log('  ✅ planWeek 0-1 背包成功优先规划关注联赛');

  passed++;
} catch (err) {
  console.error('  ❌ 推荐算法断言失败:', err.stack || err.message);
  failed++;
}

console.log('\n测试总结: ' + passed + ' 项通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);