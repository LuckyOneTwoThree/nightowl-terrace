var data = require('../../utils/data.js');

// 本周德比法庭开放场次（★★★）
var engine = require('../../utils/engine.js');

Page({
  data: {
    courts: [],
    plays: [
      {
        id: 'guess',
        name: '盲评猜球',
        desc: '封存答案 · 赛后开箱 · 冷门翻倍',
        icon: '猜'
      },
      {
        id: 'owl',
        name: '夜猫榜',
        desc: '修仙打卡 · 凌晨场专属荣誉',
        icon: '熬'
      },
      {
        id: 'court',
        name: '德比法庭',
        desc: '赛前一句狂言 · 赛后应验翻车',
        icon: '判'
      },
      {
        id: 'box',
        name: '盲盒开球',
        desc: '随机开一场 · 看完才能评',
        icon: '盒'
      }
    ]
  },

  onShow: function () {
    var now = new Date();
    var weekEnd = new Date(now.getTime() + 7 * 86400000);
    var fmt = function (d) {
      return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
    };
    var nowStr = fmt(now);
    var endStr = fmt(weekEnd);

    var courts = data.matchesAll()
      .filter(function (m) {
        var day = engine.dateOf(m.t);
        return day >= nowStr && day <= endStr && m.st === 'sched';
      })
      .map(function (m) {
        var ev = engine.evaluate(m, data.getRecMap(), data.getRivalries(), data.getStorylines(), []);
        return { m: m, ev: ev };
      })
      .filter(function (e) { return e.ev.star >= 3; })
      .slice(0, 4)
      .map(function (e) {
        var h = data.getTeam(e.m.h);
        var a = data.getTeam(e.m.a);
        var d = new Date(e.m.t.split('T')[0].replace(/-/g, '/') + ' 00:00:00');
        return {
          id: e.m.id,
          pair: h.zh + ' v ' + a.zh,
          timeText: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + e.m.t.split('T')[1],
          tag: e.ev.rivalry || (e.ev.stories[0] ? e.ev.stories[0].name : '焦点战')
        };
      });

    this.setData({ courts: courts });
  },

  onPlay: function (e) {
    var id = e.currentTarget.dataset.id;
    var zh = { guess: '盲评猜球', owl: '夜猫榜', court: '德比法庭', box: '盲盒开球' }[id];
    wx.showToast({ title: zh + ' · v1 云版本上线', icon: 'none' });
  }
});
