/**
 * 图片压缩（防大图 base64 撑爆存储配额）：
 * >200KB 的图片等比缩到 ≤1200px 宽并重编码 WebP（保透明通道），还不达标再压质量。
 * 小图原样保留（不动画质）。
 */

const SKIP_BYTES = 200 * 1024;
const MAX_WIDTH = 1200;
const QUALITY = 0.85;

export interface CompressedImage {
  dataUrl: string;
  /** 是否发生了压缩 */
  compressed: boolean;
  /** 压缩前/后 KB（展示用） */
  beforeKB: number;
  afterKB: number;
}

export async function compressImageFile(file: File): Promise<CompressedImage> {
  const beforeKB = Math.round(file.size / 1024);
  if (file.size <= SKIP_BYTES) {
    return { dataUrl: await readAsDataUrl(file), compressed: false, beforeKB, afterKB: beforeKB };
  }
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: await readAsDataUrl(file), compressed: false, beforeKB, afterKB: beforeKB };
  ctx.drawImage(img, 0, 0, w, h);

  let dataUrl = canvas.toDataURL('image/webp', QUALITY);
  if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  const afterKB = Math.round((dataUrl.length * 0.75) / 1024);
  return { dataUrl, compressed: true, beforeKB, afterKB };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('图片读取失败'));
    r.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解析失败'));
    };
    img.src = url;
  });
}
