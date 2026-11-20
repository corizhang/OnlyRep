import { toPng } from 'html-to-image';

/**
 * 画布缩略图：保存项目时抓一张小图存进项目记录（启动页卡片用）。
 * 降采样到 ~320px 宽 JPEG，体积 <50KB；失败静默返回 undefined（不阻塞保存）。
 */
export async function captureCanvasThumb(): Promise<string | undefined> {
  try {
    const node = document.getElementById('canvas-export-node');
    if (!node) return undefined;
    const dataUrl = await toPng(node, {
      cacheBust: false,
      pixelRatio: 0.35, // 约 320px 宽
      backgroundColor: '#ffffff',
      style: { transform: 'none' }, // 去掉缩放 transform 防截歪
    });
    return dataUrl;
  } catch {
    return undefined;
  }
}
