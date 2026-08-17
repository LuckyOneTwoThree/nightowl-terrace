/**
 * ICS 日历导出（PM 十一：订阅消息未过审时的开球提醒兜底）
 * 时间换算纯字符串完成（北京 t 无时区标记 → UTC −8h），不依赖运行环境本地时区
 */

// '2026-08-22T03:00' → '20260821T190000Z'
function toUTC(t) {
  var p = t.split('T');
  var d = p[0].split('-');
  var hm = p[1].split(':');
  var dt = new Date(Date.UTC(Number(d[0]), Number(d[1]) - 1, Number(d[2]),
    Number(hm[0]), Number(hm[1])));
  dt = new Date(dt.getTime() - 8 * 3600000);
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return dt.getUTCFullYear() + p2(dt.getUTCMonth() + 1) + p2(dt.getUTCDate()) +
    'T' + p2(dt.getUTCHours()) + p2(dt.getUTCMinutes()) + '00Z';
}

// 结束时间 = 开球 + 2h
function endUTC(t) {
  var p = t.split('T');
  var d = p[0].split('-');
  var hm = p[1].split(':');
  var dt = new Date(Date.UTC(Number(d[0]), Number(d[1]) - 1, Number(d[2]),
    Number(hm[0]), Number(hm[1]) + 120));
  dt = new Date(dt.getTime() - 8 * 3600000);
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return dt.getUTCFullYear() + p2(dt.getUTCMonth() + 1) + p2(dt.getUTCDate()) +
    'T' + p2(dt.getUTCHours()) + p2(dt.getUTCMinutes()) + '00Z';
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// 当前时间的 UTC 标记（DTSTAMP 用）
function nowStamp() {
  var d = new Date();
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) +
    'T' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + 'Z';
}

/**
 * 生成 ICS 文本
 * @param events [{ t, title, desc, alarmMin }]
 */
function build(events) {
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Night Owl Terrace//CN',
    'CALSCALE:GREGORIAN'
  ];
  events.forEach(function (e, i) {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:not-' + Date.now() + '-' + i + '@nightowl');
    lines.push('DTSTAMP:' + nowStamp());
    lines.push('DTSTART:' + toUTC(e.t));
    lines.push('DTEND:' + endUTC(e.t));
    lines.push('SUMMARY:' + esc(e.title));
    if (e.desc) lines.push('DESCRIPTION:' + esc(e.desc));
    if (e.alarmMin) {
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT' + e.alarmMin + 'M');
      lines.push('ACTION:DISPLAY');
      lines.push('DESCRIPTION:' + esc(e.title));
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * 写入临时文件并调起微信文件分享（发送到文件传输助手 / 好友即可导入日历）
 * @param events  [{ t, title, desc, alarmMin }]
 * @param fileName 分享显示的文件名（不含 .ics 后缀）
 * @param cb      function (ok, errMsg)
 */
function share(events, fileName, cb) {
  var fsm = wx.getFileSystemManager();
  var path = wx.env.USER_DATA_PATH + '/nightowl_' + Date.now() + '.ics';
  var content = build(events);
  fsm.writeFile({
    filePath: path,
    data: content,
    encoding: 'utf8',
    success: function () {
      wx.shareFileMessage({
        filePath: path,
        fileName: (fileName || '夜猫看台') + '.ics',
        success: function () { cb(true); },
        fail: function (err) { cb(false, err.errMsg || '分享取消'); }
      });
    },
    fail: function (err) { cb(false, err.errMsg || '写入失败'); }
  });
}

module.exports = { build: build, toUTC: toUTC, share: share };
