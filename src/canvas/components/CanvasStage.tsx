import { useState } from 'react';
import { Segmented } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { THEMES } from '../../themes/themes';
import type { CanvasBlock } from '../types';
import CanvasRenderer from '../blocks/CanvasRenderer';
import type { RenderCtx } from '../blocks/context';
import { exportPng } from '../../utils/exportImage';
import EmptyGuide from './EmptyGuide';
import { createBlock } from '../defaults';
import { Btn } from './ui';

/** 画布舞台：渲染 + 选中/拖拽排序 + 导出 PNG */
export default function CanvasStage() {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const env = useCanvasStore((s) => s.env);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const moveBlock = useCanvasStore((s) => s.moveBlock);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const insertBlockAt = useCanvasStore((s) => s.insertBlockAt);
  const addBlockToRow = useCanvasStore((s) => s.addBlockToRow);

  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState('');
  const [dropHint, setDropHint] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const theme = THEMES[config.themeId];
  const accent = config.accentColor || theme.accent;

  const ctx: RenderCtx = {
    theme,
    accent,
    baseFont: config.baseFontSize,
    gap: config.gap,
    rise: config.riseColor,
    fall: config.fallColor,
    resolve: { outputs, env, sources: config.dataSources },
  };

  const duplicate = (id: string): void => {
    const found = findInBlocks(config.blocks, id);
    if (!found) return;
    addBlock(cloneBlock(found), id);
    selectBlock(null);
  };

  const reorder = (dragId: string, targetId: string): void => {
    const blocks = [...config.blocks];
    const from = blocks.findIndex((b) => b.id === dragId);
    const to = blocks.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    useCanvasStore.setState({ config: { ...config, blocks } });
  };

  /** 复制行容器子块并加入同一行（上限 3） */
  const duplicateChild = (rowId: string, childId: string): void => {
    const row = config.blocks.find((b) => b.id === rowId);
    if (!row || row.type !== 'row') return;
    if (row.config.children.length >= 3) {
      setToast('行容器最多并排 3 个区块');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    const child = row.config.children.find((c) => c.id === childId);
    if (!child) return;
    addBlockToRow(rowId, cloneBlock(child));
  };

  /**
   * 计算拖入落点的顶层插入索引：按指针 Y 与各顶层区块外壳中点比较。
   * 画布缩放是 CSS transform，getBoundingClientRect 已含缩放，直接可比。
   */
  const computeDropIndex = (clientY: number): number => {
    const node = document.getElementById('canvas-export-node');
    if (!node) return config.blocks.length;
    const shells = Array.from(node.children).filter((el) => (el as HTMLElement).dataset.shell === '1') as HTMLElement[];
    let idx = 0;
    for (const el of shells) {
      const r = el.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) idx += 1;
    }
    return idx;
  };

  const doExport = async (): Promise<void> => {
    const node = document.getElementById('canvas-export-node');
    if (!node) return;
    setExporting(true);
    setToast('正在生成图片…');
    // 等两帧，确保编辑框已卸载、图表 SVG 已完成布局
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    try {
      const d = new Date();
      const name = `${config.title}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const res = await exportPng(node, { scale: config.exportScale, fileName: name });
      setToast(
        res.savedPath
          ? `已导出：${res.savedPath}`
          : `已导出 ${res.scale}x${res.downgraded ? '（受尺寸限制已自动降倍率）' : ''}${res.segmented ? ' · 分段拼接' : ''}`,
      );
    } catch (err) {
      setToast(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
      setTimeout(() => setToast(''), 8000);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <span className="text-[12px] text-slate-500">
          {config.width}px · {countBlocks(config.blocks)} 个区块
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            value={zoom}
            onChange={(v) => setZoom(Number(v))}
            options={[
              { label: '50%', value: 0.5 },
              { label: '75%', value: 0.75 },
              { label: '100%', value: 1 },
              { label: '125%', value: 1.25 },
            ]}
          />
          <Btn tone="primary" onClick={() => void doExport()} disabled={exporting}>
            {exporting ? '导出中…' : `导出图片（${config.exportScale}x）`}
          </Btn>
        </div>
      </div>

      {toast && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-1.5 text-[11px] text-blue-700">{toast}</div>
      )}

      <div
        className="relative flex-1 overflow-auto bg-slate-200 p-6"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/new-block')) {
            e.preventDefault();
            setDropHint(true);
            setDropIndex(computeDropIndex(e.clientY));
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropHint(false);
            setDropIndex(null);
          }
        }}
        onDrop={(e) => {
          const type = e.dataTransfer.getData('text/new-block');
          setDropHint(false);
          setDropIndex(null);
          if (type) {
            e.preventDefault();
            insertBlockAt(createBlock(type as Parameters<typeof createBlock>[0]), computeDropIndex(e.clientY));
          }
        }}
        onClick={() => selectBlock(null)}
      >
        {/* 空态引导：没有区块时给出最短上手路径 */}
        {config.blocks.length === 0 && <EmptyGuide variant="canvas" />}
        <div className={`mx-auto w-fit rounded-lg ${dropHint ? 'ring-2 ring-blue-400' : ''}`}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <CanvasRenderer
              config={config}
              ctx={ctx}
              chrome={!exporting}
              dropIndex={dropHint ? dropIndex : null}
              edit={
                exporting
                  ? undefined
                  : {
                      selectedId,
                      onSelect: (id) => selectBlock(id || null),
                      onMove: moveBlock,
                      onDelete: removeBlock,
                      onDuplicate: duplicate,
                      onDropReorder: reorder,
                      onDuplicateChild: duplicateChild,
                    }
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function findInBlocks(blocks: CanvasBlock[], id: string): CanvasBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === 'row') {
      const hit = findInBlocks(b.config.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

function cloneBlock(b: CanvasBlock): CanvasBlock {
  const id = `cb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (b.type === 'row') {
    return {
      ...b,
      id,
      type: 'row',
      config: { ...b.config, children: b.config.children.map((c) => cloneBlock(c)) },
    };
  }
  return { ...b, id, config: { ...b.config } } as CanvasBlock;
}

function countBlocks(blocks: CanvasBlock[]): number {
  return blocks.reduce((n, b) => n + 1 + (b.type === 'row' ? b.config.children.length : 0), 0);
}
