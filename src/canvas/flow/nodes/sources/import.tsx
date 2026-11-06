import { useRef, useState } from 'react';
import { useCanvasStore } from '../../../../store/useCanvasStore';
import { supportsFileSystemAccess } from '../../../datasource/sourceCache';
import { FieldRow, NBtn, NCheck, NSelect } from '../controls';
import type { SourceKindDef } from '../types';
import type { ImportDataSource, SourceRuntime } from '../../../types';

/** 文件数据源：导入 xlsx / csv（本地解析，可记住文件句柄一键重读） */
export const importSourceDef: SourceKindDef = {
  kind: 'import',
  label: '文件',
  desc: '导入 xlsx / csv',
  icon: '⇪',
  Config: ImportConfig,
};

function ImportConfig({ srcDef, srcRt }: { srcDef: import('../../../types').DataSource; srcRt?: SourceRuntime }) {
  const def = srcDef as ImportDataSource;
  const loadFileForSource = useCanvasStore((s) => s.loadFileForSource);
  const pickFileForSource = useCanvasStore((s) => s.pickFileForSource);
  const rereadSourceFile = useCanvasStore((s) => s.rereadSourceFile);
  const setSourceSheet = useCanvasStore((s) => s.setSourceSheet);
  const setSourceCacheEnabled = useCanvasStore((s) => s.setSourceCacheEnabled);
  const clearSourceCache = useCanvasStore((s) => s.clearSourceCache);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const fsAccess = supportsFileSystemAccess();
  const cacheData = def.cacheData !== false;
  const sheets = srcRt?.sheets ?? [];

  return (
    <div className="no-drag space-y-1.5">
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          await loadFileForSource(def.id, f);
          setBusy(false);
          e.target.value = '';
        }}
      />
      <div className="flex gap-1.5">
        <NBtn
          tone="primary"
          disabled={busy}
          onClick={() => {
            if (fsAccess) {
              setBusy(true);
              void pickFileForSource(def.id).finally(() => setBusy(false));
            } else {
              ref.current?.click();
            }
          }}
        >
          {busy ? '解析中…' : '⇪ 选择文件'}
        </NBtn>
        {srcRt?.hasHandle && (
          <NBtn
            disabled={busy}
            title="从磁盘重新读取已记住的文件（获取最新数据）"
            onClick={() => {
              setBusy(true);
              void rereadSourceFile(def.id).finally(() => setBusy(false));
            }}
          >
            ↻ 重读文件
          </NBtn>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <NCheck checked={cacheData} label="自动恢复数据" onChange={(v) => setSourceCacheEnabled(def.id, v)} />
        {cacheData && <NBtn onClick={() => void clearSourceCache(def.id)} title="删除本地缓存的数据快照">清除缓存</NBtn>}
      </div>
      {sheets.length > 1 && (
        <FieldRow label="工作表">
          <NSelect value={def.sheetName} options={sheets.map((s) => ({ value: s.name, label: s.name }))} onChange={(v) => void setSourceSheet(def.id, v)} />
        </FieldRow>
      )}
      <p className="text-[10px] leading-snug text-[var(--nb-text-faint,#9ca3af)]">xlsx / csv 数据只在本地解析{fsAccess ? '，刷新后可一键重读' : ''}。</p>
    </div>
  );
}
