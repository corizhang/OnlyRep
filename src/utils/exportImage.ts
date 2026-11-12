import { toBlob, toCanvas } from 'html-to-image';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../storage/tauriKv';

/**
 * PNG 导出（ARCH §1.3）：预检超限 → 自动降倍率（4→2→1）→ 分段拼接兜底 → toBlob 下载。
 * skipFonts: true —— 无 web font，跳过字体探测以避免任何网络请求（纯本地铁律）。
 */

const MAX_SIDE = 16384;
const MAX_AREA = 1.6e8;
const FAIL_MSG = '导出失败，请重试或降低分辨率';

export interface ExportPngOptions {
  scale: 1 | 2 | 4;
  fileName: string;
  /** 仅导出首屏（P1，R6-03）：传入可视高度，超出部分不导出 */
  firstScreenHeight?: number;
  onProgress?: (p: number) => void;
}

export interface ExportPngResult {
  fileName: string;
  /** 实际使用的倍率（可能低于请求值） */
  scale: number;
  /** 是否发生了自动降倍率 */
  downgraded: boolean;
  /** 是否使用了分段拼接兜底 */
  segmented: boolean;
  /** 桌面端（Tauri）：实际落盘完整路径；浏览器端为空（走浏览器下载） */
  savedPath?: string;
}

/** 尺寸预检：单边 ≤16384 且面积 ≤1.6 亿像素 */
export function checkLimit(w: number, h: number, scale: number): boolean {
  const sw = w * scale;
  const sh = h * scale;
  return sw <= MAX_SIDE && sh <= MAX_SIDE && sw * sh <= MAX_AREA;
}

export async function exportPng(
  node: HTMLElement,
  opts: ExportPngOptions,
): Promise<ExportPngResult> {
  const w = node.offsetWidth;
  const fullH = node.offsetHeight;
  const height =
    opts.firstScreenHeight && opts.firstScreenHeight > 0
      ? Math.min(fullH, opts.firstScreenHeight)
      : fullH;
  const cropped = height < fullH;

  let scale = opts.scale;
  let downgraded = false;
  while (scale > 1 && !checkLimit(w, height, scale)) {
    scale = scale === 4 ? 2 : 1;
    downgraded = true;
  }
  opts.onProgress?.(10);

  const cloneStyle = cropped
    ? { height: `${height}px`, overflow: 'hidden' }
    : undefined;

  if (checkLimit(w, height, scale)) {
    try {
      const blob = await toBlob(node, {
        pixelRatio: scale,
        width: w,
        height,
        skipFonts: true,
        style: cloneStyle,
      });
      if (!blob) throw new Error(FAIL_MSG);
      opts.onProgress?.(90);
      const savedPath = await downloadBlob(blob, opts.fileName);
      opts.onProgress?.(100);
      return { fileName: opts.fileName, scale, downgraded, segmented: false, savedPath };
    } catch (err) {
      if (err instanceof Error && err.message === FAIL_MSG) throw err;
      // 渲染失败 → 尝试分段兜底
    }
  }

  const canvas = await segmentedRender(node, w, height, 1, cloneStyle, opts.onProgress);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error(FAIL_MSG);
  const savedPath = await downloadBlob(blob, opts.fileName);
  return { fileName: opts.fileName, scale: 1, downgraded: true, segmented: true, savedPath };
}

/** 分段渲染：按行块（每段高度受面积上限约束）多次渲染后 drawImage 拼接（ARCH §1.3 兜底 2） */
async function segmentedRender(
  node: HTMLElement,
  w: number,
  h: number,
  scale: number,
  cloneStyle: Partial<CSSStyleDeclaration> | undefined,
  onProgress?: (p: number) => void,
): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error(FAIL_MSG);
  ctx.clearRect(0, 0, out.width, out.height);

  const maxSegSrcHeight = Math.max(200, Math.floor(MAX_AREA / (w * scale) / scale / scale) || 200);
  const segH = Math.min(h, Math.max(200, maxSegSrcHeight));
  const total = Math.ceil(h / segH);

  let y = 0;
  let i = 0;
  while (y < h) {
    const curH = Math.min(segH, h - y);
    const canvas = await toCanvas(node, {
      pixelRatio: scale,
      width: w,
      height: curH,
      skipFonts: true,
      style: {
        ...(cloneStyle ?? {}),
        transform: `translateY(-${y}px)`,
      },
    });
    ctx.drawImage(canvas, 0, Math.round(y * scale));
    y += curH;
    i += 1;
    onProgress?.(10 + Math.round((80 * i) / total));
  }
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const url = String(fr.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    fr.onerror = () => reject(new Error(FAIL_MSG));
    fr.readAsDataURL(blob);
  });
}

/**
 * 落盘分发：浏览器走 <a download>；Tauri WebView 不处理该下载（静默吞掉），
 * 必须走 Rust export_file 写系统下载目录，返回完整路径供 toast 展示。
 */
async function downloadBlob(blob: Blob, fileName: string): Promise<string | undefined> {
  const name = fileName.toLowerCase().endsWith('.png') ? fileName : `${fileName}.png`;
  if (isTauri()) {
    return await invoke<string>('export_file', { name, dataBase64: await blobToBase64(blob) });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return undefined;
}
