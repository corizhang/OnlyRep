/** 图片文件 → 压缩 data URL（上传闸门：>5MB 拒收，≤1800px 宽，JPEG/WebP 0.82） */

export interface CompressResult {
  dataUrl: string;
  /** 压缩后体积（base64 字符数，≈字节数×4/3） */
  size: number;
  width: number;
  height: number;
}

const MAX_INPUT = 5 * 1024 * 1024; // 5MB
const MAX_WIDTH = 1800;

/** 缩放后的目标尺寸（纯函数，供测试） */
export function targetSize(w: number, h: number, maxWidth = MAX_WIDTH): { w: number; h: number } {
  if (w <= maxWidth) return { w, h };
  const scale = maxWidth / w;
  return { w: maxWidth, h: Math.round(h * scale) };
}

export async function compressImageFile(file: File): Promise<CompressResult> {
  if (file.size > MAX_INPUT) throw new Error(`图片超过 5MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB），请先压缩`);
  if (!file.type.startsWith('image/')) throw new Error('只支持图片文件');

  const bitmap = await createImageBitmap(file);
  const { w, h } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持图片处理');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // WebP 优先（更小），不支持时回退 JPEG；透明图（png 后缀）保留 PNG
  const preferPng = file.type === 'image/png';
  const mime = preferPng ? 'image/png' : 'image/webp';
  let dataUrl = canvas.toDataURL(mime, 0.82);
  if (!preferPng && !dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.82); // 老内核回退
  }
  return { dataUrl, size: dataUrl.length, width: w, height: h };
}
