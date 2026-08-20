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
    theme: data.getInitTheme(),
    groups: [],
    empty: false,
    filterTab: 'all',
    filterTabs: [
      { id: 'all', zh: '全部记录' },
      { id: 'pred', zh: '🎯 盲评预言' },
      { id: 'boast', zh: '⚖️ 狂言立据' },
      { id: 'checkin', zh: '🌙 深夜打卡' }
    ],
    stats: { total: 0, hit: 0, rate: '—', pts: 0 }
  },

  onLoad: function () {
    getApp().applyTheme(this);
  },

  onShow: function () {
    getApp().applyTheme(this);
    this.refresh();
  },

  onFilterTab: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.filterTab === id) return;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    this.setData({ filterTab: id });
    this.filterGroups();
  },

  filterGroups: function () {
    var tab = this.data.filterTab;
    var allRows = this._allRows || [];
    var filtered = allRows.filter(function (r) {
      if (tab === 'all') return true;
      return r.type === tab;
    });

    var seen = {}, groups = [];
    filtered.forEach(function (r) {
      if (!seen[r.label]) {
        seen[r.label] = { label: r.label, rows: [] };
        groups.push(seen[r.label]);
      }
      seen[r.label].rows.push(r);
    });

    this.setData({ groups: groups, empty: !filtered.length });
  },

  refresh: function () {
    var preds = wx.getStorageSync('predictions') || {};
    var boasts = wx.getStorageSync('boasts') || {};
    var checkins = wx.getStorageSync('checkins') || {};
    var recMap = data.getRecMap();

    var rows = [];
    var totalPreds = 0, hitCount = 0, totalPts = 0;

    Object.keys(preds).forEach(function (mid) {
      var p = preds[mid], m = data.getMatch(mid);
      if (!m) return;
      var tampered = !crypt.verify(p);
      var late = !!p.ts && p.ts > engine.ts(m.t) + 60000;
      var r = (tampered || late) ? null : settle(p, m, recMap);
      var pickZh = p.pick === 'h' ? '主胜' : p.pick === 'd' ? '平局' : '客胜';
      var hTeam = data.getTeam(m.h) || {};
      var aTeam = data.getTeam(m.a) || {};

      // 命中率口径（三轮 P2-16）：分母只计已结算场次（r!=null），未结算封存不拉低命中率；
      // 命中判定用 r.hit（与 board/me 一致），pts 单独累计
      if (r) {
        totalPreds++;
        if (r.hit) hitCount++;
        totalPts += r.pts;
      }

      rows.push({
        key: 'pred-' + mid, mid: mid,
        label: labelOf(m.t.split('T')[0]),
        sort: p.ts || 0, type: 'pred',
        names: (hTeam.zh || m.h) + ' vs ' + (aTeam.zh || m.a),
        logo: hTeam.logo || '',
        sub: tampered ? '封存校验失败 · 已作废'
          : late ? '开球后封存 · 已作废'
          : '预言: ' + pickZh + ((p.scoreH !== '' && p.scoreH != null && p.scoreA !== '' && p.scoreA != null) ? ' (' + p.scoreH + '-' + p.scoreA + ')' : '') + (r && r.upset ? ' · 冷门×2' : ''),
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
    this._allRows = rows;

    this.setData({
      stats: {
        total: totalPreds,
        hit: hitCount,
        rate: totalPreds > 0 ? Math.round(hitCount * 100 / totalPreds) + '%' : '—',
        pts: totalPts
      }
    });

    this.filterGroups();
  },

  goToday: function () { wx.switchTab({ url: '/pages/today/today' }); },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  }
});
