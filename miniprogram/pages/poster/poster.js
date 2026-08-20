var data = require('../../utils/data.js');
var decorate = require('../../utils/decorate.js');

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: {
    theme: data.getInitTheme(), m: null, slogan: '今晚哪场值得熬', sub: 'MIDNIGHT MATCH PREMIUM' },

  onLoad: function (q) {
    var raw = data.getMatch(q.id);
    if (!raw) {
      wx.showToast({ title: '场次不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    var m = decorate.dec(raw, null, { followed: getApp().getFollowed() });
    // 标语沿用夜猫口径（dayLabel 已把 <06:00 归前一晚，与日历视图一致）
    var slogan = m.dayLabel === '今天' ? '今晚哪场值得熬'
      : m.dayLabel === '明天' ? '明晚哪场值得熬'
      : '焦点大战值得熬';

    this.setData({
      m: m,
      slogan: slogan,
      sub: 'MIDNIGHT MATCH PREMIUM'
    });
  },

  // ---------- Canvas 绘制（PM 7.6：1080×1920 竖版导出） ----------

  initCanvas: function (cb) {
    var that = this;
    wx.createSelectorQuery().select('#poster').fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0]) return;
        var canvas = res[0].node;
        // 固定导出分辨率（与设备无关）；CSS 负责视觉缩放预览
        canvas.width = 1080;
        canvas.height = 1920;
        that._canvas = canvas;
        that._ctx = canvas.getContext('2d');
        cb();
      });
  },

  draw: function (cb) {
    var that = this;
    var m = this.data.m;
    if (!m || !this._ctx) return;
    // 队徽为包内本地资源（images/crests/），createImage 直接加载后绘制，失败回退三字码
    this._loadLogos(function (homeImg, awayImg) {
      that._paint(homeImg, awayImg);
      if (cb) cb();
    });
  },

  _loadLogos: function (cb) {
    var that = this;
    var m = this.data.m;
    var load = function (team) {
      if (!team || !team.logo) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var img = that._canvas.createImage();
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = team.logo; // 本地包内路径（images/crests/），无网络依赖
      });
    };
    Promise.all([load(m.home), load(m.away)]).then(function (r) { cb(r[0], r[1]); });
  },

  _paint: function (homeImg, awayImg) {
    var m = this.data.m;
    var ctx = this._ctx, W = 1080, H = 1920;
    var mono = function (s, x, y, size, color, align, weight) {
      ctx.font = (weight || '500') + ' ' + size + 'px "SF Mono", Menlo, monospace';
      ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    };
    var body = function (s, x, y, size, color, align, weight) {
      ctx.font = (weight || '400') + ' ' + size + 'px "PingFang SC", sans-serif';
      ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    };

    // 底
    ctx.fillStyle = '#0B0F14';
    ctx.fillRect(0, 0, W, H);
    // 顶部联赛彩条（联赛主题色 PM 7.6）
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, m.lgAccent || '#38003C');
    grad.addColorStop(.5, '#00FF85');
    grad.addColorStop(1, '#E90052');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 36);

    // 联赛章 + 标语
    mono(m.lgEn.toUpperCase(), W / 2, 150, 58, '#E0E2EA');
    body(this.data.slogan, W / 2, 300, 100, '#FFD79E', 'center', '700');
    mono(this.data.sub, W / 2, 402, 46, '#9F8E79');

    // 球队圆标 + VS（本地队徽等比缩放绘制，未收录回退三字码）
    var cy = 630, R = 174;
    [[m.home, homeImg, W * .25], [m.away, awayImg, W * .75]].forEach(function (t) {
      var team = t[0], img = t[1], cx = t[2];
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = team.bg || '#181C21'; ctx.fill();
      if (img) {
        // 队徽非正方形（如 ARS 139×181），等比缩放至圆内 90% 居中，圆形裁剪防溢出
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        var box = R * 2 * 0.9;
        var s = Math.min(box / img.width, box / img.height);
        ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
        ctx.restore();
      } else {
        mono(team.id, cx, cy + 6, 84, '#E0E2EA', 'center', '700');
      }
      ctx.lineWidth = 6; ctx.strokeStyle = team.bd || 'rgba(159,142,121,.15)'; ctx.stroke();
      body(team.zh, cx, cy + 244, 68, '#E0E2EA', 'center', '600');
    });
    body('VS', W / 2, cy + 6, 100, 'rgba(214,196,173,.4)', 'center', '700');

    // 时间面板（北京时间大字 + 当地时间小字，PM 7.1）
    var py = 1000, ph = 400, px = 130, pw = W - 260, pr = 40;
    ctx.fillStyle = 'rgba(16,20,25,.7)';
    ctx.beginPath();
    ctx.moveTo(px + pr, py); ctx.arcTo(px + pw, py, px + pw, py + ph, pr);
    ctx.arcTo(px + pw, py + ph, px, py + ph, pr);
    ctx.arcTo(px, py + ph, px, py, pr); ctx.arcTo(px, py, px + pw, py, pr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,142,121,.12)'; ctx.lineWidth = 3; ctx.stroke();
    body(m.dateHeader, W / 2, py + 66, 52, '#D6C4AD');
    mono(m.hm, W / 2, py + 190, 150, '#E0E2EA', 'center', '700');
    mono('北京时间' + (m.local && !m.tbd ? ' · 当地 ' + m.local : ''), W / 2, py + 300, 38, '#9F8E79');

    // 分隔线 + 星级 + 夜猫指数
    ctx.beginPath(); ctx.moveTo(W / 2 - 90, 1440); ctx.lineTo(W / 2 + 90, 1440);
    ctx.strokeStyle = 'rgba(159,142,121,.2)'; ctx.lineWidth = 3; ctx.stroke();
    body('★★★☆☆'.slice(0, m.star), W / 2, 1486, 66, '#FFB224');
    mono('夜猫指数 ' + m.indexText, W / 2, 1554, 60, '#FFD79E');

    // 三条看点（PM 7.6）：长文案先缩字号、仍超宽则截断，保证不越过右边界
    var pts = m.points.length ? m.points.slice(0, 3) : [m.lgZh + ' 焦点战', '熬夜成本 ' + m.cost + 'h', m.stars + ' 级之夜'];
    var py2 = 1640, tx = px + 72, maxW = W - tx - 60;
    var fitText = function (s) {
      var size = 54;
      ctx.font = '400 ' + size + 'px "PingFang SC", sans-serif';
      while (size > 42 && ctx.measureText(s).width > maxW) {
        size -= 2;
        ctx.font = '400 ' + size + 'px "PingFang SC", sans-serif';
      }
      if (ctx.measureText(s).width > maxW) {
        while (s.length > 4 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
        s += '…';
      }
      return { s: s, size: size };
    };
    pts.forEach(function (p, i) {
      var y = py2 + i * 62, f = fitText(p);
      ctx.beginPath(); ctx.arc(px + 24, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#44E2CD'; ctx.fill();
      body(f.s, tx, y, f.size, '#D6C4AD', 'left');
    });

    // 品牌位（PM 7.6）
    mono('夜猫看台 · NIGHT OWL TERRACE', W / 2, 1872, 50, 'rgba(159,142,121,.6)');
  },

  save: function () {
    var that = this;
    if (this._saving) return;
    this._saving = true;
    wx.showLoading({ title: '正在生成海报', mask: true });
    var done = function () { that._saving = false; wx.hideLoading(); };
    var run = function () {
      that.draw(function () { that.export(done); });
    };
    if (!this._canvas) {
      this.initCanvas(function () {
        if (!that._canvas) { done(); wx.showToast({ title: '画布初始化失败', icon: 'none' }); return; }
        run();
      });
      return;
    }
    run();
  },

  // 注意：对 type=2d canvas 只传 canvas 节点，默认导出整个画布（1080×1920 原生分辨率）。
  // 显式传 width/height 时部分基础库按 CSS 尺寸解释，会造成截取错位、内容拉伸错乱。
  export: function (done) {
    var that = this;
    wx.canvasToTempFilePath({
      canvas: this._canvas,
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () { done(); wx.showToast({ title: '已保存到相册' }); },
          fail: function (err) {
            done();
            if (/auth/.test(err.errMsg || '')) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存到相册',
                confirmText: '去设置',
                success: function (r) { if (r.confirm) wx.openSetting(); }
              });
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          }
        });
      },
      fail: function () { done(); wx.showToast({ title: '导出失败', icon: 'none' }); }
    });
  },

  share: function () {
    var m = this.data.m;
    if (!m) return;
    wx.setClipboardData({
      data: '【今晚哪场值得熬】' + m.md + ' ' + m.hm + ' ' + m.home.zh + ' vs ' + m.away.zh + '（' + m.stars + ' · 夜猫指数 ' + m.indexText + '）',
      success: function () { wx.showToast({ title: '已复制，去粘贴进群', icon: 'none' }); }
    });
  }
});
