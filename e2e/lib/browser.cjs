/**
 * 统一的 chromium 定位：不再硬编码 Windows 绝对路径，CI / 其它机器也能跑。
 * 优先级：显式 env → Playwright 浏览器缓存目录（按版本倒序）→ playwright-core 自解析。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function browsersRoot() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'ms-playwright',
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  }
  return path.join(os.homedir(), '.cache', 'ms-playwright');
}

const RELATIVE_EXES = [
  'chrome-win64/chrome.exe',
  'chrome-win/chrome.exe',
  'chrome-linux64/chrome',
  'chrome-linux/chrome',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-headless-shell-win64/chrome-headless-shell.exe',
  'chrome-headless-shell-linux64/chrome-headless-shell',
];

function resolveChromium() {
  for (const key of ['CHROME_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE']) {
    const p = process.env[key];
    if (p && fs.existsSync(p)) return p;
  }
  const root = browsersRoot();
  if (fs.existsSync(root)) {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => /^chromium(_headless_shell)?-\d/.test(d))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const rel of RELATIVE_EXES) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined; // 交给 playwright-core 用自己的注册表解析
}

/** 统一的启动参数；extra 可覆盖（例如自定义 args） */
function launchOptions(extra = {}) {
  const executablePath = resolveChromium();
  return {
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    // 直连代理：绕过本机系统代理向页面注入的 content script（环境噪声，非应用行为）
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      "--proxy-server='direct://'",
      '--proxy-bypass-list=*',
    ],
    ...extra,
  };
}

/**
 * 旧版排行榜编辑器的 e2e 入口：默认现在是「日报画布」，旧脚本断言的是旧版 UI。
 * 通过 entry-mode 持久化键让页面直接进入 rank 模式（不改应用行为、不引入 URL 参数）。
 * 必须在 page.goto 之前调用；对后续 reload 同样生效。
 */
async function prepareLegacyMode(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('rankboard:entry-mode', 'rank');
    } catch {
      // 存储不可用时忽略，交给应用自身降级
    }
  });
}

module.exports = { resolveChromium, launchOptions, prepareLegacyMode };
