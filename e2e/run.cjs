/**
 * e2e 统一入口：自动起 vite preview → 顺序跑所有回归脚本 → 关服务 → 汇总退出码。
 * 供本地与 CI 共用：node e2e/run.cjs（或 npm run test:e2e，会先 build）。
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

const SCRIPTS = [
  'e2e.cjs',
  'regress-whitescreen.cjs',
  'style-p0.cjs',
  'flowsheet.cjs',
  'storage-regression.cjs',
];

function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`vite preview 在 ${timeoutMs}ms 内未就绪`));
        } else {
          setTimeout(tick, 300);
        }
      });
    };
    tick();
  });
}

function runScript(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code === null ? 1 : code));
  });
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('缺少 dist/index.html，请先执行 npm run build');
    process.exit(1);
  }

  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let serverErr = '';
  server.stderr.on('data', (d) => {
    serverErr += d.toString();
  });

  let failed = 0;
  try {
    await waitForServer();
    for (const script of SCRIPTS) {
      console.log(`\n===== ${script} =====`);
      const code = await runScript(script);
      if (code !== 0) failed += 1;
    }
  } catch (err) {
    console.error(err.message);
    if (serverErr) console.error(serverErr.slice(0, 800));
    failed += 1;
  } finally {
    server.kill();
  }

  const passed = SCRIPTS.length - failed;
  console.log(`\n===== e2e 汇总：${passed}/${SCRIPTS.length} 脚本通过 =====`);
  process.exit(failed ? 1 : 0);
})();
