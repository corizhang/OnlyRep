import { useCanvasStore } from '../store/useCanvasStore';
import { exportPng } from '../utils/exportImage';

/**
 * 导出当前画布为 PNG（顶栏按钮调用；画布 DOM + config 全局可取）。
 * 结果写入 store.exportToast（轻横幅展示，8 秒自消）。
 */
let exporting = false;

export async function exportCanvasNow(): Promise<void> {
  if (exporting) return;
  const node = document.getElementById('canvas-export-node');
  const { config, setExportToast, setExportingCanvas } = useCanvasStore.getState();
  if (!node) return;
  exporting = true;
  setExportingCanvas(true);
  setExportToast({ msg: '正在生成图片…', path: '' });
  // 等两帧，确保编辑框已卸载、图表 SVG 已完成布局
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  try {
    const d = new Date();
    const name = `${config.title}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const res = await exportPng(node, { scale: config.exportScale, fileName: name });
    setExportToast({
      msg: res.savedPath
        ? `已导出：${res.savedPath}`
        : `已导出 ${res.scale}x${res.downgraded ? '（受尺寸限制已自动降倍率）' : ''}${res.segmented ? ' · 分段拼接' : ''}`,
      path: res.savedPath ?? '',
    });
  } catch (err) {
    setExportToast({ msg: err instanceof Error ? err.message : '导出失败', path: '' });
  } finally {
    exporting = false;
    setExportingCanvas(false);
    setTimeout(() => {
      // 8 秒自消（若期间有新提示则不顶掉）
      const cur = useCanvasStore.getState().exportToast;
      if (cur) setExportToast(null);
    }, 8000);
  }
}
