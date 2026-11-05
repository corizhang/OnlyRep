// 全链路复现：节点视图改表单参数 → 画布 goalProgress 块是否更新
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
      { id: 'ds2', name: '基础数据', kind: 'form', entries: [
        { key: '年绑卡指标', value: '420000' },
        { key: '历史日均绑卡人数', value: '1067' },
        { key: '累计完成绑卡人数', value: '324212' },
      ] },
    ];
    raw.state.config.pipeline = { nodes: [
      { id: 'n_ds2', type: 'source', name: '基础数据', inputs: [], params: { sourceId: 'ds2' }, enabled: true },
      { id: 'n_rate', type: 'formula', name: '全年绑卡目标完成率', inputs: [], params: { expr: '累计完成绑卡人数/年绑卡指标' }, enabled: true },
    ] };
    raw.state.config.blocks = [
      { id: 'b_goal', type: 'goalProgress', config: {
        label: '全年绑卡目标完成率', decimals: 2, showPct: true,
        ratio: { kind: 'node', nodeRef: 'n_rate' },
        metaLeft: '已完成{{累计完成绑卡人数|num}}户，全年目标{{年绑卡指标|num}}，剩余{{(年绑卡指标-累计完成绑卡人数)|num}}户',
        metaRight: '剩余{{((Date(2026,11,31)-now)/86400000)|int}}天',
        barColor: '', trackColor: '', panelBg: '', pctColor: '',
      } },
    ];
    localStorage.setItem('rankboard-canvas-v3', JSON.stringify(raw));
  });
  await page.goto('http://localhost:4199/?view=node');
  await page.waitForTimeout(1500);

  // 初始：画布视图的完成率文本
  const readCanvas = async () => {
    await page.goto('http://localhost:4199/');
    await page.waitForTimeout(1200);
    return await page.evaluate(() => document.body.innerText.match(/已完成[\d,]+户/g)?.join(' | ') ?? 'NOT FOUND');
  };
  console.log('before edit:', await readCanvas());

  // 节点视图：在表单节点内改 累计完成绑卡人数 → 325612
  await page.goto('http://localhost:4199/?view=node');
  await page.waitForTimeout(1200);
  const entryInput = page.locator('input[value="324212"]').first();
  const cnt = await entryInput.count();
  console.log('entry inputs found:', cnt);
  if (cnt === 0) {
    // 兜底：找第三个参数行（累计完成绑卡人数）
    await page.screenshot({ path: '.shots/cache-debug.png' });
  } else {
    await entryInput.fill('325612');
    await page.waitForTimeout(800);
    // 触发 blur 确认写回
    await page.keyboard.press('Tab');
    await page.waitForTimeout(800);
  }
  console.log('after edit:', await readCanvas());
  console.log('pageerrors:', JSON.stringify(errors));
  await browser.close();
})();
