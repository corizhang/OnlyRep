import { useRef, useState } from 'react';
import { useRankStore } from '../store/useRankStore';
import { buildExportFileName, sanitizeFileName } from '../utils/template';
import { getPosterTitle } from '../utils/blocks';
import { exportPng } from '../utils/exportImage';

const FAIL_MSG = '导出失败，请重试或降低分辨率';

/** 导出面板（R6 系列）：倍率 / 文件名 / 导出按钮 / 进度与错误提示 + 模板导入导出（R7-02） */
export default function ExportPanel() {
  const config = useRankStore((s) => s.config);
  const patchConfig = useRankStore((s) => s.patchConfig);
  const exportTemplate = useRankStore((s) => s.exportTemplate);
  const importTemplate = useRankStore((s) => s.importTemplate);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const tplInputRef = useRef<HTMLInputElement>(null);

  // v2 区块化：标题取自第一个 role==='title' 文本块（空时 buildExportFileName 回退「排行榜」）
  const defaultName = buildExportFileName(getPosterTitle(config));
  const fileName = sanitizeFileName(config.exportFileName || defaultName);

  const onExport = async (): Promise<void> => {
    const node = document.getElementById('rankboard-preview-node');
    if (!node) {
      setError(FAIL_MSG);
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    setProgress(0);
    try {
      const result = await exportPng(node, {
        scale: config.exportScale,
        fileName,
        firstScreenHeight: config.exportFirstScreenOnly ? window.innerHeight : undefined,
        onProgress: setProgress,
      });
      if (result.segmented) setInfo('图表较长，已使用分段拼接方式导出');
      else if (result.downgraded) setInfo('已自动降低分辨率以保证导出成功');
    } catch {
      setError(FAIL_MSG);
    } finally {
      setBusy(false);
    }
  };

  const onImportTemplateFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const text = await file.text();
      importTemplate(JSON.parse(text));
    } catch {
      setError('模板文件格式不正确');
    }
  };

  const scaleBtn = (s: 1 | 2 | 4): string =>
    `rounded border px-2 py-1 text-xs ${
      config.exportScale === s
        ? 'border-brand bg-brand-soft font-medium text-brand'
        : 'border-line bg-panel text-ink-dim hover:border-brand-line'
    }`;

  return (
    <div className="space-y-3 text-xs">
      <div>
        <span className="mb-1 block font-medium text-ink-dim">分辨率倍率</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => patchConfig({ exportScale: 1 })} className={scaleBtn(1)}>
            1x
          </button>
          <button type="button" onClick={() => patchConfig({ exportScale: 2 })} className={scaleBtn(2)}>
            2x
          </button>
          <button type="button" onClick={() => patchConfig({ exportScale: 4 })} className={scaleBtn(4)}>
            4x
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block font-medium text-ink-dim">文件名（默认「标题_YYYYMMDD」）</span>
        <input
          type="text"
          value={config.exportFileName}
          onChange={(e) => patchConfig({ exportFileName: e.target.value })}
          placeholder={defaultName}
          className="w-full rounded border border-line-strong px-2 py-1"
        />
        <div className="mt-1 text-ink-faint">将保存为：{fileName}.png</div>
      </label>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={config.exportFirstScreenOnly}
          onChange={(e) => patchConfig({ exportFirstScreenOnly: e.target.checked })}
        />
        仅导出首屏
      </label>

      <button
        type="button"
        onClick={() => void onExport()}
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? `导出中… ${progress}%` : '导出 PNG'}
      </button>

      {busy && (
        <div className="h-1.5 overflow-hidden rounded-full bg-base">
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <div className="text-danger">{error}</div>}
      {info && <div className="text-warn">{info}</div>}

      {/* 模板（R7-02） */}
      <div className="flex gap-2 border-t border-line pt-2">
        <button
          type="button"
          onClick={exportTemplate}
          className="flex-1 rounded border border-line-strong bg-panel px-2 py-1 text-ink-dim hover:border-brand-line"
        >
          保存为模板
        </button>
        <button
          type="button"
          onClick={() => tplInputRef.current?.click()}
          className="flex-1 rounded border border-line-strong bg-panel px-2 py-1 text-ink-dim hover:border-brand-line"
        >
          导入模板
        </button>
        <input
          ref={tplInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            void onImportTemplateFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
