// 视觉验证：数据节点视图 ComfyUI 风格节点 + 选中浮动工具条
const { chromium } = require('playwright');
const EXE = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe';

const DEMO = {
  state: {
    config: {
      blocks: [],
      dataSources: [
        { id: 'ds1', name: '当日新增', kind: 'manualTable', columns: ['统计日期', '全量当日新增', '累计卡量'], rows: [
          ['2026-11-03', 1313, 11507], ['2026-11-02', 1208, 10194], ['2026-11-01', 1102, 8986], ['2026-10-31', 986, 7884],
        ] },
        { id: 'ds2', name: '口径参数', kind: 'form', entries: [{ key: '全年目标', value: '60000' }, { key: '已完成', value: '11507' }] },
      ],
      pipeline: { nodes: [
        { id: 'n_ds1', type: 'source', name: '当日新增', inputs: [], params: { sourceId: 'ds1' }, enabled: true },
        { id: 'n1', type: 'pickRows', name: '取最新日', inputs: ['n_ds1'], params: { mode: 'latestDate', dateCol: '统计日期', n: 1 }, enabled: true },
        { id: 'n2', type: 'sortTopN', name: '排序Top10', inputs: ['n_ds1'], params: { col: '全量当日新增', dir: 'desc', n: 3, asDate: false }, enabled: true },
        { id: 'n3', type: 'scalarOut', name: '累计卡量', inputs: ['n1'], params: { col: '累计卡量', method: 'sum' }, enabled: true },
        { id: 'n4', type: 'formula', name: '完成率', inputs: [], params: { expr: '已完成/全年目标' }, enabled: true },
        { id: 'n5', type: 'scalarOut', name: '停用节点', inputs: ['n2'], params: { col: '全量当日新增', method: 'max' }, enabled: false },
      ] },
    },
  },
  version: 3,
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('http://localhost:4199/');
  // 以应用自身写盘的默认 config 为基底，只替换数据源与管道，避免缺字段
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rankboard-canvas-v3'));
    raw.state.config.dataSources = [
      { id: 'ds1', name: '当日新增', kind: 'manualTable', columns: ['统计日期', '全量当日新增', '累计卡量'], rows: [
        ['2026-11-03', 1313, 11507], ['2026-11-02', 1208, 10194], ['2026-11-01', 1102, 8986], ['2026-10-31', 986, 7884],
      ] },
      { id: 'ds2', name: '口径参数', kind: 'form', entries: [{ key: '全年目标', value: '60000' }, { key: '已完成', value: '11507' }] },
    ];
    raw.state.config.pipeline = { nodes: [
      { id: 'n_ds1', type: 'source', name: '当日新增', inputs: [], params: { sourceId: 'ds1' }, enabled: true },
      { id: 'n1', type: 'pickRows', name: '取最新日', inputs: ['n_ds1'], params: { mode: 'latestDate', dateCol: '统计日期', n: 1 }, enabled: true },
      { id: 'n2', type: 'sortTopN', name: '排序Top10', inputs: ['n_ds1'], params: { col: '全量当日新增', dir: 'desc', n: 3, asDate: false }, enabled: true },
      { id: 'n3', type: 'scalarOut', name: '累计卡量', inputs: ['n1'], params: { col: '累计卡量', method: 'sum' }, enabled: true },
      { id: 'n4', type: 'formula', name: '完成率', inputs: [], params: { expr: '已完成/全年目标' }, enabled: true },
      { id: 'n5', type: 'scalarOut', name: '停用节点', inputs: ['n2'], params: { col: '全量当日新增', method: 'max' }, enabled: false },
    ] };
    raw.state.config.blocks = [];
    localStorage.setItem('rankboard-canvas-v3', JSON.stringify(raw));
  });
  await page.goto('http://localhost:4199/?view=node');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: '.shots/nodes-default.png' });
  console.log('errors:', JSON.stringify(errors.slice(0, 6), null, 1));

  // 选中「取最新日」节点（精确匹配节点头部文本，避开左侧节点库）→ 浮动工具条
  await page.getByText('取最新日', { exact: true }).last().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.shots/node-selected-toolbar.png' });

  // 点「添加下游」→ 浮动处理节点按钮
  const addBtn = page.locator('button[title="添加下游节点"]');
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: '.shots/node-add-downstream.png' });
  } else {
    console.log('WARN: 添加下游按钮未出现');
  }
  console.log('errors2:', JSON.stringify(errors.slice(0, 6), null, 1));
  await browser.close();
})();
