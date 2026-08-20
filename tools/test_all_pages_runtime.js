const fs = require('fs');
const path = require('path');
const storage = { followed: ['ARS', 'RMA', 'LIV'], predictions: {}, boasts: {}, checkins: {}, settings: { nick: '测试夜猫', budget: 4.0, theme: 'dark' }, onboarded: true };
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
  cloud: { init: () => {}, callFunction: () => Promise.resolve({ result: {} }), database: () => ({ collection: () => ({ where: () => ({ get: () => Promise.resolve({ data: [] }) }), doc: () => ({ get: () => Promise.resolve({ data: {} }) }) }) }) }
};
const appInstance = { globalData: { theme: 'dark' }, getFollowed: () => storage.followed || [], setFollowed: (list) => { storage.followed = list; }, applyTheme: () => {} };
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
    if (typeof ctx.onLoad === 'function') ctx.onLoad({ id: 'PL-1-ARS-COV', tab: 'owl' });
    if (typeof ctx.onShow === 'function') ctx.onShow();
    if (typeof ctx.refresh === 'function') ctx.refresh();
    console.log('  ✅ [pages/' + folder + '] onLoad & onShow & refresh 通过');
    passed++;
  } catch (err) {
    console.error('  ❌ [pages/' + folder + '] 异常:', err.message);
    failed++;
  }
});
console.log('\n测试总结: ' + passed + ' 页面通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);