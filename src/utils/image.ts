/**
 * 图片读取与压缩（E8）：>10MB 或长边 >2048 时用 canvas 压到长边 2048 再转 dataURL。
 * 背景图（VisualPanel）与图片区块（BlockEditorPanel）共用，保证海报区全部 dataURL、零网络请求。
 */

export const E8_MSG = '图片已自动压缩以保证性能';
const MAX_LONG_EDGE = 2048;

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = src;
  });
}

/** 压缩归一化：返回 dataURL 与是否发生压缩 */
export async function normalizeImage(file: File): Promise<{ dataUrl: string; compressed: boolean }> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const maxSide = Math.max(img.width, img.height);
  const needCompress = file.size > 10 * 1024 * 1024 || maxSide > MAX_LONG_EDGE;
  if (!needCompress) return { dataUrl, compressed: false };
  const scale = Math.min(1, MAX_LONG_EDGE / maxSide);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl, compressed: false };
  ctx.drawImage(img, 0, 0, w, h);
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return { dataUrl: canvas.toDataURL(mime, 0.85), compressed: true };
}
