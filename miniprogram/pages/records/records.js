var data = require('../../utils/data.js');
var engine = require('../../utils/engine.js');
var decorate = require('../../utils/decorate.js');
var crypt = require('../../utils/crypt.js');

var WEEK = decorate.WEEK;

function labelOf(dateStr) {
  var f = dateStr.split('-');
  var d = new Date(Number(f[0]), Number(f[1]) - 1, Number(f[2]));
  return Number(f[1]) + '月' + Number(f[2]) + '日 周' + WEEK[d.getDay()];
}

// 结算：统一走 engine.settlePred（与 play 页赛季积分 / 云端 settleMarks 判据一致，PM 9.4）
function settle(pred, m, recMap) {
  return engine.settlePred(pred, m, recMap);
}

Page({
  data: {
    theme: data.getInitTheme(), groups: [], empty: false },

  onLoad: function () {
    getApp().applyTheme(this);
  },

  onShow: function () {
    getApp().applyTheme(this); this.refresh(); },

  refresh: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var boasts = wx.getStorageSync('boasts') || {};
    var checkins = wx.getStorageSync('checkins') || {};
    var recMap = data.getRecMap();

    var rows = [];
    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid], m = data.getMatch(mid);
      if (!m) return;
      // commit-reveal 校验（PM 八节）：哈希不一致或开球后才封存 → 作废不计分
      var tampered = !crypt.verify(p);
      var late = !!p.ts && p.ts > engine.ts(m.t) + 60000; // 1 分钟宽容（客户端时钟偏差）
      var r = (tampered || late) ? null : settle(p, m, recMap);
      var pickZh = p.pick === 'h' ? '主胜' : p.pick === 'd' ? '平局' : '客胜';
      var hTeam = data.getTeam(m.h) || {};
      var aTeam = data.getTeam(m.a) || {};
      rows.push({
        key: 'pred-' + mid, mid: mid,
        label: labelOf(m.t.split('T')[0]),
        sort: p.ts || 0, type: 'pred',
        names: (hTeam.zh || m.h) + ' vs ' + (aTeam.zh || m.a),
        logo: hTeam.logo || '',
        sub: tampered ? '封存校验失败 · 已作废'
          : late ? '开球后封存 · 已作废'
          : '预测: ' + pickZh + ((p.scoreH !== '' && p.scoreH != null && p.scoreA !== '' && p.scoreA != null) ? ' (' + p.scoreH + '-' + p.scoreA + ')' : '') + (r && r.upset ? ' · 冷门×2' : ''),
        // 已赛但比分未录入（r=null）时按 isFinished 标完赛，不误显示未完（二轮 P2-2）
        finished: tampered || late || engine.isFinished(m) || !!r,
        hit: r ? r.hit : false,
        pts: r ? r.pts : 0,
        tampered: tampered || late
      });
    });
    Object.keys(boasts).forEach(function (mid) {
      var b = boasts[mid], m = data.getMatch(mid);
      var lbl = m ? labelOf(m.t.split('T')[0]) : (b.md || '焦点对决');
      rows.push({
        key: 'boast-' + mid, mid: mid,
        label: lbl, sort: b.ts || 0, type: 'boast',
        names: b.names, sub: b.text,
        finished: b.result != null, hit: b.result === 'hit', pts: 0
      });
    });
    Object.keys(checkins).forEach(function (mid) {
      var c = checkins[mid], m = data.getMatch(mid);
      var lbl = m ? labelOf(m.t.split('T')[0]) : (c.md || '深夜修仙');
      rows.push({
        key: 'ci-' + mid, mid: mid,
        label: lbl, sort: c.ts || 0, type: 'checkin',
        names: c.names, sub: '夜猫打卡', cost: c.cost,
        finished: true, hit: true, pts: 0
      });
    });

    rows.sort(function (a, b) { return b.sort - a.sort; });
    var seen = {}, groups = [];
    rows.forEach(function (r) {
      if (!seen[r.label]) { seen[r.label] = { label: r.label, rows: [] }; groups.push(seen[r.label]); }
      seen[r.label].rows.push(r);
    });

    this.setData({ groups: groups, empty: !rows.length });
  },

  goToday: function () { wx.switchTab({ url: '/pages/today/today' }); },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  }
});
