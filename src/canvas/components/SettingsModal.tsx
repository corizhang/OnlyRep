import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { isTauri, tauriPersistStorage } from '../../storage/tauriKv';

/**
 * 应用设置弹窗（头部 ⚙）：目前含「导出图片路径」。
 * 设置存桌面端 SQLite kv（键 rankboard-export-dir），Rust export_file 同键读取，天然同步。
 */
export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [exportDir, setExportDir] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    if (isTauri()) {
      tauriPersistStorage
        .getItem('rankboard-export-dir')
        .then((v) => {
          setExportDir(v ?? '');
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [open]);

  if (!open) return null;

  const pickDir = async (): Promise<void> => {
    setErr('');
    try {
      const dir = await openDialog({ directory: true, title: '选择导出图片的默认保存位置' });
      if (typeof dir === 'string' && dir) {
        setExportDir(dir);
        await tauriPersistStorage.setItem('rankboard-export-dir', dir);
      }
    } catch (e) {
      setErr(`打开文件夹选择器失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const resetDir = async (): Promise<void> => {
    setExportDir('');
    await tauriPersistStorage.removeItem('rankboard-export-dir');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40" onClick={onClose}>
      <div className="w-[440px] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-slate-800">设置</h3>
          <button type="button" className="text-slate-400 hover:text-slate-600" onClick={onClose}>✕</button>
        </div>

        <div className="mt-4">
          <div className="text-[12px] font-medium text-slate-600">导出图片保存位置</div>
          {isTauri() ? (
            <>
              <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-600 break-all">
                {loaded ? (exportDir || '默认：系统「下载」文件夹下的 RankBoard 目录') : '读取中…'}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void pickDir()}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50"
                >
                  更改…
                </button>
                {exportDir && (
                  <button
                    type="button"
                    onClick={() => void resetDir()}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50"
                  >
                    恢复默认
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
                自定义后所有导出图片都保存到该位置（同名自动追加序号）。仅桌面应用生效。
              </p>
              {err && <p className="mt-1.5 text-[11px] text-red-600">{err}</p>}
            </>
          ) : (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              浏览器版导出走浏览器下载目录（浏览器设置中调整）；桌面应用可在其设置中自定义路径。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
