import { Fragment, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { CanvasBlock, CanvasConfig } from '../types';
import { normalizeRowConfig } from './rowTree';
import TextBlock from './textBlock';
import KpiCard from './kpiCard';
import GoalProgress from './goalProgress';
import ChartBlock from './chartBlock';
import DataTable from './dataTable';
import RankBlock from './rankBlock';
import type { RenderCtx } from './context';

/**
 * 画布渲染器：区块流（纵向）+ row 行容器（并排 1~3 块）。
 * 全部 inline style —— html-to-image 对 computed style 的还原最可靠，导出无需特判。
 * 导出节点 id 固定为 canvas-export-node。
 */

export interface CanvasEditHandlers {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDropReorder: (dragId: string, targetId: string) => void;
  /** 复制行容器内的子块（加入同一行） */
  onDuplicateChild?: (rowId: string, childId: string) => void;
  /** 拖放到容器指定列的指定位置（payload：已有块 id 或库组件类型） */
  onDropToColumn?: (rowId: string, colIdx: number, index: number, payload: { kind: 'block'; id: string } | { kind: 'new'; type: CanvasBlock['type'] }) => void;
  /** 拖拽列宽手柄结束：提交新的宽度权重数组 */
  onResizeRow?: (rowId: string, widths: number[]) => void;
  /** 拖到块左/右侧边缘：创建分栏容器（target 与 payload 各占一列） */
  onSplitBeside?: (targetId: string, payload: { kind: 'block'; id: string } | { kind: 'new'; type: CanvasBlock['type'] }, side: 'left' | 'right') => void;
  /** 分栏线 ⊕：在该线位置之后插入空列 */
  onAddColumnAt?: (rowId: string, atIdx: number) => void;
  /** 删除容器某列（内容并入前一列） */
  onRemoveColumn?: (rowId: string, colIdx: number) => void;
  /** 拖到容器左/右边缘：新增一列放入 */
  onInsertAsNewColumn?: (rowId: string, payload: { kind: 'block'; id: string } | { kind: 'new'; type: CanvasBlock['type'] }, side: 'left' | 'right') => void;
}

export interface CanvasRendererProps {
  config: CanvasConfig;
  ctx: RenderCtx;
  /** 编辑态交互；为空表示纯预览（导出/缩略图） */
  edit?: CanvasEditHandlers;
  /** 是否显示编辑期 chrome（导出前置 false） */
  chrome?: boolean;
  /** 拖入新块时的插入位置指示（顶层索引） */
  dropIndex?: number | null;
}

export default function CanvasRenderer({ config, ctx, edit, chrome = false, dropIndex = null }: CanvasRendererProps) {
  const { theme } = ctx;

  const pageFit = config.pageBgFit ?? 'cover';
  const container: CSSProperties = {
    width: config.width,
    background: config.pageBg || theme.pageBg,
    ...(config.pageBgImage
      ? {
          backgroundImage: `url(${config.pageBgImage})`,
          backgroundSize: pageFit === 'cover' ? 'cover' : pageFit === 'contain' ? 'contain' : 'auto',
          backgroundRepeat: pageFit === 'repeat' ? 'repeat' : 'no-repeat',
          backgroundPosition: 'top center',
        }
      : {}),
    color: theme.textColor,
    padding: config.padding,
    display: 'flex',
    flexDirection: 'column',
    gap: config.gap,
    boxSizing: 'border-box',
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  };

  const editProps = chrome ? edit : undefined;

  // 头部通栏色带（R4-10 增补）：只给顶部上色，正文保持白底；
  // 高度 0 = 隐藏；config.headerBg 为空时跟随主题 headerBg
  const bandH = config.headerHeight ?? 110;
  const bandBg = config.headerBgImage ? '' : config.headerBg || theme.headerBg || '';
  const bandFit = config.headerBgFit ?? 'cover';
  const showBand = bandH > 0 && (bandBg !== '' || Boolean(config.headerBgImage));

  return (
    <div id="canvas-export-node" style={container} onClick={() => edit?.onSelect('')}>
      {showBand && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: bandH,
            background: config.headerBgImage ? undefined : bandBg,
            ...(config.headerBgImage
              ? {
                  backgroundImage: `url(${config.headerBgImage})`,
                  backgroundSize: bandFit === 'cover' ? 'cover' : bandFit === 'contain' ? 'contain' : 'auto',
                  backgroundRepeat: bandFit === 'repeat' ? 'repeat' : 'no-repeat',
                  backgroundPosition: 'top center',
                }
              : {}),
            zIndex: 0,
          }}
        >
          {config.headerOverlay && (
            <div style={{ position: 'absolute', inset: 0, background: config.headerOverlay, opacity: config.headerOverlayOpacity ?? 0.4 }} />
          )}
        </div>
      )}
      {/* 页面蒙版：底图之上的整幅罩层（在色带之下、内容之下） */}
      {config.pageOverlay && (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: config.pageOverlay, opacity: config.pageOverlayOpacity ?? 0.4, zIndex: 0 }}
        />
      )}
      <div
        data-block-list="1"
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: config.gap,
          flex: 1,
          minWidth: 0,
        }}
      >
        {config.blocks.map((b, i) => (
          <Fragment key={b.id}>
            {dropIndex === i && editProps && <DropLine accent={ctx.accent} />}
            <BlockShell block={b} edit={editProps} ctx={ctx}>
              {renderBlock(b, ctx, editProps)}
            </BlockShell>
          </Fragment>
        ))}
        {dropIndex !== null && dropIndex >= config.blocks.length && editProps && <DropLine accent={ctx.accent} />}
        {config.blocks.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: theme.secondaryColor, fontSize: ctx.baseFont }}>
            画布还是空的：从左侧「组件库」添加区块
          </div>
        )}
      </div>
    </div>
  );
}

/** 拖入位置指示线 */
function DropLine({ accent }: { accent: string }) {
  return (
    <div
      style={{
        height: 0,
        borderTop: `3px dashed ${accent}`,
        borderRadius: 2,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -2,
          top: -7,
          width: 12,
          height: 12,
          borderRadius: 6,
          background: accent,
        }}
      />
    </div>
  );
}

/** 区块外壳：选中框 + 悬浮工具条 + 拖拽排序；parentRowId 存在时为行容器子块（精简工具条） */
function BlockShell({
  block,
  edit,
  ctx,
  children,
  parentRowId,
}: {
  block: CanvasBlock;
  edit?: CanvasEditHandlers;
  ctx: RenderCtx;
  children: ReactNode;
  parentRowId?: string;
}) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** 拖放到本块侧边的手势态：'left'|'right' 显示竖向分栏指示 */
  const [splitEdge, setSplitEdge] = useState<'left' | 'right' | null>(null);
  const selected = edit?.selectedId === block.id;
  const isChild = Boolean(parentRowId);

  const m = block.shellMargin;
  const rad = block.radius;
  const shell: CSSProperties = {
    position: 'relative',
    outline: edit && selected ? `2px solid ${ctx.accent}` : undefined,
    outlineOffset: 3,
    borderRadius: rad ?? 4,
    // 通用设置：外壳边距 + 圆角（圆角在内层裁切容器上实现，避免裁掉悬浮工具条）
    margin: m ? `${m[0]}px ${m[1]}px ${m[2]}px ${m[3]}px` : undefined,
    borderTop: edit && !isChild && dragOver && !splitEdge ? `2px solid ${ctx.accent}` : '2px solid transparent',
    boxShadow: splitEdge === 'left' ? `inset 3px 0 0 ${ctx.accent}` : splitEdge === 'right' ? `inset -3px 0 0 ${ctx.accent}` : undefined,
    cursor: edit ? 'pointer' : undefined,
    minHeight: isChild ? 24 : undefined,
  };

  const innerStyle: CSSProperties | undefined =
    rad !== undefined ? { borderRadius: rad, overflow: 'hidden' } : undefined;

  if (!edit) return <div style={shell} data-shell="1"><div style={innerStyle}>{children}</div></div>;

  // 子块（容器列内）：可拖出（放置由列容器/顶层接管）；顶层块：可拖且可作放置重排目标
  const dragProps = isChild
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/canvas-block', block.id);
          e.dataTransfer.effectAllowed = 'move';
        },
      }
    : {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('text/canvas-block', block.id);
          e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: (e: React.DragEvent) => {
          const isMove = e.dataTransfer.types.includes('text/canvas-block');
          const isNew = e.dataTransfer.types.includes('text/new-block');
          if (!isMove && !isNew) return;
          e.preventDefault();
          e.stopPropagation();
          // 左右 30% 边缘带 = 侧边分栏手势；中间 = 原有排序落点
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const ratio = (e.clientX - r.left) / Math.max(1, r.width);
          const edge = ratio <= 0.3 ? 'left' : ratio >= 0.7 ? 'right' : null;
          setSplitEdge(edge);
          setDragOver(edge === null && isMove);
        },
        onDragLeave: () => {
          setDragOver(false);
          setSplitEdge(null);
        },
        onDrop: (e: React.DragEvent) => {
          const dragId = e.dataTransfer.getData('text/canvas-block');
          const newType = e.dataTransfer.getData('text/new-block');
          const edge = splitEdge;
          setDragOver(false);
          setSplitEdge(null);
          if (!dragId && !newType) return;
          if (dragId === block.id) return;
          e.preventDefault();
          e.stopPropagation();
          const payload = dragId
            ? ({ kind: 'block', id: dragId } as const)
            : ({ kind: 'new', type: newType as CanvasBlock['type'] } as const);
          if (edge) {
            edit.onSplitBeside?.(block.id, payload, edge);
          } else if (dragId) {
            edit.onDropReorder(dragId, block.id);
          }
        },
      };

  return (
    <div
      style={shell}
      data-shell="1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        edit.onSelect(block.id);
      }}
      {...dragProps}
    >
      <div style={innerStyle}>{children}</div>
      {(hover || selected) && (
        <div
          style={{
            position: 'absolute',
            top: -26,
            right: 0,
            display: 'flex',
            gap: 4,
            background: ctx.accent,
            borderRadius: 6,
            padding: '2px 4px',
            zIndex: 5,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isChild && (
            <ToolBtn title="上移" onClick={() => edit.onMove(block.id, -1)}>
              ↑
            </ToolBtn>
          )}
          {!isChild && (
            <ToolBtn title="下移" onClick={() => edit.onMove(block.id, 1)}>
              ↓
            </ToolBtn>
          )}
          {isChild && edit.onDuplicateChild && parentRowId ? (
            <ToolBtn
              title="复制（加入同一行）"
              onClick={() => {
                const dup = edit.onDuplicateChild;
                const rid = parentRowId;
                if (dup && rid) dup(rid, block.id);
              }}
            >
              ⧉
            </ToolBtn>
          ) : (
            !isChild && (
              <ToolBtn title="复制" onClick={() => edit.onDuplicate(block.id)}>
                ⧉
              </ToolBtn>
            )
          )}
          <ToolBtn title="删除" onClick={() => edit.onDelete(block.id)}>
            ✕
          </ToolBtn>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 20,
        height: 20,
        lineHeight: '18px',
        border: 'none',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.18)',
        color: '#fff',
        fontSize: 12,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

/** 单块渲染分发；edit 仅在顶层调用时传入（供行容器子块包编辑外壳） */
export function renderBlock(block: CanvasBlock, ctx: RenderCtx, edit?: CanvasEditHandlers): ReactNode {
  // 通用设置·圆角注入渲染上下文：组件自带卡片（表格/KPI/目标面板）跟随同一圆角口径
  const bctx: RenderCtx = block.radius !== undefined ? { ...ctx, shellRadius: block.radius } : ctx;
  switch (block.type) {
    case 'text':
      return <TextBlock cfg={block.config} ctx={bctx} />;
    case 'divider':
      return (
        <div
          style={{
            height: Math.max(1, Math.min(8, block.config.thickness)),
            marginTop: block.config.marginY,
            marginBottom: block.config.marginY,
            background:
              block.config.colorMode === 'custom' && block.config.customColor
                ? block.config.customColor
                : ctx.accent,
            borderRadius: 4,
          }}
        />
      );
    case 'image':
      return block.config.src ? (
        <div style={{ display: 'flex', justifyContent: alignToFlex(block.config.align) }}>
          <img
            src={block.config.src}
            alt=""
            style={{ width: `${block.config.widthPct}%`, borderRadius: block.config.borderRadius, display: 'block' }}
          />
        </div>
      ) : (
        <div
          style={{
            border: `2px dashed ${ctx.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.2)'}`,
            borderRadius: block.config.borderRadius,
            padding: 18,
            textAlign: 'center',
            color: ctx.theme.secondaryColor,
            fontSize: ctx.baseFont * 0.85,
          }}
        >
          图片（在右侧上传）
        </div>
      );
    case 'kpiCard':
      return <KpiCard cfg={block.config} ctx={bctx} />;
    case 'goalProgress':
      return <GoalProgress cfg={block.config} ctx={bctx} />;
    case 'chart':
      return <ChartBlock cfg={block.config} ctx={bctx} />;
    case 'dataTable':
      return <DataTable cfg={block.config} ctx={bctx} />;
    case 'rankList':
      return <RankBlock cfg={block.config} ctx={bctx} />;
    case 'row':
      return <RowContainer block={block} edit={edit} ctx={ctx} />;
    default:
      return null;
  }
}

function alignToFlex(align: 'left' | 'center' | 'right'): string {
  return align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
}


/** 容器列堆栈：编辑模式下作为独立放置区（列内指示线 + 精确落点） */
function ColumnStack({
  rowId,
  colIdx,
  width,
  col,
  edit,
  ctx,
  gap,
  colCount,
}: {
  rowId: string;
  colIdx: number;
  width: number;
  col: { blocks: CanvasBlock[] };
  edit?: CanvasEditHandlers;
  ctx: RenderCtx;
  gap: number;
  colCount: number;
}) {
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const computeIdx = (clientY: number): number => {
    const el = ref.current;
    if (!el) return col.blocks.length;
    const shells = Array.from(el.querySelectorAll(':scope > [data-shell="1"]')) as HTMLElement[];
    let idx = 0;
    for (const sh of shells) {
      const r = sh.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) idx += 1;
    }
    return idx;
  };

  const dndProps = edit
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('text/new-block') && !e.dataTransfer.types.includes('text/canvas-block')) return;
          e.preventDefault();
          e.stopPropagation();
          setDropIdx(computeIdx(e.clientY));
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIdx(null);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = dropIdx ?? col.blocks.length;
          setDropIdx(null);
          const blockId = e.dataTransfer.getData('text/canvas-block');
          if (blockId) {
            edit.onDropToColumn?.(rowId, colIdx, idx, { kind: 'block', id: blockId });
            return;
          }
          const t = e.dataTransfer.getData('text/new-block');
          if (t) edit.onDropToColumn?.(rowId, colIdx, idx, { kind: 'new', type: t as CanvasBlock['type'] });
        },
      }
    : {};

  const children: ReactNode[] = [];
  col.blocks.forEach((child, i) => {
    if (edit && dropIdx === i) children.push(<DropLine key={`dl-${i}`} accent={ctx.accent} />);
    children.push(
      <BlockShell key={child.id} block={child} edit={edit} ctx={ctx} parentRowId={rowId}>
        {renderBlock(child, ctx, edit)}
      </BlockShell>,
    );
  });
  if (edit && dropIdx !== null && dropIdx >= col.blocks.length) {
    children.push(<DropLine key="dl-end" accent={ctx.accent} />);
  }

  return (
    <div
      ref={ref}
      data-row-col={`${rowId}:${colIdx}`}
      style={{ flex: `${width} 1 0%`, minWidth: 0, display: 'flex', flexDirection: 'column', gap }}
      {...dndProps}
    >
      {children}
      {edit && col.blocks.length === 0 && dropIdx === null && (
        <div
          style={{
            border: `1.5px dashed ${ctx.accent}55`,
            borderRadius: 8,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ctx.theme.secondaryColor,
            fontSize: ctx.baseFont * 0.8,
          }}
        >
          空列：拖组件到这里
          {colCount > 1 && edit.onRemoveColumn && (
            <button
              type="button"
              title="删除此空列"
              onClick={(e) => {
                e.stopPropagation();
                edit.onRemoveColumn!(rowId, colIdx);
              }}
              style={{ cursor: 'pointer', color: ctx.theme.secondaryColor, border: 'none', background: 'none', padding: '0 2px' }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}


/** 分栏容器：列堆栈 + 列间宽度拖拽手柄（拖动中本地预览，松手一次提交 widths） */
function RowContainer({ block, edit, ctx }: { block: Extract<CanvasBlock, { type: 'row' }>; edit?: CanvasEditHandlers; ctx: RenderCtx }) {
  // 防御：老模板/老持久化数据可能是 children 结构（归一化幂等）
  const cfg = normalizeRowConfig(block.config);
  const cols = cfg.columns;
  const baseWidths =
    block.config.widths.length === cols.length ? block.config.widths : cols.map(() => Math.round(100 / Math.max(1, cols.length)));
  const rootRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number[] | null>(null);
  /** 拖到容器左/右边缘带的加列手势态 */
  const [edgeSide, setEdgeSide] = useState<'left' | 'right' | null>(null);
  const widths = preview ?? baseWidths;

  const edgeDndProps = edit
    ? {
        // 捕获相位：列堆栈（ColumnStack）会 stopPropagation，边缘带判定必须抢在它之前
        onDragOverCapture: (e: React.DragEvent) => {
          const isMove = e.dataTransfer.types.includes('text/canvas-block');
          const isNew = e.dataTransfer.types.includes('text/new-block');
          if (!isMove && !isNew) return;
          const r = rootRef.current?.getBoundingClientRect();
          if (!r) return;
          const dl = e.clientX - r.left;
          const dr = r.right - e.clientX;
          const side = dl <= 24 ? ('left' as const) : dr <= 24 ? ('right' as const) : null;
          setEdgeSide(side);
          if (side) {
            // 拦在捕获期：列内指示不抢戏
            e.preventDefault();
            e.stopPropagation();
          }
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setEdgeSide(null);
        },
        onDropCapture: (e: React.DragEvent) => {
          if (!edgeSide) return;
          const dragId = e.dataTransfer.getData('text/canvas-block');
          const newType = e.dataTransfer.getData('text/new-block');
          setEdgeSide(null);
          if (!dragId && !newType) return;
          e.preventDefault();
          e.stopPropagation();
          const payload = dragId
            ? ({ kind: 'block', id: dragId } as const)
            : ({ kind: 'new', type: newType as CanvasBlock['type'] } as const);
          edit.onInsertAsNewColumn?.(block.id, payload, edgeSide);
        },
      }
    : {};

  const startResize = (e: React.MouseEvent, handleIdx: number): void => {
    if (!edit) return;
    e.preventDefault();
    e.stopPropagation();
    const rootW = rootRef.current?.getBoundingClientRect().width ?? 1;
    const startX = e.clientX;
    const start = [...baseWidths];
    const pairSum = start[handleIdx] + start[handleIdx + 1];
    const onMove = (ev: MouseEvent): void => {
      const deltaW = ((ev.clientX - startX) / rootW) * start.reduce((a, b) => a + b, 0);
      const next = [...start];
      next[handleIdx] = Math.max(5, Math.min(pairSum - 5, start[handleIdx] + deltaW));
      next[handleIdx + 1] = pairSum - next[handleIdx];
      setPreview(next);
    };
    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // 位移 <3px 视为点击：选中容器本身（嵌套层级下容器难选中问题的画布侧入口）
      if (Math.abs(ev.clientX - startX) < 3) {
        setPreview(null);
        edit.onSelect(block.id);
        return;
      }
      const deltaW = ((ev.clientX - startX) / rootW) * start.reduce((a, b) => a + b, 0);
      const next = [...start];
      next[handleIdx] = Math.max(5, Math.min(pairSum - 5, Math.round(start[handleIdx] + deltaW)));
      next[handleIdx + 1] = pairSum - next[handleIdx];
      setPreview(null);
      edit.onResizeRow?.(block.id, next);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        gap: ctx.gap,
        alignItems: block.config.align === 'top' ? 'flex-start' : 'stretch',
        // 加列手势指示：容器边缘内侧蓝色竖条
        boxShadow: edgeSide === 'left' ? `inset 3px 0 0 ${ctx.accent}` : edgeSide === 'right' ? `inset -3px 0 0 ${ctx.accent}` : undefined,
        borderRadius: 6,
      }}
      {...edgeDndProps}
    >
      {cols.map((col, i) => (
        <Fragment key={i}>
          {edit && i > 0 && (
            <ColumnHandle
              key={`h-${i}`}
              accent={ctx.accent}
              gap={ctx.gap}
              active={preview !== null}
              onResizeStart={(e) => startResize(e, i - 1)}
              onAddColumn={cols.length < 4 && edit.onAddColumnAt ? () => edit.onAddColumnAt!(block.id, i) : undefined}
            />
          )}
          <ColumnStack
            rowId={block.id}
            colIdx={i}
            width={Math.max(1, widths[i] ?? 1)}
            col={col}
            edit={edit}
            ctx={ctx}
            gap={ctx.gap}
            colCount={cols.length}
          />
        </Fragment>
      ))}
    </div>
  );
}


/** 分栏线手柄：悬停整线高亮 + 顶部浮现 ⊕ 加列；mousedown 拖动调宽 */
function ColumnHandle({
  accent,
  gap,
  active,
  onResizeStart,
  onAddColumn,
}: {
  accent: string;
  gap: number;
  active: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  onAddColumn?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const lit = hover || active;
  return (
    <div
      onMouseDown={onResizeStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="拖拽调整列宽；点击选中容器"
      style={{
        width: 10,
        margin: `0 -${(10 + gap) / 2}px`,
        cursor: 'col-resize',
        zIndex: 6,
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 3,
          borderRadius: 2,
          background: lit ? accent : `${accent}44`,
          transition: 'background 0.15s',
        }}
      />
      {hover && onAddColumn && (
        <button
          type="button"
          title="在此插入一列"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddColumn();
          }}
          style={{
            position: 'absolute',
            top: -2,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: accent,
            color: '#fff',
            fontSize: 12,
            lineHeight: '18px',
            border: 'none',
            cursor: 'pointer',
            zIndex: 7,
          }}
        >
          +
        </button>
      )}
    </div>
  );
}
