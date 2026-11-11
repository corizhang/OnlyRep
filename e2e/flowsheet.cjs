/**
 * 新版画布 / 数据节点（DAG）交互回归（Playwright）。
 * 覆盖：ECharts 图表运行时渲染、DAG 视图节点渲染、节点库点击新增、Ctrl+Z/Y 撤销重做。
 * 前置：npx vite preview --port 4173；运行：node e2e/flowsheet.cjs
 */
const { chromium } = require('playwright-core');
const { launchOptions } = require('./lib/browser.cjs');

const BASE = 'http://localhost:4173';
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

(async () => {
  const browser = await chromium.launch(launchOptions());
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/?preset=demo`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // ECharts 6 升级后的运行时回归：图表必须真的渲染出 SVG
  const rootOk = await page.evaluate(() => {
    const r = document.getElementById('root');
    return !!r && r.children.length > 0;
  });
  const svgCount = await page.locator('svg').count();
  record('默认画布渲染且图表 SVG 已生成', rootOk && svgCount > 0, `${svgCount} 个 SVG`);

  // 切到「数据节点」视图（antd Segmented）
  await page.getByText('数据节点', { exact: true }).first().click();
  await page.waitForTimeout(1000);

  const nodeCount = async () => {
    const text = await page.locator('body').innerText();
    const m = text.match(/(\d+)\s*个节点/);
    return m ? Number(m[1]) : -1;
  };
  const baseline = await nodeCount();
  record('DAG 视图渲染出节点', baseline > 0, `${baseline} 个节点`);

  // 节点库点击新增（数据源「常量」可直接点击添加）
  await page
    .locator('button[title="点击添加，或拖到画布指定位置"]')
    .filter({ hasText: '常量' })
    .first()
    .click();
  await page.waitForTimeout(500);
  const afterAdd = await nodeCount();
  record('点击节点库新增节点', afterAdd === baseline + 1, `${baseline} → ${afterAdd}`);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const afterUndo = await nodeCount();
  record('Ctrl+Z 撤销新增', afterUndo === baseline, `${afterAdd} → ${afterUndo}`);

  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  const afterRedo = await nodeCount();
  record('Ctrl+Y 重做新增', afterRedo === baseline + 1, `${afterUndo} → ${afterRedo}`);

  record('全程无页面异常', pageErrors.length === 0, pageErrors.join('; ').slice(0, 200));

  await browser.close();
  const ok = results.every((r) => r.ok);
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  flowsheet: ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
