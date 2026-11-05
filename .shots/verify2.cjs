// 交互验证：浮动工具条的添加下游/启停/删除 + 节点内控件不触发拖拽
const { chromium } = require('playwright');
const EXE = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4199/');
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rankboard-canvas-v3'));
    raw.state.config.dataSources = [
      { id: 'ds1', name: '当日新增', kind: 'manualTable', columns: ['统计日期', '全量当日新增', '累计卡量'], rows: [
        ['2026-11-03', 1313, 11507], ['2026-11-02', 1208, 10194], ['2026-11-01', 1102, 8986],
      ] },
    ];
    raw.state.config.pipeline = { nodes: [
      { id: 'n_ds1', type: 'source', name: '当日新增', inputs: [], params: { sourceId: 'ds1' }, enabled: true },
      { id: 'n2', type: 'sortTopN', name: '排序Top10', inputs: ['n_ds1'], params: { col: '全量当日新增', dir: 'desc', n: 3, asDate: false }, enabled: true },
    ] };
    raw.state.config.blocks = [];
    localStorage.setItem('rankboard-canvas-v3', JSON.stringify(raw));
  });
  await page.goto('http://localhost:4199/?view=node');
  await page.waitForTimeout(1500);

  const nodeCount = async () => await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('rankboard-canvas-v3'));
    return c.state.config.pipeline.nodes.length;
  });
  // 注意：localStorage 里是持久化前的值，改用 store 无从访问，改从 DOM 数节点头部徽标
  const domNodes = () => page.locator('div.absolute.rounded-lg.border').count();

  // 1. 选中排序节点 → 添加下游 → 点「筛选」
  await page.getByText('排序Top10', { exact: true }).last().click();
  await page.waitForTimeout(400);
  await page.locator('button[title="添加下游节点"]').click();
  await page.waitForTimeout(300);
  const before = await domNodes();
  await page.locator('button', { hasText: '筛选' }).last().click();
  await page.waitForTimeout(600);
  const after = await domNodes();
  console.log('add-downstream:', before, '->', after, after === before + 1 ? 'OK' : 'FAIL');

  // 2. 启用/停用切换（新节点选中中）
  await page.locator('button[title="停用该节点"]').click();
  await page.waitForTimeout(300);
  const hasDisabled = await page.locator('text=已停用').count();
  console.log('disable-node:', hasDisabled > 0 ? 'OK' : 'FAIL');

  // 3. 删除节点
  const d0 = await domNodes();
  await page.locator('button[title="删除节点"]').click();
  await page.waitForTimeout(400);
  const d1 = await domNodes();
  console.log('delete-node:', d0, '->', d1, d1 === d0 - 1 ? 'OK' : 'FAIL');

  // 4. 节点内控件：点排序节点的排序列下拉（native select）后节点位置不变
  await page.getByText('排序Top10', { exact: true }).last().click();
  await page.waitForTimeout(300);
  const sel = page.locator('div.absolute.rounded-lg.border').filter({ hasText: '排序Top10' }).locator('select').first();
  const box1 = await sel.boundingBox();
  await sel.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const box2 = await sel.boundingBox();
  console.log('control-stable:', box1 && box2 && Math.abs(box1.x - box2.x) < 2 && Math.abs(box1.y - box2.y) < 2 ? 'OK' : 'FAIL', JSON.stringify({ box1, box2 }));

  // 5. 拖拽节点头部移动
  const header = page.locator('div.absolute.rounded-lg.border').filter({ hasText: '排序Top10' }).first();
  const hb = await header.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 10);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const hb2 = await header.boundingBox();
  console.log('drag-header:', hb2.x - hb.x > 80 ? 'OK' : 'FAIL', Math.round(hb2.x - hb.x));

  console.log('pageerrors:', JSON.stringify(errors));
  await page.screenshot({ path: '.shots/interactions.png' });
  await browser.close();
})();
