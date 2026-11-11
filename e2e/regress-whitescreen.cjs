/**
 * 白屏事故回归验证：模拟线上旧 v2 持久化（variant=table 缺 table 子对象）
 * 预写入 localStorage → 加载新版 → 导入数据 → 断言渲染正常、无异常。
 * 运行：node e2e/regress-whitescreen.cjs
 */
const path = require('path');
const { chromium } = require('playwright-core');
const { launchOptions, prepareLegacyMode } = require('./lib/browser.cjs');

const FIX = path.join(__dirname, 'fixtures');
const BASE = 'http://localhost:4173';

(async () => {
  const browser = await chromium.launch(launchOptions());
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await prepareLegacyMode(page);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // 先开一次拿到 origin，再预写旧版持久化配置（version:2、rankList 块缺 P0 字段、variant=table）
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const oldConfig = {
      version: 2,
      mode: 'direct',
      metricKey: '',
      aggMethod: 'sum',
      dimensionKey: '',
      sortDirection: 'desc',
      tieStrategy: 'competition',
      secondarySortKey: '',
      topN: 10,
      showOthers: false,
      filters: { minSamples: 1, minValue: null },
      numberFormat: { thousands: true, decimals: 'auto', unit: 'auto', percent: false, prefix: '' },
      nameKey: '',
      secondaryKeys: [],
      prevValueKey: '',
      displayMode: 'long',
      pageSize: 10,
      themeId: 'businessBlue',
      accentColor: '',
      backgroundImage: null,
      bgFill: 'cover',
      overlayOpacity: 0.6,
      overlayColor: '',
      fontSize: 'medium',
      lineHeight: 'normal',
      borderRadius: 8,
      zebra: false,
      showMedal: true,
      dimTop10Outside: true,
      exportScale: 2,
      exportFileName: '',
      exportFirstScreenOnly: false,
      blocks: [
        { id: 't1', type: 'text', config: { content: '排行榜', role: 'title', fontSizeScale: 1.8, bold: true, align: 'left', colorMode: 'theme', customColor: '' } },
        { id: 'r1', type: 'rankList', config: { variant: 'table', pageSize: 10 } },
      ],
      floats: [],
    };
    localStorage.setItem('rankboard:config:v1', JSON.stringify({ state: { config: oldConfig }, version: 2 }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('text=拖入 Excel/CSV').waitFor({ timeout: 10000 });
  await page.locator('input[type=file][accept=".xlsx,.xls,.csv"]').setInputFiles(path.join(FIX, 'dirty.csv'));
  await page.locator('text=总行数').waitFor({ timeout: 15000 });

  // 选指标列让榜单渲染（表格变体 + 旧配置缺 table 字段 = 原崩溃路径）
  const metricSel = page.locator('label:has-text("指标列") select').first();
  const metricKey = await metricSel.evaluate((s) => {
    const opt = [...s.options].find((o) => o.textContent.includes('新增客户数'));
    return opt ? opt.value : null;
  });
  await metricSel.selectOption(metricKey);
  await page.waitForTimeout(500);

  const previewOk = await page.evaluate(() => {
    const n = document.querySelector('#rankboard-preview-node');
    return !!n && n.textContent.includes('名次') && n.textContent.includes('周涛');
  });
  const crashReadColumns = pageErrors.some((e) => e.includes("reading 'columns'"));

  console.log(`${previewOk && !crashReadColumns ? 'PASS' : 'FAIL'}  旧持久化(表格变体缺table字段)+新版 → 导入渲染正常`);
  console.log(`${!crashReadColumns ? 'PASS' : 'FAIL'}  无 "reading 'columns'" 崩溃 ${crashReadColumns ? '— ' + pageErrors[0] : ''}`);
  console.log(`${pageErrors.length === 0 ? 'PASS' : 'FAIL'}  全程无页面异常 ${pageErrors.join('; ').slice(0, 120)}`);
  await browser.close();
  process.exit(previewOk && !crashReadColumns && pageErrors.length === 0 ? 0 : 1);
})();
