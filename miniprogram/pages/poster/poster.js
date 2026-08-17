var data = require('../../utils/data.js');
var decorate = require('../../utils/decorate.js');

Page({
  data: { m: null, slogan: '今晚哪场值得熬', sub: 'MIDNIGHT MATCH PREMIUM' },

  onLoad: function (q) {
    var raw = data.getMatch(q.id);
    if (!raw) {
      wx.showToast({ title: '场次不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    this.setData({ m: decorate.dec(raw, null, { followed: getApp().getFollowed() }) });
  },

  // ---------- Canvas 绘制（_10：9/16 海报） ----------

  initCanvas: function (cb) {
    var that = this;
    wx.createSelectorQuery().select('#poster').fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0]) return;
        var canvas = res[0].node;
        var dpr = wx.getSystemInfoSync().pixelRatio || 2;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        that._canvas = canvas;
        that._ctx = ctx;
        that._w = res[0].width;
        that._h = res[0].height;
        cb();
      });
  },

  draw: function (cb) {
    var m = this.data.m;
    if (!m || !this._ctx) return;
    var ctx = this._ctx, W = this._w, H = this._h;
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
    // 顶部联赛彩条
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, m.lgAccent || '#38003C');
    grad.addColorStop(.5, '#00FF85');
    grad.addColorStop(1, '#E90052');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 12);

    // 联赛章
    mono(m.lgEn.toUpperCase(), W / 2, 72, 22, '#E0E2EA');

    // 标语
    body(this.data.slogan, W / 2, 128, 40, '#FFD79E', 'center', '700');
    mono(this.data.sub, W / 2, 166, 18, '#9F8E79');

    // 球队圆标 + VS
    var cy = H * .40;
    [m.home, m.away].forEach(function (t, i) {
      var cx = i === 0 ? W * .26 : W * .74;
      ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2);
      ctx.fillStyle = '#181C21'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(159,142,121,.15)'; ctx.stroke();
      mono(t.id, cx, cy + 2, 30, '#E0E2EA', 'center', '700');
      body(t.zh, cx, cy + 92, 24, '#E0E2EA', 'center', '600');
    });
    body('VS', W / 2, cy - 8, 36, 'rgba(49,53,59,.9)', 'center', '700');

    // 时间面板
    var py = H * .60;
    ctx.fillStyle = 'rgba(16,20,25,.7)';
    var pw = W - 96, px = 48, ph = 210, pr = 16;
    ctx.beginPath();
    ctx.moveTo(px + pr, py); ctx.arcTo(px + pw, py, px + pw, py + ph, pr);
    ctx.arcTo(px + pw, py + ph, px, py + ph, pr);
    ctx.arcTo(px, py + ph, px, py, pr); ctx.arcTo(px, py, px + pw, py, pr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,142,121,.12)'; ctx.stroke();
    body(m.dayLabel, W / 2, py + 40, 24, '#D6C4AD');
    mono(m.hm, W / 2, py + 100, 64, '#E0E2EA', 'center', '700');
    // 分隔线
    ctx.beginPath(); ctx.moveTo(W / 2 - 30, py + 142); ctx.lineTo(W / 2 + 30, py + 142);
    ctx.strokeStyle = 'rgba(159,142,121,.2)'; ctx.stroke();
    // 星级 + 指数
    body('★★★☆☆'.slice(0, m.star), W / 2, py + 168, 24, '#FFB224');
    var chipY = py + ph + 40;
    mono('夜猫指数 ' + m.indexText, W / 2, chipY, 22, '#FFD79E');

    // 底部亮点
    var ly = H - 150;
    (m.points.length ? m.points.slice(0, 2) : [m.lgZh + ' 焦点战', '熬夜成本 ' + m.cost + 'h']).forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(px + 20, ly + i * 44, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#44E2CD'; ctx.fill();
      body(p, px + 40, ly + i * 44, 22, '#D6C4AD', 'left');
    });

    // 品牌脚注
    mono('夜猫看台 · NIGHT OWL TERRACE', W / 2, H - 40, 18, '#514533');

    if (cb) cb();
  },

  save: function () {
    var that = this;
    if (!this._canvas) {
      this.initCanvas(function () {
        that.draw(function () { that.export(); });
      });
      return;
    }
    this.draw(function () { that.export(); });
  },

  export: function () {
    var that = this;
    wx.canvasToTempFilePath({
      canvas: this._canvas,
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () { wx.showToast({ title: '已保存到相册' }); },
          fail: function (err) {
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
      fail: function () { wx.showToast({ title: '导出失败', icon: 'none' }); }
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
