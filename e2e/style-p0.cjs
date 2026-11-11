/**
 * P0 样式配置项定向验证（真实浏览器）
 * 前置：npx vite preview --port 4173；运行：node e2e/style-p0.cjs
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { launchOptions, prepareLegacyMode } = require('./lib/browser.cjs');

const FIX = path.join(__dirname, 'fixtures');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173';
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

(async () => {
  const browser = await chromium.launch(launchOptions());
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await prepareLegacyMode(page);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('text=拖入 Excel/CSV').waitFor({ timeout: 10000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('input[type=file][accept=".xlsx,.xls,.csv"]').setInputFiles(path.join(FIX, 'dirty.csv'));
  await page.locator('text=总行数').waitFor({ timeout: 15000 });

  const preview = page.locator('#rankboard-preview-node');

  // 选指标列，让榜单有数据
  const metricSel = page.locator('label:has-text("指标列") select').first();
  const metricKey = await metricSel.evaluate((s) => {
    const opt = [...s.options].find((o) => o.textContent.includes('新增客户数'));
    return opt ? opt.value : null;
  });
  await metricSel.selectOption(metricKey);
  await preview.locator('text=周涛').first().waitFor({ timeout: 15000 });

  // 展开榜单块配置
  await page.locator('button', { hasText: '榜单（' }).first().click();

  /* ---- 1. minimal 行样式 ---- */
  const cardCount = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].filter((el) => el.style.borderRadius && el.style.background && el.style.background !== 'transparent').length);
  await page.locator('button:has-text("极简")').first().click();
  await page.waitForTimeout(200);
  const cardCountMinimal = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].filter((el) => el.style.borderRadius && el.style.background && el.style.background !== 'transparent').length);
  record('行样式=极简后卡片底消失', cardCount > 0 && cardCountMinimal <= cardCount / 2, `card ${cardCount} → ${cardCountMinimal}`);
  const goldRank = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].some((el) => el.style.color === 'rgb(245, 197, 66)'));
  record('极简名次数字带金银铜色', goldRank);
  await page.screenshot({ path: path.join(SHOTS, 'p0-minimal.png'), fullPage: true });

  /* ---- 2. 徽章形状（切回卡片行样式后验证） ---- */
  await page.locator('button:has-text("卡片")').first().click();
  await page.locator('button:has-text("胶囊")').first().click();
  await page.waitForTimeout(200);
  const pillBadge = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].some((el) => el.style.borderRadius === '9999px'));
  record('徽章形状=胶囊生效（borderRadius 9999px）', pillBadge);
  await page.locator('button:has-text("方")').first().click();
  await page.waitForTimeout(200);
  const squareBadge = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].filter((el) => el.style.borderRadius === '6px').length >= 3);
  record('徽章形状=方形生效（borderRadius 6px）', squareBadge);

  /* ---- 3. 第 1 名图标 = 奖杯 ---- */
  await page.locator('label:has-text("第 1 名图标") select').selectOption('trophy');
  await page.waitForTimeout(200);
  const trophyInBadge = await preview.evaluate((n) => {
    const badges = [...n.querySelectorAll('div')].filter((el) => el.style.width.endsWith('px') && el.textContent.trim() === '');
    return badges.slice(0, 1).some((b) => b.querySelector('svg'));
  });
  record('第 1 名图标=奖杯（徽章内出现 SVG）', trophyInBadge);
  await page.locator('label:has-text("第 1 名图标") select').selectOption('none');
  await page.waitForTimeout(200);
  const noIcon = await preview.evaluate((n) => {
    const badges = [...n.querySelectorAll('div')].filter((el) => el.style.width.endsWith('px') && el.textContent.trim() === '');
    return badges.length === 0;
  });
  record('第 1 名图标=无（徽章内无 SVG）', noIcon);

  /* ---- 4. 进度条 ---- */
  const barsBefore = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].filter((el) => el.style.width.endsWith('%')).length);
  await page.locator('label:has-text("进度条") input[type=checkbox]').first().uncheck();
  await page.waitForTimeout(200);
  const barsAfter = await preview.evaluate((n) =>
    [...n.querySelectorAll('div')].filter((el) => el.style.width.endsWith('%')).length);
  record('进度条开关生效', barsBefore > 0 && barsAfter === 0, `${barsBefore} → ${barsAfter}`);
  await page.locator('label:has-text("进度条") input[type=checkbox]').first().check();
  await page.locator('label:has-text("进度条颜色") select').selectOption('tier');
  await page.waitForTimeout(200);
  const tierBar = await preview.evaluate((n) => {
    const fills = [...n.querySelectorAll('div')].filter((el) => el.style.width.endsWith('%'));
    return fills.slice(0, 3).every((f) => ['rgb(245, 197, 66)', 'rgb(192, 196, 204)', 'rgb(205, 140, 92)'].includes(f.style.background));
  });
  record('进度条颜色=按名次（Top3 金银铜）', tierBar);

  /* ---- 5. 表格变体（auto 模式为 grid 渲染） ---- */
  await page.locator('label:has-text("榜单变体") select').selectOption('table');
  await page.waitForTimeout(300);
  const tableHeader = await preview.evaluate((n) => {
    const text = n.textContent;
    return text.includes('名次') && text.includes('名称');
  });
  record('切换表格变体后出现表头（名次/名称）', tableHeader);
  const top3Badge = await preview.evaluate((n) => {
    const badge = [...n.querySelectorAll('div')].find(
      (el) => el.style.width === '24px' && el.style.borderRadius === '50%',
    );
    return badge ? badge.style.background : '';
  });
  record('表格 Top3 名次格为金银铜圆徽章', top3Badge.includes('245, 197, 66'), top3Badge);
  await page.screenshot({ path: path.join(SHOTS, 'p0-table.png'), fullPage: true });

  /* ---- 6. 表格列显隐与顺序 ---- */
  const valueColBox = page.locator("xpath=//span[normalize-space()='数值']/preceding-sibling::input[1]");
  await valueColBox.evaluate((el) => (el).click());
  await page.waitForTimeout(300);
  const headAfterHide = await preview.evaluate((n) => !n.textContent.includes('新增客户数'));
  record('取消数值列后表头不再含指标名', headAfterHide);
  await page.locator('button', { hasText: '+ 数值' }).first().click();
  await page.waitForTimeout(200);
  const headAfterRestore = await preview.evaluate((n) => n.textContent.includes('新增客户数'));
  record('重新勾选数值列恢复', headAfterRestore);

  /* ---- 7. 自定义列宽（真实 <table> + colgroup 权重归一化） ---- */
  await page.locator('button:has-text("自定义权重")').first().click();
  await page.waitForTimeout(200);
  const colgroup = await preview.evaluate((n) => {
    const cols = [...n.querySelectorAll('colgroup col')].map((c) => parseFloat(c.style.width));
    return { count: cols.length, sum: Math.round(cols.reduce((a, b) => a + b, 0) * 10) / 10 };
  });
  record('自定义列宽 colgroup 归一化为 100%', colgroup.count === 3 && Math.abs(colgroup.sum - 100) < 0.5, JSON.stringify(colgroup));
  const rankWeight = page.locator("xpath=//span[normalize-space()='名次']/following::input[@type='number'][1]");
  await rankWeight.fill('2');
  await page.waitForTimeout(200);
  const rankPct = await preview.evaluate((n) => {
    const cols = [...n.querySelectorAll('colgroup col')].map((c) => parseFloat(c.style.width));
    return cols[0] ?? -1;
  });
  record('名次列权重 2 → 宽度 50%', Math.abs(rankPct - 50) < 0.2, `rank col = ${rankPct}%`);

  /* ---- 8. 表头样式 ---- */
  await page.locator('label').filter({ hasText: /^表头$/ }).locator('input').uncheck();
  await page.waitForTimeout(200);
  const theadGone = await preview.evaluate((n) => !n.querySelector('thead'));
  record('表头显示开关生效（custom 模式下 thead 移除）', theadGone);

  record('全程无页面异常', pageErrors.length === 0, pageErrors.join('; ').slice(0, 100));

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n========== P0 样式定向验证：${pass}/${results.length} 通过 ==========`);
  await browser.close();
  if (pass !== results.length) process.exit(1);
})();
