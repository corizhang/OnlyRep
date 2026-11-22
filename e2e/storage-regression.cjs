/**
 * file:// / localStorage 不可用场景的白屏回归（P0）。
 * 1) 直接以 file:// 打开单文件产物 dist/index.html，断言不白屏；
 * 2) 强制 localStorage 抛 SecurityError，断言不白屏且模式切换仍可用（内存降级）。
 * 前置：npm run build && npx vite preview --port 4173；运行：node e2e/storage-regression.cjs
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { launchOptions } = require('./lib/browser.cjs');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'index.html');
const BASE = 'http://localhost:4173';
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function watchErrors(page, bucket) {
  page.on('pageerror', (err) => bucket.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon/i.test(msg.text())) bucket.push(msg.text().slice(0, 200));
  });
}

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('缺少 dist/index.html，请先执行 npm run build');
    process.exit(1);
  }
  const browser = await chromium.launch(launchOptions());

  // --- 1) file:// 双击打开 ---
  {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    const errors = [];
    watchErrors(page, errors);
    await page.goto(pathToFileURL(DIST).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const ok = await page.evaluate(() => {
      const r = document.getElementById('root');
      return !!r && r.children.length > 0 && (r.textContent || '').includes('RankBoard');
    });
    record('file:// 打开单文件产物不白屏', ok);
    record('file:// 下无页面异常', errors.length === 0, errors.join('; ').slice(0, 200));
    await page.close();
  }

  // --- 2) localStorage 强制抛 SecurityError ---
  {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    const errors = [];
    watchErrors(page, errors);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Access is denied for this document', 'SecurityError');
        },
      });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const rendered = await page.evaluate(() => {
      const r = document.getElementById('root');
      return !!r && r.children.length > 0 && (r.textContent || '').includes('RankBoard');
    });
    record('localStorage 抛 SecurityError 不白屏', rendered);

    // 启动页（降级存储读不到跳过标记，每次必现）：先进工作区
    try {
      const cont = page.getByText('继续上次工作区');
      if (await cont.isVisible({ timeout: 1500 })) await cont.click();
      await page.waitForTimeout(800);
    } catch {
      /* 无启动页则跳过 */
    }

    // 降级存储下 onboarded 标记读不到 → 首屏欢迎页会出现，真实用户也是先关掉它再操作
    try {
      const blankBtn = page.getByText('从空白开始');
      if (await blankBtn.isVisible({ timeout: 1000 })) await blankBtn.click();
    } catch {
      /* 无欢迎页则跳过 */
    }

    // 主题切换会写入 appStorage（rankboard-ui-theme）；内存降级下也必须正常工作
    let modeOk = false;
    try {
      await page.locator('header button:has(.anticon-setting)').first().click({ timeout: 5000 });
      await page.getByRole('combobox', { name: '界面主题' }).click();
      await page.getByText('深色 · 石墨灰', { exact: true }).last().click();
      await page.waitForTimeout(400);
      modeOk = (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark';
    } catch {
      modeOk = false;
    }
    record('降级后主题切换仍可用（写入内存生效）', modeOk);
    record('localStorage 不可用场景下无页面异常', errors.length === 0, errors.join('; ').slice(0, 200));
    await page.close();
  }

  await browser.close();
  const ok = results.every((r) => r.ok);
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  storage-regression: ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
