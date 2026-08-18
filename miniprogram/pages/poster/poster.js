var data = require('../../utils/data.js');
var decorate = require('../../utils/decorate.js');

Page({
  onShow: function () { getApp().applyTheme(this); },
  data: { m: null, slogan: '今晚哪场值得熬', sub: 'MIDNIGHT MATCH PREMIUM' },

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
    var m = this.data.m;
    if (!m || !this._ctx) return;
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
    mono(m.lgEn.toUpperCase(), W / 2, 216, 66, '#E0E2EA');
    body(this.data.slogan, W / 2, 384, 120, '#FFD79E', 'center', '700');
    mono(this.data.sub, W / 2, 498, 54, '#9F8E79');

    // 球队圆标 + VS
    var cy = H * .40;
    [m.home, m.away].forEach(function (t, i) {
      var cx = i === 0 ? W * .26 : W * .74;
      ctx.beginPath(); ctx.arc(cx, cy, 174, 0, Math.PI * 2);
      ctx.fillStyle = t.bg || '#181C21'; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = t.bd || 'rgba(159,142,121,.15)'; ctx.stroke();
      mono(t.id, cx, cy + 6, 90, '#E0E2EA', 'center', '700');
      body(t.zh, cx, cy + 276, 72, '#E0E2EA', 'center', '600');
    });
    body('VS', W / 2, cy - 24, 108, 'rgba(49,53,59,.9)', 'center', '700');

    // 时间面板（北京时间大字 + 当地时间小字，PM 7.1）
    var py = H * .60;
    ctx.fillStyle = 'rgba(16,20,25,.7)';
    var pw = W - 288, px = 144, ph = 630, pr = 48;
    ctx.beginPath();
    ctx.moveTo(px + pr, py); ctx.arcTo(px + pw, py, px + pw, py + ph, pr);
    ctx.arcTo(px + pw, py + ph, px, py + ph, pr);
    ctx.arcTo(px, py + ph, py, py, pr); ctx.arcTo(px, py, px + pw, py, pr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,142,121,.12)'; ctx.lineWidth = 3; ctx.stroke();
    body(m.dateHeader, W / 2, py + 96, 56, '#D6C4AD');
    mono(m.hm, W / 2, py + 240, 192, '#E0E2EA', 'center', '700');
    mono('北京时间', W / 2, py + 360, 42, '#9F8E79');
    if (m.local && !m.tbd) mono('当地 ' + m.local, W / 2, py + 420, 42, '#9F8E79');
    // 分隔线
    ctx.beginPath(); ctx.moveTo(W / 2 - 90, py + 480); ctx.lineTo(W / 2 + 90, py + 480);
    ctx.strokeStyle = 'rgba(159,142,121,.2)'; ctx.lineWidth = 3; ctx.stroke();
    // 星级
    body('★★★☆☆'.slice(0, m.star), W / 2, py + 546, 72, '#FFB224');
    mono('夜猫指数 ' + m.indexText, W / 2, py + ph + 120, 66, '#FFD79E');

    // 三条看点（PM 7.6）
    var ly = H - 560;
    (m.points.length ? m.points.slice(0, 3) : [m.lgZh + ' 焦点战', '熬夜成本 ' + m.cost + 'h', m.stars + ' 级之夜']).forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(px + 30, ly + i * 78, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#44E2CD'; ctx.fill();
      body(p, px + 84, ly + i * 78, 60, '#D6C4AD', 'left');
    });

    // 品牌位（PM 7.6）
    mono('夜猫看台 · NIGHT OWL TERRACE', W / 2, H - 120, 54, '#514533');

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
      width: 1080,
      height: 1920,
      destWidth: 1080,
      destHeight: 1920,
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
