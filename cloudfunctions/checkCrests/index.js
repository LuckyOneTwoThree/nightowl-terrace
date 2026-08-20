/**
 * 云函数：checkCrests 队徽云存储诊断（工具型，可长期保留供赛季更新校验）
 * 触发：手动调用（右键"云端测试"或小程序端 cloud.callFunction）
 * 职责：批量验证 crests/ 目录 96 个队徽 fileID 的存活性（getTempFileURL 不存在的文件返回非 0 status）
 * 返回：valid/total + missing 明细（含错误码，便于区分「文件不存在」与「权限拒绝」）
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ENV = 'cloudbase-d3gvu54t8fbbb6b3f';
const BUCKET = '636c-cloudbase-d3gvu54t8fbbb6b3f-1470591947';

const CODES = [
  'ARS','AVL','BOU','BRE','BHA','CHE','COV','CRY','EVE','FUL','HUL','IPS','LEE','LIV','MCI','MUN','NEW','NFO','SUN','TOT',
  'RMA','BAR','ATM','ATH','BET','CEL','ELC','ESP','DEP','LEV','MAL','OSA','RAY','RAC','RSO','SEV','VAL','VIL','GET','ALA',
  'INT','MIL','JUV','NAP','ROM','LAZ','FIO','ATA','BOL','TOR','UDI','GEN','CAG','PAR','COM','LEC','SAS','FRO','VEN','MZA',
  'FCB','BVB','B04','RBL','SGE','VFB','SCF','TSG','FCU','SVW','MAI','BMG','FCA','KOE','HSV','S04','SCP','ELV',
  'PSG','OM','MCO','LIL','OL','NIC','LEN','STR','REN','TOU','BRT','AUX','ANG','HAV','LOR','PAC','TRO','LEM'
];

exports.main = async (event) => {
  try {
    const bucket = event && event.bucket ? event.bucket : BUCKET;
    const fileIDs = CODES.map(c => `cloud://${ENV}.${bucket}/crests/${c}.png`);

    // getTempFileURL 单批上限 50，分批验证
    const all = [];
    for (let i = 0; i < fileIDs.length; i += 50) {
      const res = await cloud.getTempFileURL({ fileList: fileIDs.slice(i, i + 50) });
      all.push(...(res.fileList || []));
    }

    const ok = all.filter(f => f.status === 0);
    const bad = all.filter(f => f.status !== 0).map(f => ({
      file: (f.fileID || '').split('/').pop(),
      status: f.status,
      errMsg: f.errMsg || ''
    }));

    return {
      ok: true,
      bucket: bucket,
      total: all.length,
      valid: ok.length,
      missing: bad,
      // 全军覆没基本是路径/bucket 错或权限问题；个别缺失是上传不全
      hint: bad.length === 0 ? '全部就绪' :
        (bad.length === all.length ? '全部缺失：检查目录名是否为 crests/、bucket 是否正确、云存储权限是否为「所有用户可读」' :
          '部分缺失：把 missing 列出的文件补传到 crests/ 目录')
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
