import { useCanvasStore } from '../store/useCanvasStore';
import { initTemplateLibraryStorage } from './templateLibrary';
import { initProjectLibraryStorage } from './projectLibrary';
import { isTauri } from '../storage/tauriKv';

/**
 * 应用初始化（幂等，模块级 promise 防重入）：
 * Tauri 下先 rehydrate persist（SQLite 异步后端）+ 载入模板/项目库镜像，再 bootstrap。
 * 启动页与工作台都可能先到，必须共用同一份初始化。
 */
let initPromise: Promise<void> | null = null;

export function ensureAppInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (isTauri()) {
      await useCanvasStore.persist.rehydrate();
      await initTemplateLibraryStorage();
      await initProjectLibraryStorage();
    }
    // ?preset=xxx 直达载入内置模板（演示/截图）
    const preset = new URLSearchParams(window.location.search).get('preset');
    if (preset) useCanvasStore.getState().applyPreset(preset);
    else useCanvasStore.getState().bootstrap();
  })();
  return initPromise;
}
