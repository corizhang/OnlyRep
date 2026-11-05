// UI 验证：变量名冲突时警告条出现在界面，指明「后者覆盖前者」
const { chromium } = require('playwright');
const EXE = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1247\\chrome-win64\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:4199/');
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rankboard-canvas-v3'));
    raw.state.config.dataSources = [
      { id: 'ds2', name: '基础数据', kind: 'form', entries: [
        { key: '年绑卡指标', value: '420000' },
        { key: '累计完成绑卡人数', value: '325612' },
      ] },
    ];
    raw.state.config.pipeline = { nodes: [
      { id: 'n_ds2', type: 'source', name: '基础数据', inputs: [], params: { sourceId: 'ds2' }, enabled: true },
      { id: 'n_f', type: 'formula', name: '累计完成绑卡人数', inputs: [], params: { expr: '324212' }, enabled: true },
    ] };
    raw.state.config.blocks = [];
    localStorage.setItem('rankboard-canvas-v3', JSON.stringify(raw));
  });
  await page.goto('http://localhost:4199/');
  await page.waitForTimeout(1500);
  const bar = await page.evaluate(() => document.body.innerText.match(/变量名[^\n]*重复[^\n]*/)?.[0] ?? 'WARN NOT FOUND');
  console.log('warning bar:', bar);
  await page.screenshot({ path: '.shots/warn-bar.png', clip: { x: 0, y: 0, width: 1500, height: 120 } });
  await browser.close();
})();
