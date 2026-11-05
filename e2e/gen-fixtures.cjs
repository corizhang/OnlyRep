/**
 * 生成 E2E 测试夹具：
 *  - dirty.csv  脏数据表（千分位/百分比/万/全角/空值/-，含合计行）
 *  - ties.csv   并列数据表（第2/3名同值、第8/9名同值）
 *  - big.csv    大表 12000 行 × 6 列
 *  - bg.png     3000x2000 PNG 背景图（脚本生成，无外部依赖）
 *
 * 运行：node e2e/gen-fixtures.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.join(__dirname, 'fixtures');
fs.mkdirSync(dir, { recursive: true });

/* ---------- dirty.csv：30 行，含各类脏数据 ---------- */
const dirtyHeader = '姓名,网点,新增客户数,转化率';
const dirtyRows = [
  // 前 26 行为普通/脏数据行；「合计」行放在最后（默认应被排除）
  '张伟,城东支行,"1,234",85%',
  '李娜,城西支行,3.5万,72.3%',
  '王强,城南支行,986,64%',
  '刘洋,城北支行,"2,048",91.5%',
  '陈静,城东支行,１２３,58%',
  '杨帆,城南支行,,45%',           // 空值
  '赵敏,城西支行,-,37.8%',        // 横杠占位
  '黄磊,城北支行,"12,075",88.2%',
  '周涛,城东支行,4.2万,79%',
  '吴倩,城南支行,655,60%',
  '徐磊,城西支行,"3,410",83.4%',
  '孙丽,城北支行,待补充,52%',      // 无法解析的脏数据（应黄色标注）
  '马超,城东支行,872,66.6%',
  '朱婷,城南支行,"9,801",90%',
  '胡军,城西支行,2.8万,74.5%',
  '郭欣,城北支行,403,55.1%',
  '林峰,城东支行,,48.9%',          // 空值
  '何梅,城南支行,-,62%',           // 横杠
  '高翔,城西支行,"5,678",86.7%',
  '罗云,城北支行,1.6万,71%',
  '郑爽,城东支行,239,50.2%',
  '梁波,城南支行,"7,890",89.3%',
  '宋佳,城西支行,１００,61.4%',    // 全角 100
  '唐磊,城北支行,"4,567",77.8%',
  '许诺,城东支行,3.9万,81.2%',
  '韩雪,城南支行,751,59.5%',
  '合计,汇总,99999,100%',          // 合计行（应默认排除）
  '总计,汇总,99999,100%',          // 总计行（应默认排除）
];
const dirtyCsv = [dirtyHeader, ...dirtyRows].join('\n') + '\n';
fs.writeFileSync(path.join(dir, 'dirty.csv'), dirtyCsv, 'utf8');

/* ---------- ties.csv：30 个客户经理，第2/3名同值、第8/9名同值 ----------
 * 设计数值：第一名 9500；第2、3名均为 8800；...第8、9名均为 5200。
 */
const tiesHeader = '客户经理,网点,业绩';
const tiesVals = [
  9500, 8800, 8800, 8100, 7600, 7000, 6400, 5200, 5200, 4800,
  4500, 4300, 4100, 3900, 3700, 3500, 3300, 3100, 2900, 2700,
  2500, 2300, 2100, 1900, 1700, 1500, 1300, 1100, 900, 700,
];
const tieNames = [
  '甲一', '乙二', '丙三', '丁四', '戊五', '己六', '庚七', '辛八', '壬九', '癸十',
  '子丑', '寅卯', '辰巳', '午未', '申酉', '戌亥', '乾坤', '山河', '日月', '星辰',
  '春风', '夏雨', '秋叶', '冬雪', '江海', '湖泊', '平原', '丘陵', '峰峦', '溪流',
];
const tiesCsv = [tiesHeader, ...tieNames.map((n, i) => `${n},网点${(i % 5) + 1},${tiesVals[i]}`)].join('\n') + '\n';
fs.writeFileSync(path.join(dir, 'ties.csv'), tiesCsv, 'utf8');

/* ---------- big.csv：12000 行 × 6 列 ---------- */
const bigLines = ['工号,姓名,网点,新增客户数,转化率,管理资产'];
for (let i = 1; i <= 12000; i++) {
  const name = `员工${String(i).padStart(5, '0')}`;
  const branch = `支行${(i % 40) + 1}`;
  const adds = 100000 - i;                       // 保证有明确的 Top 排序
  const conv = ((i % 90) + 10).toFixed(1) + '%';
  const aum = (i * 137) % 9000000;
  bigLines.push(`E${i},${name},${branch},${adds},${conv},${aum}`);
}
fs.writeFileSync(path.join(dir, 'big.csv'), bigLines.join('\n') + '\n', 'utf8');

/* ---------- bg.png：3000x2000 渐变 PNG（纯 zlib 手写 PNG，零依赖） ---------- */
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}
function makePng(w, h) {
  // 每 100 行一个渐变色带（降低压缩前的数据量，仍为合法全尺寸 PNG）
  const raw = Buffer.alloc(h * (1 + w * 3));
  let off = 0;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0; // filter none
    const r = (y / h) * 255 | 0, g = 80 + ((y / h) * 120 | 0), b = 200 - ((y / h) * 120 | 0);
    for (let x = 0; x < w; x++) {
      raw[off++] = r; raw[off++] = g; raw[off++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
fs.writeFileSync(path.join(dir, 'bg.png'), makePng(3000, 2000));

console.log('fixtures written:');
for (const f of ['dirty.csv', 'ties.csv', 'big.csv', 'bg.png']) {
  const st = fs.statSync(path.join(dir, f));
  console.log(`  ${f}  ${(st.size / 1024).toFixed(1)} KB`);
}
