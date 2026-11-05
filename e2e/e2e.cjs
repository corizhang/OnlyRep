/**
 * RankBoard 真实浏览器端到端验证（Playwright + chromium）
 *
 * 前置：
 *  1. node e2e/gen-fixtures.cjs
 *  2. cd rankboard && npx vite preview --port 4173
 * 运行：node e2e/e2e.cjs
 *
 * 断言均为 DOM 文本/样式级断言，不依赖截图。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = 'http://localhost:4173';
const EXEC = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'),
  'ms-playwright', 'chromium-1247', 'chrome-win64', 'chrome.exe',
);

const results = [];

/** 静态扫描构建产物中的外链：剔除 XML 命名空间/许可证注释等非运行时 URL */
const distHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const NON_RUNTIME_URL_RE =
  /(purl\.oclc\.org|openxmlformats\.org|schemas\.microsoft\.com|w3\.org|sheetjs\.com|reactjs\.org|github\.com)/;
const distExternalRefs = [
  ...new Set(distHtml.match(/https?:\/\/[a-zA-Z0-9.-]+/g) ?? []),
].filter((u) => !NON_RUNTIME_URL_RE.test(u));
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
function check(name, cond, detail = '') {
  record(name, !!cond, cond ? detail : `${detail} (actual: 见上方日志)`);
  return !!cond;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXEC,
    headless: true,
    // 直连代理：绕过本机 AdGuard 等系统代理向页面注入的 content script（环境噪声，非应用行为）
    args: ['--no-sandbox', '--disable-dev-shm-usage', "--proxy-server='direct://'", '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // ---- 全局监听：console error / 页面异常 / 网络请求（纯本地铁律 G4） ----
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  const adguardRequests = [];
  const allRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`${msg.text()} @ ${msg.location().url || ''}`);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('request', (req) => {
    allRequests.push(req.url());
    const u = req.url();
    const local = u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:');
    // local.adguard.org：本机 AdGuard 桌面版经 WFP 向任何页面注入的 content-script（环境噪声，
    // 与被测应用无关；dist/index.html 静态扫描确认无运行时外链）。拦截域名 + 计数排除。
    const adguard = u.startsWith('http://local.adguard.org');
    if (adguard) adguardRequests.push(u);
    else if (!local) externalRequests.push(u);
  });
  await page.route('http://local.adguard.org/**', (route) => route.abort());

  const fileInput = page.locator('input[type=file][accept=".xlsx,.xls,.csv"]');
  const preview = page.locator('#rankboard-preview-node');

  /** 读取预览区所有名次徽章（每行一个 borderRadius:50% 圆形徽章） */
  async function readBadges() {
    return preview.evaluate((node) =>
      [...node.querySelectorAll('div')]
        .filter((el) => el.style.borderRadius === '50%' && el.style.width.endsWith('px'))
        .map((el) => ({ rank: el.textContent.trim(), bg: el.style.background })),
    );
  }
  /** 读取预览区所有进度条宽度（百分比） */
  async function readBarRatios() {
    return preview.evaluate((node) =>
      [...node.querySelectorAll('div')]
        .filter((el) => el.style.width.endsWith('%'))
        .map((el) => parseFloat(el.style.width)),
    );
  }
  /** 预览行数 = 徽章数 */
  const badgeCount = async () => (await readBadges()).length;

  /** 选指标列：按选项文本片段找到 value 后 selectOption */
  async function pickMetric(text) {
    const key = await page.evaluate((t) => {
      const sel = [...document.querySelectorAll('select')].find((s) =>
        [...s.options].some((o) => o.textContent.includes(t)),
      );
      if (!sel) return null;
      const opt = [...sel.options].find((o) => o.textContent.includes(t));
      return opt ? opt.value : null;
    }, text);
    if (!key) throw new Error(`找不到指标列选项：${text}`);
    const sel = page.locator('label:has-text("指标列") select').first();
    await sel.selectOption(key);
  }

  /** 选名称列：组件化后选项文本带类型标注（如「姓名（文本）」），用包含匹配取 value 再选中 */
  async function pickName(text) {
    const sel = page.locator('label:has-text("名称列") select').first();
    const key = await sel.evaluate((s, t) => {
      const opt = [...s.options].find((o) => o.textContent.includes(t));
      return opt ? opt.value : null;
    }, text);
    if (!key) throw new Error(`找不到名称列选项：${text}`);
    await sel.selectOption(key);
  }

  /** 重新导入文件：应用无「重新上传」入口（数据态下导入区已卸载），通过刷新回到导入态 */
  async function importCsv(file) {
    await page.reload({ waitUntil: 'networkidle' });
    await fileInput.setInputFiles(path.join(FIX, file));
    await page.locator('text=总行数').waitFor({ timeout: 15000 });
    await page.waitForTimeout(200);
  }

  /* ================= 1. 页面渲染 ================= */
  console.log('\n===== 1. 页面加载 =====');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // 导入态：预览画布尚未挂载，先等导入区出现
  await page.locator('text=拖入 Excel/CSV').waitFor({ timeout: 10000 });
  record('页面渲染出导入区', true);
  // 清掉可能残留的历史配置，保证可重复
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('text=拖入 Excel/CSV').waitFor({ state: 'visible' });

  /* ================= 2. dirty.csv 导入 / 脏数据 / 合计行排除 ================= */
  console.log('\n===== 2. dirty.csv 导入与解析 =====');
  await fileInput.setInputFiles(path.join(FIX, 'dirty.csv'));
  const stats = page.locator('text=总行数').first();
  await stats.waitFor({ timeout: 15000 });
  const statsText = await stats.textContent();
  console.log('统计:', statsText);
  check('合计/总计行默认被排除（有效 27 / 排除 2）',
    statsText.includes('总行数 29') && statsText.includes('有效行数 27') && statsText.includes('已排除 2 行'),
    statsText.trim());

  const typeLabels = await page.locator('thead th').allTextContents();
  const hasTypeLabel = typeLabels.some((t) => t.includes('文本')) && typeLabels.some((t) => t.includes('数值'));
  check('预览表头显示列类型标注（文本/数值）', hasTypeLabel, typeLabels.join(' | '));
  // Bug 2 修复复验：转化率列应识别为「百分比」而非「数值」
  check('Bug2 复验：转化率列类型标注为「百分比」',
    typeLabels.some((t) => t.includes('转化率') && t.includes('百分比')),
    typeLabels.join(' | '));

  const dirtyBadge = page.locator('span:has-text("脏 ")').first();
  check('脏数据黄色标注出现（「脏 N」徽标）', await dirtyBadge.isVisible());
  const amberCells = await page.locator('tbody td.bg-amber-100').count();
  check('脏单元格黄色底色标注（bg-amber-100）', amberCells >= 1, `amber 单元格数=${amberCells}`);

  /* ================= 3. Top10 / 金银铜徽章 ================= */
  console.log('\n===== 3. Top10 与名次徽章 =====');
  // Bug 1 修复复验：不手动指定名称列，默认应自动取第一个文本列显示真实姓名
  await pickMetric('新增客户数');
  await page.waitForTimeout(300);
  let badges = await readBadges();
  check('Top 10 恰好 10 行', badges.length === 10, `行数=${badges.length}`);
  const goldRgb = ['rgb(245, 197, 66)', 'rgb(192, 196, 204)', 'rgb(205, 140, 92)']; // 金银铜
  const top3Ok = badges.slice(0, 3).map((b) => b.bg).every((bg) => goldRgb.some((c) => bg.includes(c)));
  const restOk = badges.slice(3).every((b) => !goldRgb.some((c) => b.bg.includes(c)));
  check('Top3 徽章为金银铜配色', top3Ok, JSON.stringify(badges.slice(0, 3).map((b) => b.bg)));
  check('第 4 名起非金银铜配色', restOk);
  const firstRowText = await preview.evaluate((n) => {
    const cards = [...n.querySelectorAll('div')].filter((el) => el.style.border?.startsWith('1px solid'));
    return cards[0]?.textContent ?? '';
  });
  check('降序第 1 名为周涛（42000）', firstRowText.includes('周涛'), firstRowText.slice(0, 40));
  // Bug 1 复验：默认配置下预览不得再出现「(空)」
  const boardText3 = await preview.textContent();
  check('Bug1 复验：默认名称列自动生效，无「(空)」', !boardText3.includes('(空)'));

  // Bug 2 复验：选百分比列（转化率）为指标，榜单数值应为「91.5%」形态而非 0.915
  await pickMetric('转化率');
  await page.waitForTimeout(300);
  const percentRowText = await preview.evaluate((n) => {
    const cards = [...n.querySelectorAll('div')].filter((el) => el.style.border?.startsWith('1px solid'));
    return cards[0]?.textContent ?? '';
  });
  check('Bug2 复验：百分比指标显示 % 形态', /%\d*$/.test(percentRowText) || percentRowText.includes('%'),
    percentRowText.slice(0, 40));
  check('Bug2 复验：百分比数值不是裸小数 0.915', !/0\.915/.test(percentRowText), percentRowText.slice(0, 40));
  await pickMetric('新增客户数'); // 恢复数值指标供后续步骤一致
  await page.waitForTimeout(300);

  /* ================= 4. ties.csv 并列策略 ================= */
  console.log('\n===== 4. 并列策略 =====');
  await importCsv('ties.csv');
  await pickMetric('业绩');
  await page.waitForTimeout(300);
  // Bug 1 复验：ties 表默认名称列（客户经理）应显示真实姓名
  const tiesFirstRow = await preview.evaluate((n) => {
    const cards = [...n.querySelectorAll('div')].filter((el) => el.style.border?.startsWith('1px solid'));
    return cards[0]?.textContent ?? '';
  });
  check('Bug1 复验：ties 表默认名称列显示真实姓名（甲一）', tiesFirstRow.includes('甲一'),
    tiesFirstRow.slice(0, 40));
  // 关掉奖牌图标，让 Top3 徽章显示数字以便断言名次
  await page.locator('label:has-text("Top3 显示奖牌/皇冠图标") input').uncheck();
  await page.waitForTimeout(200);

  // 默认「同值同名次」：1,2,2,4,5,6,7,8,8,10
  let ranks = (await readBadges()).map((b) => b.rank);
  check('同值同名次策略 → 名次 1,2,2,4…8,8,10',
    JSON.stringify(ranks) === JSON.stringify(['1', '2', '2', '4', '5', '6', '7', '8', '8', '10']),
    `实际名次=${ranks.join(',')}`);

  // 切「严格顺序」：1..10（先展开高级设置，details 默认折叠）
  await page.locator('details summary:has-text("高级设置")').click();
  await page.locator('label:has-text("严格顺序")').click();
  await page.waitForTimeout(300);
  ranks = (await readBadges()).map((b) => b.rank);
  check('严格顺序策略 → 名次 1~10 连续',
    JSON.stringify(ranks) === JSON.stringify(Array.from({ length: 10 }, (_, i) => String(i + 1))),
    `实际名次=${ranks.join(',')}`);

  /* ================= 5. 分组聚合（按网点求和） ================= */
  console.log('\n===== 5. 分组聚合 =====');
  await importCsv('dirty.csv');
  await pickMetric('新增客户数');
  // Bug 1 修复边界复验：切分组聚合但不选维度列 → 应回退直接排序（一行一人），不得合成一组
  await page.locator('button:has-text("分组聚合")').click();
  await page.waitForTimeout(400);
  const fallbackBadges = await readBadges();
  check('Bug1 边界复验：分组模式未选维度列 → 回退逐行排名（10 行而非 1 组）',
    fallbackBadges.length === 10, `行数=${fallbackBadges.length}`);
  const fallbackText = await preview.textContent();
  // Top1 为周涛（张伟 1234 实际排第 11 名，不在 Top10）；缺失指标值的 5 行被合理过滤
  check('Bug1 边界复验：回退模式无「(空)」且显示真实姓名',
    !fallbackText.includes('(空)') && fallbackText.includes('周涛'),
    fallbackText.slice(0, 60));
  // 正常分组：选维度列 网点
  await page.locator('label:has-text("分组维度列") select').selectOption({ label: '网点' });
  await page.waitForTimeout(400);
  badges = await readBadges();
  check('按网点分组 → 4 组（城东/城西/城南/城北）', badges.length === 4, `组数=${badges.length}`);
  const boardText = await preview.textContent();
  const orderOk = boardText.indexOf('城东支行') < boardText.indexOf('城西支行') &&
    boardText.indexOf('城西支行') < boardText.indexOf('城北支行') &&
    boardText.indexOf('城北支行') < boardText.indexOf('城南支行');
  check('分组排名顺序 城东>城西>城北>城南（手工核算一致）', orderOk);
  const ratios = await readBarRatios();
  const descending = ratios.every((v, i) => i === 0 || v <= ratios[i - 1] + 0.5);
  check('进度条比例首行 100% 且逐行递减', ratios[0] === 100 && descending,
    `ratios=${ratios.map((r) => r.toFixed(1)).join('/')}`);
  check('末组进度条约 24%（20083/83468）', ratios[ratios.length - 1] > 15 && ratios[ratios.length - 1] < 30,
    `末行=${ratios[ratios.length - 1]?.toFixed(1)}%`);

  /* ================= 6. 四主题切换截图 ================= */
  console.log('\n===== 6. 主题切换 =====');
  await importCsv('ties.csv');
  await pickMetric('业绩');
  await page.waitForTimeout(300);
  for (const name of ['商务蓝', '喜庆红', '深色金', '清爽白']) {
    await page.locator(`button[title="${name}"]`).click();
    await page.waitForTimeout(350);
    const shot = path.join(SHOTS, `theme-${name}.png`);
    await preview.screenshot({ path: shot });
    record(`主题「${name}」切换并截图`, fs.existsSync(shot), shot);
  }

  /* ================= 7. 背景图 + 遮罩 ================= */
  console.log('\n===== 7. 背景图与遮罩 =====');
  const bgInput = page.locator('input[type=file][accept="image/jpeg,image/png"]');
  await bgInput.setInputFiles(path.join(FIX, 'bg.png'));
  await preview.locator('img').waitFor({ timeout: 10000 });
  record('3000×2000 背景图上傳成功并渲染进预览', true);
  const hint = page.locator('text=图片已自动压缩');
  check('E8：长边>2048 提示自动压缩', await hint.isVisible());
  const overlay = page.locator('input[type=range][min="0"][max="1"]');
  await overlay.fill('0.85');
  await page.waitForTimeout(300);
  const overlayOpacity = await preview.evaluate((n) => {
    const divs = [...n.querySelectorAll('div')].filter((d) => d.style.position === 'absolute' && d.style.opacity);
    return divs.map((d) => d.style.opacity);
  });
  check('遮罩滑杆调到 85% 后预览生效', overlayOpacity.includes('0.85'), `opacity=${overlayOpacity.join(',')}`);
  await preview.screenshot({ path: path.join(SHOTS, 'theme-background.png') });

  /* ================= 8. PNG 导出 ================= */
  console.log('\n===== 8. PNG 导出 =====');
  // 此时仍停留在主题/背景测试后的配置态（ties + 背景图），直接导出
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.locator('button:has-text("导出 PNG")').click(),
  ]);
  const fname = download.suggestedFilename();
  record('导出触发 PNG 下载', true, fname);
  check('文件名形如 *_YYYYMMDD.png', /^.+_\d{8}\.png$/.test(fname), fname);
  const dlPath = path.join(SHOTS, 'export-download.png');
  await download.saveAs(dlPath);
  const head = fs.readFileSync(dlPath).subarray(0, 8);
  check('下载文件为合法 PNG', head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47,
    `magic=${head.toString('hex')}`);

  /* ================= 9. big.csv 性能 ================= */
  console.log('\n===== 9. big.csv（12000 行）性能 =====');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('text=拖入 Excel/CSV').waitFor({ timeout: 10000 });
  const t0 = Date.now();
  await fileInput.setInputFiles(path.join(FIX, 'big.csv'));
  // 解析完成（统计区出现）后选指标列，计时到榜单数据行真正渲染
  await page.locator('text=总行数').waitFor({ timeout: 60000 });
  await pickMetric('新增客户数');
  await pickName('姓名'); // nameKey 默认空时行名显示「(空)」（源码 bug），测试显式指定
  await preview.waitFor({ state: 'visible', timeout: 60000 });
  await preview.locator('text=员工00001').first().waitFor({ timeout: 60000 });
  const elapsed = Date.now() - t0;
  record(`12000 行从上传到预览渲染耗时 ${elapsed}ms（目标 ≤3000ms）`, elapsed <= 3000);

  /* ================= 10. 网络 / 控制台 ================= */
  console.log('\n===== 10. 纯本地与控制台健康 =====');
  check('全程无非 localhost 外链请求（G4 纯本地铁律）', externalRequests.length === 0,
    externalRequests.slice(0, 5).join(', '));
  console.log(
    `  [环境噪声] 本机 AdGuard 注入请求 ${adguardRequests.length} 个（已由 route 拦截，非应用行为）`,
  );
  check('产物 dist/index.html 无运行时外链（静态扫描）', distExternalRefs.length === 0,
    distExternalRefs.join(', '));
  const realErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('local.adguard.org'),
  );
  check('无 console error（favicon 404 除外）', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  check('无未捕获页面异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();

  /* ================= 汇总 ================= */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n========== E2E 汇总：${results.length - failed.length}/${results.length} 通过 ==========`);
  for (const f of failed) console.log(`FAIL: ${f.name} — ${f.detail}`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error('E2E 脚本异常终止:', err);
  process.exit(2);
});
