import { readWorkbookSync, type ParseRequest, type ParseResponse } from './xlsxCore';

/**
 * SheetJS 解析 Web Worker（经 `?worker&inline` 打包为 base64 内联，
 * 运行时以 Blob URL 创建，兼容 vite-plugin-singlefile 与 file:// 协议）。
 * 进度以 0~100 回传主线程；解析失败回传统一错误文案。
 */

interface WorkerCtx {
  addEventListener(type: 'message', listener: (e: MessageEvent<ParseRequest>) => void): void;
  postMessage(message: ParseResponse): void;
}

const ctx = self as unknown as WorkerCtx;

ctx.addEventListener('message', (e: MessageEvent<ParseRequest>) => {
  const req = e.data;
  try {
    const result = readWorkbookSync(req, (value) => {
      ctx.postMessage({ type: 'progress', value });
    });
    ctx.postMessage({ type: 'done', sheets: result.sheets, cells: result.cells, sheetName: result.sheetName });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : '文件损坏或加密，请另存为 xlsx 后重试',
    });
  }
});
