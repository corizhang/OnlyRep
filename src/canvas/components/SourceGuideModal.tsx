import { useRef } from 'react';
import { Modal } from 'antd';
import { CheckCircleFilled, FileExcelOutlined } from '@ant-design/icons';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { ImportDataSource } from '../types';

/**
 * 数据源填充引导（模板 → 新项目）：
 * 模板只带壳，import 源是空槽位；逐个选择文件灌入，全部就绪后自动完成。
 * 灌入的文件字节即入快照（项目自包含）。
 */
export default function SourceGuideModal() {
  const open = useCanvasStore((s) => s.sourceGuideOpen);
  const setOpen = useCanvasStore((s) => s.setSourceGuideOpen);
  const config = useCanvasStore((s) => s.config);
  const sources = useCanvasStore((s) => s.sources);
  const loadFileForSource = useCanvasStore((s) => s.loadFileForSource);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickingFor = useRef<string | null>(null);

  const importDefs = config.dataSources.filter((d): d is ImportDataSource => d.kind === 'import');
  const pending = importDefs.filter((d) => sources[d.id]?.status !== 'ready');
  const allReady = importDefs.length > 0 && pending.length === 0;

  const pick = (sourceId: string): void => {
    pickingFor.current = sourceId;
    fileRef.current?.click();
  };

  return (
    <Modal
      title={allReady ? '数据已就绪 🎉' : '填充数据文件'}
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      width={460}
      destroyOnHidden
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const sid = pickingFor.current;
          if (!f || !sid) return;
          await loadFileForSource(sid, f);
        }}
      />
      <p className="mb-3 text-[12px] leading-relaxed text-ink-dim">
        模板只包含版式与管道，数据文件在你手上。为下面每个数据源选择对应的表（xlsx/csv），选完自动解析出图。
      </p>
      <div className="space-y-2">
        {importDefs.map((d) => {
          const ready = sources[d.id]?.status === 'ready';
          const loading = sources[d.id]?.status === 'loading';
          return (
            <div key={d.id} className="flex items-center gap-2.5 rounded-md border border-line bg-soft px-3 py-2">
              {ready ? (
                <CheckCircleFilled className="text-[14px] text-ok" />
              ) : (
                <FileExcelOutlined className="text-[14px] text-ink-faint" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">{d.name}</div>
                <div className="text-[10.5px] text-ink-faint">
                  {ready
                    ? `${sources[d.id]?.table?.rows.length ?? 0} 行已就绪`
                    : d.fileName
                      ? `期望文件：${d.fileName}${d.sheetName ? ` · sheet「${d.sheetName}」` : ''}`
                      : '选择 xlsx/csv 文件'}
                </div>
              </div>
              {!ready && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => pick(d.id)}
                  className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {loading ? '解析中…' : '选择文件'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {allReady ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-brand px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-hover"
          >
            开始使用
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-dim hover:bg-hover"
          >
            稍后再填
          </button>
        )}
      </div>
    </Modal>
  );
}
