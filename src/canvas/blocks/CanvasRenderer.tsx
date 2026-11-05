import { Fragment, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { CanvasBlock, CanvasConfig } from '../types';
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

  const container: CSSProperties = {
    width: config.width,
    background: config.pageBg || theme.pageBg,
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
  const bandBg = config.headerBg || theme.headerBg || '';
  const showBand = bandH > 0 && bandBg !== '';

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
            background: bandBg,
            zIndex: 0,
          }}
        />
      )}
      <div
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
    borderTop: edit && !isChild && dragOver ? `2px solid ${ctx.accent}` : '2px solid transparent',
    cursor: edit ? 'pointer' : undefined,
    minHeight: isChild ? 24 : undefined,
  };

  const innerStyle: CSSProperties | undefined =
    rad !== undefined ? { borderRadius: rad, overflow: 'hidden' } : undefined;

  if (!edit) return <div style={shell} data-shell="1"><div style={innerStyle}>{children}</div></div>;

  const dragProps = isChild
    ? {}
    : {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('text/canvas-block', block.id);
          e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes('text/canvas-block')) {
            e.preventDefault();
            setDragOver(true);
          }
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: React.DragEvent) => {
          const dragId = e.dataTransfer.getData('text/canvas-block');
          setDragOver(false);
          if (dragId && dragId !== block.id) {
            e.preventDefault();
            e.stopPropagation();
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
    case 'row': {
      const widths =
        block.config.widths.length === block.config.children.length
          ? block.config.widths
          : block.config.children.map(() => 100 / Math.max(1, block.config.children.length));
      return (
        <div style={{ display: 'flex', gap: ctx.gap, alignItems: block.config.align === 'top' ? 'flex-start' : 'stretch' }}>
          {block.config.children.map((child, i) => (
            <div key={child.id} style={{ flex: `${Math.max(1, widths[i] ?? 1)} 1 0%`, minWidth: 0 }}>
              <BlockShell block={child} edit={edit} ctx={ctx} parentRowId={block.id}>
                {renderBlock(child, ctx)}
              </BlockShell>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

function alignToFlex(align: 'left' | 'center' | 'right'): string {
  return align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
}
