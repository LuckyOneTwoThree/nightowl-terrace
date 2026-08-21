/**
 * 智能防循环路由工具（Router Navigation Helper）
 * - 解决页面深度嵌套引起的「返回死循环」与「页面栈爆栈(10层上限)」问题
 * - 智能策略：
 *   1. 若目标是 TabBar 页面 -> 自动使用 wx.switchTab
 *   2. 若页面栈中已有完全相同的目标页面(含参数) -> 智能计算 delta 执行 wx.navigateBack，并自动刷新
 *   3. 若页面栈过深 (>= 4 层) 且目标是同级玩法/详情页 -> 使用 wx.redirectTo 替换当前页，防止死循环
 *   4. 正常浅层跳转 -> 执行 wx.navigateTo
 */

var TAB_PAGES = [
  'pages/today/today',
  'pages/week/week',
  'pages/schedule/schedule',
  'pages/play/play',
  'pages/me/me'
];

function cleanPath(url) {
  if (!url) return '';
  var path = url.split('?')[0];
  if (path.indexOf('/') === 0) path = path.slice(1);
  return path;
}

function parseQuery(url) {
  var q = {};
  if (!url || url.indexOf('?') === -1) return q;
  var str = url.split('?')[1];
  var parts = str.split('&');
  parts.forEach(function (p) {
    var kv = p.split('=');
    if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || '');
  });
  return q;
}

/**
 * 智能跳转主入口
 * @param {string} url 目标路径，如 '/pages/detail/detail?id=PL-1-ARS-COV'
 * @param {object} [options] 配置项 { replace: boolean }
 */
function navTo(url, options) {
  if (!url) return;
  options = options || {};
  var targetPath = cleanPath(url);

  // 1. TabBar 页面直通
  for (var i = 0; i < TAB_PAGES.length; i++) {
    if (targetPath === TAB_PAGES[i]) {
      var tabUrl = '/' + TAB_PAGES[i];
      wx.switchTab({ url: tabUrl });
      return;
    }
  }

  var pages = getCurrentPages ? getCurrentPages() : [];
  var targetQuery = parseQuery(url);

  // 2. 检查页面栈中是否存在相同的目标页面（防止 A -> B -> A 循环）
  if (pages && pages.length > 1) {
    var foundIndex = -1;
    for (var idx = pages.length - 2; idx >= 0; idx--) {
      var p = pages[idx];
      var pageRoute = cleanPath(p.route);
      if (pageRoute === targetPath) {
        // 如果是 detail 或 court 页面，进一步比对 id 参数
        var pageOpts = p.options || {};
        if (targetQuery.id && pageOpts.id) {
          if (targetQuery.id === pageOpts.id) {
            foundIndex = idx;
            break;
          }
        } else if (!targetQuery.id && !pageOpts.id) {
          foundIndex = idx;
          break;
        }
      }
    }

    // 命中历史栈已有实例：直接计算 delta 回退，杜绝无限套娃
    if (foundIndex >= 0) {
      var delta = pages.length - 1 - foundIndex;
      var targetPage = pages[foundIndex];
      wx.navigateBack({
        delta: delta,
        success: function () {
          // 若目标页面有 refresh 或 onLoad 逻辑，通知其按新参数刷新
          if (targetPage) {
            if (targetQuery.id && targetPage.options) {
              targetPage.options.id = targetQuery.id;
            }
            if (targetPage.refresh) {
              try { targetPage.refresh(); } catch (e) {}
            }
          }
        }
      });
      return;
    }
  }

  // 3. 防爆栈与防环：若页面栈深度已 >= 4，或者明确指定 replace，则使用 redirectTo 替换
  if (options.replace || (pages && pages.length >= 4)) {
    wx.redirectTo({
      url: url,
      fail: function () {
        wx.navigateTo({ url: url });
      }
    });
    return;
  }

  // 4. 正常浅层跳转
  wx.navigateTo({
    url: url,
    fail: function () {
      wx.redirectTo({ url: url });
    }
  });
}

/**
 * 安全返回：若无法返回（如分享卡片直接进入的单页面），则安全回退到首页
 */
function safeBack(fallbackUrl) {
  var pages = getCurrentPages ? getCurrentPages() : [];
  if (pages && pages.length > 1) {
    wx.navigateBack();
  } else {
    wx.switchTab({ url: fallbackUrl || '/pages/today/today' });
  }
}

module.exports = {
  navTo: navTo,
  safeBack: safeBack,
  cleanPath: cleanPath
};
