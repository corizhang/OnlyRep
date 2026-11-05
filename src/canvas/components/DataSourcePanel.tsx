import { useRef, useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import {
  checkManualRowLimit,
  createImportSource,
  createManualTableSource,
  uniqueName,
} from '../datasource/registry';
import { supportsFileSystemAccess } from '../datasource/sourceCache';
import { MANUAL_ROW_LIMIT, type DataSource, type SourceRuntime } from '../types';
import { newId } from '../datasource/registry';
import { Btn, Check, Field, NumberInput, Pill, Section, Select, TextInput } from './ui';

/** 数据源管理（PRD R1）：导入 / 手填表格 / 表单单值 / 常量；三个编辑器导出供数据流视图抽屉复用 */
export default function DataSourcePanel() {
  const config = useCanvasStore((s) => s.config);
  const sources = useCanvasStore((s) => s.sources);
  const addSource = useCanvasStore((s) => s.addSource);
  const removeSource = useCanvasStore((s) => s.removeSource);
  const updateSource = useCanvasStore((s) => s.updateSource);
  const [openId, setOpenId] = useState<string | null>(null);

  const add = (kind: DataSource['kind']) => {
    const base = { import: '导入数据', manualTable: '手填表格', form: '口径参数', constant: '常量' }[kind];
    const name = uniqueName(config.dataSources, base);
    if (kind === 'import') addSource(createImportSource(name));
    else if (kind === 'manualTable') addSource(createManualTableSource(name));
    else if (kind === 'form') addSource({ id: newId('ds'), name, kind: 'form', entries: [{ key: '参数1', value: '0' }] });
    else addSource({ id: newId('ds'), name, kind: 'constant', value: '0' });
  };

  return (
    <Section
      title="数据源"
      extra={
        <div className="flex gap-1">
          <Btn size="xs" onClick={() => add('import')} title="导入 xlsx/csv">
            + 文件
          </Btn>
          <Btn size="xs" onClick={() => add('form')} title="名称+数值">
            + 表单
          </Btn>
          <Btn size="xs" onClick={() => add('manualTable')} title="可编辑网格">
            + 表格
          </Btn>
          <Btn size="xs" onClick={() => add('constant')} title="单个常量">
            + 常量
          </Btn>
        </div>
      }
    >
      {config.dataSources.length === 0 && (
        <p className="text-[12px] leading-relaxed text-slate-400">
          还没有数据源。日报通常包含：活动看板、推送汇总、转介统计三个文件 + 一个"口径参数"表单（全年目标/已完成等）。
        </p>
      )}

      {config.dataSources.map((src) => {
        const rt = sources[src.id];
        const open = openId === src.id;
        return (
          <div key={src.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
            <div className="flex items-center gap-1.5">
              <input
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-blue-400 focus:bg-white focus:outline-none"
                value={src.name}
                onChange={(e) => updateSource(src.id, { name: e.target.value })}
              />
              <Pill tone={src.kind === 'import' ? 'blue' : src.kind === 'form' ? 'green' : 'slate'}>
                {{ import: '文件', manualTable: '手填表', form: '表单', constant: '常量' }[src.kind]}
              </Pill>
              <Btn size="xs" tone="ghost" onClick={() => setOpenId(open ? null : src.id)}>
                {open ? '收起' : '编辑'}
              </Btn>
              <Btn size="xs" tone="ghost" onClick={() => removeSource(src.id)} title="删除数据源">
                ✕
              </Btn>
            </div>

            {/* 状态行 */}
            <div className="mt-1 flex flex-wrap items-center gap-2 pl-1 text-[11.5px]">
              {src.kind === 'import' ? (
                <>
                  {rt?.status === 'ready' ? (
                    <>
                      <span className="text-emerald-600">已载入 {rt.table?.rows.length ?? 0} 行</span>
                      {rt.fromCache && (
                        <span className="text-amber-600" title="数据来自上次导入的本地缓存快照">
                          ⚡ 缓存 {fmtCacheTime(rt.cachedAt)}
                        </span>
                      )}
                    </>
                  ) : rt?.status === 'error' ? (
                    <span className="text-red-600">{rt.message}</span>
                  ) : (
                    <span className="text-amber-600">待选择文件</span>
                  )}
                  {src.fileName && <span className="truncate text-slate-400">{src.fileName}</span>}
                </>
              ) : src.kind === 'form' ? (
                <span className="text-slate-400">{src.entries.length} 个参数</span>
              ) : src.kind === 'manualTable' ? (
                <span className="text-slate-400">
                  {src.rows.length} 行 × {src.columns.length} 列
                </span>
              ) : (
                <span className="text-slate-400">值：{src.value || '（空）'}</span>
              )}
            </div>

            {open && (
              <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                {src.kind === 'import' && (
                  <ImportEditor
                    sourceId={src.id}
                    sheetName={src.sheetName}
                    sheets={rt?.sheets ?? []}
                    rt={rt}
                    cacheData={src.cacheData !== false}
                  />
                )}
                {src.kind === 'form' && <FormEditor sourceId={src.id} entries={src.entries} />}
                {src.kind === 'constant' && (
                  <Field label="常量值">
                    <TextInput value={src.value} onChange={(v) => updateSource(src.id, { value: v })} />
                  </Field>
                )}
                {src.kind === 'manualTable' && <ManualEditor sourceId={src.id} columns={src.columns} rows={src.rows} />}
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}

export function ImportEditor({
  sourceId,
  sheetName,
  sheets,
  rt,
  cacheData,
}: {
  sourceId: string;
  sheetName: string;
  sheets: { name: string }[];
  rt?: SourceRuntime;
  cacheData: boolean;
}) {
  const loadFileForSource = useCanvasStore((s) => s.loadFileForSource);
  const setSourceSheet = useCanvasStore((s) => s.setSourceSheet);
  const pickFileForSource = useCanvasStore((s) => s.pickFileForSource);
  const rereadSourceFile = useCanvasStore((s) => s.rereadSourceFile);
  const setSourceCacheEnabled = useCanvasStore((s) => s.setSourceCacheEnabled);
  const clearSourceCache = useCanvasStore((s) => s.clearSourceCache);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const fsAccess = supportsFileSystemAccess();

  const reread = async (): Promise<void> => {
    setBusy(true);
    try {
      await rereadSourceFile(sourceId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          await loadFileForSource(sourceId, f);
          setBusy(false);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Btn
          tone="primary"
          size="xs"
          onClick={() => {
            if (fsAccess) {
              setBusy(true);
              void pickFileForSource(sourceId).finally(() => setBusy(false));
            } else {
              ref.current?.click();
            }
          }}
          disabled={busy}
        >
          {busy ? '解析中…' : '选择文件'}
        </Btn>
        {rt?.hasHandle && (
          <Btn size="xs" tone="ghost" onClick={() => void reread()} disabled={busy} title="从磁盘重新读取已记住的文件（获取最新数据）">
            ↻ 重读文件
          </Btn>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Check checked={cacheData} label="刷新后自动恢复数据" onChange={(v) => setSourceCacheEnabled(sourceId, v)} />
        {cacheData && (
          <Btn size="xs" tone="ghost" onClick={() => void clearSourceCache(sourceId)} title="删除本地缓存的数据快照">
            清除缓存
          </Btn>
        )}
      </div>
      <p className="text-[11.5px] leading-relaxed text-slate-400">
        xlsx / xls / csv，数据只在本地解析。
        {fsAccess ? ' 浏览器将记住文件位置，刷新后可一键重读最新文件。' : ''}
        {cacheData ? ' 解析结果会缓存在本机浏览器（IndexedDB），刷新自动恢复；敏感数据可关闭。' : ''}
      </p>
      {sheets.length > 1 && (
        <Field label="工作表">
          <Select
            value={sheetName}
            onChange={(v) => void setSourceSheet(sourceId, v)}
            options={sheets.map((s) => ({ value: s.name, label: s.name }))}
          />
        </Field>
      )}
    </div>
  );
}

/** 缓存时间展示：今天显示 HH:mm，否则 MM-DD HH:mm */
function fmtCacheTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`;
}

export function FormEditor({ sourceId, entries }: { sourceId: string; entries: { key: string; value: string }[] }) {
  const updateSource = useCanvasStore((s) => s.updateSource);
  return (
    <div className="space-y-1.5">
      {entries.map((e, i) => (
        <div key={i} className="flex gap-1">
          <input
            className="w-[42%] rounded border border-slate-300 px-1.5 py-0.5 text-[12px]"
            value={e.key}
            placeholder="名称"
            onChange={(ev) => {
              const next = entries.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x));
              updateSource(sourceId, { entries: next });
            }}
          />
          <input
            className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]"
            value={e.value}
            placeholder="数值"
            onChange={(ev) => {
              const next = entries.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x));
              updateSource(sourceId, { entries: next });
            }}
          />
          <Btn size="xs" tone="ghost" onClick={() => updateSource(sourceId, { entries: entries.filter((_, j) => j !== i) })}>
            ✕
          </Btn>
        </div>
      ))}
      <Btn size="xs" onClick={() => updateSource(sourceId, { entries: [...entries, { key: '', value: '' }] })}>
        + 添加参数
      </Btn>
      <p className="text-[11.5px] leading-relaxed text-slate-400">
        参数名即公式变量名，如「全年目标」，公式里可直接写 已完成/全年目标。
      </p>
    </div>
  );
}

export function ManualEditor({
  sourceId,
  columns,
  rows,
}: {
  sourceId: string;
  columns: string[];
  rows: (string | number | boolean | Date | null)[][];
}) {
  const updateSource = useCanvasStore((s) => s.updateSource);

  const setCell = (ri: number, ci: number, v: string) => {
    const next = rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r));
    updateSource(sourceId, { rows: next });
  };
  const setCol = (ci: number, v: string) => {
    const next = columns.map((c, i) => (i === ci ? v : c));
    updateSource(sourceId, { columns: next });
  };

  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {columns.map((c, ci) => (
                <th key={ci} className="border border-slate-200 bg-slate-100 p-0">
                  <div className="flex">
                    <input
                      className="w-full min-w-[52px] bg-transparent px-1 py-0.5 text-[12px] font-medium outline-none"
                      value={c}
                      onChange={(e) => setCol(ci, e.target.value)}
                    />
                    {columns.length > 1 && (
                      <button
                        type="button"
                        className="px-1 text-slate-400 hover:text-red-500"
                        title="删除列"
                        onClick={() => updateSource(sourceId, { columns: columns.filter((_, i) => i !== ci), rows: rows.map((r) => r.filter((_, i) => i !== ci)) })}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <td key={ci} className="border border-slate-200 p-0">
                    <input
                      className="w-full min-w-[52px] px-1 py-0.5 text-[12px] outline-none"
                      value={r[ci] === null || r[ci] === undefined ? '' : String(r[ci])}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                    />
                  </td>
                ))}
                <td className="text-center">
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500"
                    title="删除行"
                    onClick={() => updateSource(sourceId, { rows: rows.filter((_, i) => i !== ri) })}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1">
        <Btn
          size="xs"
          disabled={checkManualRowLimit({ id: sourceId, name: '', kind: 'manualTable', columns, rows }) !== null}
          onClick={() => updateSource(sourceId, { rows: [...rows, columns.map(() => '')] })}
        >
          + 行
        </Btn>
        <Btn size="xs" onClick={() => updateSource(sourceId, { columns: [...columns, `列${columns.length + 1}`], rows: rows.map((r) => [...r, '']) })}>
          + 列
        </Btn>
        <span className="ml-auto text-[11.5px] text-slate-400">
          {rows.length}/{MANUAL_ROW_LIMIT} 行
        </span>
      </div>
      <p className="text-[11.5px] text-slate-400">手填数据随模板保存（≤{MANUAL_ROW_LIMIT} 行）；导入文件的数据不会落盘。</p>
    </div>
  );
}
