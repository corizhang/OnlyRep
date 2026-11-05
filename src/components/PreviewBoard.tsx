import type { CSSProperties, ReactNode } from 'react';
import { useRankStore } from '../store/useRankStore';
import { THEMES, defaultOverlayFor, roleColorFor, tierOf } from '../themes/themes';
import RankRowCard from './RankRowCard';
import { formatValue } from '../compute/format';
import { chunkRows, clampNum, createRankListBlockConfig, expandTableCols, normalizeWeights, splitTwoColumn, TABLE_COL_DEFAULT_ALIGN } from '../utils/blocks';
import type {
  BlockAlign,
  DividerBlockConfig,
  ImageBlockConfig,
  PosterBlock,
  RankListBlockConfig,
  RankRow,
  TableColId,
  TextBlockConfig,
  TierStyle,
} from '../types';

/** 海报逻辑宽度固定 750px；导出 1x/2x/4x = 750/1500/3000 物理像素（用户规格） */
const BOARD_WIDTH = 750;

/**
 * 海报渲染器（v2 区块化版式）：config.blocks 有序流式堆叠 + config.floats 绝对定位悬浮层。
 * 全部 inline style + ThemeTokens（D7：html-to-image 内联 computed style 最可靠）。
 * 导出节点固定 id：rankboard-preview-node。
 */
export default function PreviewBoard() {
  const config = useRankStore((s) => s.config);
  const board = useRankStore((s) => s.board);
  const rawTable = useRankStore((s) => s.rawTable);

  const theme = THEMES[config.themeId];
  const accent = config.accentColor || theme.accent;
  const baseFont = theme.fontSizes[config.fontSize];
  const pad = theme.spacing[config.lineHeight];
  const colUnit = rawTable?.columns.find((c) => c.key === config.metricKey)?.unitHint ?? '';

  const rows = board?.rows ?? [];

  const renderRow = (row: RankRow, index: number, blockCfg: RankListBlockConfig, isLast: boolean): ReactNode => (
    <RankRowCard
      key={`${row.displayRank}-${row.name}`}
      row={row}
      index={index}
      theme={theme}
      config={config}
      block={blockCfg}
      colUnit={colUnit}
      accent={accent}
      isLast={isLast}
    />
  );

  const columnStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: pad,
    flex: 1,
    minWidth: 0,
  };

  const emptyNode: ReactNode = (
    <div style={{ padding: 40, textAlign: 'center', color: theme.secondaryColor, fontSize: baseFont }}>
      请选择指标列以生成排行榜
    </div>
  );

  // ---- 榜单块：表格变体（列显隐/顺序/宽度/对齐/表头可配 + Top3 金银铜徽章） ----
  const renderTable = (cfg: RankListBlockConfig): ReactNode => {
    // 兜底：旧持久化/模板可能缺 table 子对象（正常应被 store 迁移补齐）
    const tbl = cfg.table ?? createRankListBlockConfig(cfg.variant, cfg.pageSize).table;
    const secKeys = config.secondaryKeys;
    const secLabels = secKeys.map(
      (k) => rawTable?.columns.find((c) => c.key === k)?.rawName ?? '字段',
    );
    const metricName =
      rawTable?.columns.find((c) => c.key === config.metricKey)?.rawName || '数值';
    const valueHeader = colUnit !== '' ? `${metricName}（${colUnit}）` : metricName;
    // 'secondary' 列展开为每个次要字段一列；缺省列序补 name 列（防御坏数据）
    const cols = expandTableCols(tbl.columns.length > 0 ? tbl.columns : ['rank', 'name', 'value'], secKeys.length);
    const alignOf = (id: TableColId): BlockAlign =>
      tbl.aligns[id] ?? TABLE_COL_DEFAULT_ALIGN[id];
    const labelOf = (id: TableColId, secIndex: number): string =>
      id === 'rank'
        ? '名次'
        : id === 'name'
          ? '名称'
          : id === 'secondary'
            ? (secLabels[secIndex] ?? '字段')
            : valueHeader;
    const zebraBg = theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
    const ellipsis: CSSProperties = {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    };
    const cellPad = `${Math.max(4, Math.round(pad / 2))}px 10px`;

    // Top3 名次格：24px 金银铜圆徽章（默认行为，无开关）；inline-flex 让父级 textAlign 控制水平位置
    const rankCell = (row: RankRow): ReactNode => {
      if (row.displayRank >= 1 && row.displayRank <= 3 && !row.isOthers) {
        const medalColor =
          row.displayRank === 1
            ? theme.medalColors.gold
            : row.displayRank === 2
              ? theme.medalColors.silver
              : theme.medalColors.bronze;
        return (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: medalColor,
              color: '#3A2A00',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: baseFont * 0.85,
              boxSizing: 'border-box',
            }}
          >
            {row.rank}
          </div>
        );
      }
      return <span>{row.rank}</span>;
    };

    // 数据行单格内容（对齐由外层容器 textAlign 控制）
    const dataCellContent = (row: RankRow, id: TableColId, secIndex: number, tier: TierStyle): ReactNode => {
      switch (id) {
        case 'rank':
          return rankCell(row);
        case 'name':
          return (
            <div style={{ fontWeight: 700, fontSize: baseFont, ...ellipsis }} title={row.name}>
              {row.name}
            </div>
          );
        case 'secondary':
          return (
            <div style={{ color: theme.secondaryColor, fontSize: baseFont * 0.85, ...ellipsis }}>
              {row.secondary[secIndex] ?? ''}
            </div>
          );
        case 'value':
          return (
            <div
              style={{
                fontWeight: 700,
                color: tier.valueColor,
                fontSize: baseFont * 1.05,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {formatValue(row.value, config.numberFormat, colUnit)}
            </div>
          );
      }
    };

    // 行模型：表头 + 数据行（grid / table 两种渲染路径共用）
    const headerCells = cols.map((c) => ({ align: alignOf(c.id), label: labelOf(c.id, c.secIndex) }));
    const bodyRows = rows.map((row, i) => {
      const tier = tierOf(row.displayRank);
      const t = theme.tiers[tier];
      const dim =
        config.dimTop10Outside && tier === 'rest' && !row.isOthers
          ? 'grayscale(1)'
          : undefined;
      return {
        key: `${row.displayRank}-${row.name}`,
        bg: config.zebra && i % 2 === 1 ? zebraBg : t.cardBg,
        color: t.textColor,
        borderBottom: `1px solid ${theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        filter: dim,
        cells: cols.map((c) => ({
          align: alignOf(c.id),
          content: dataCellContent(row, c.id, c.secIndex, t),
        })),
      };
    });

    const headerBg =
      tbl.header.bg === 'none'
        ? 'transparent'
        : theme.dark
          ? 'rgba(255,255,255,0.12)'
          : 'rgba(15,23,42,0.06)';

    const outerStyle: CSSProperties = {
      borderRadius: config.borderRadius,
      overflow: 'hidden',
      border: `1px solid ${theme.tiers.top10.cardBorder}`,
    };

    // 列宽 custom：真实 <table> + <colgroup> + table-layout:fixed，宽度按权重归一化百分比
    if (tbl.colWidthMode === 'custom') {
      const pcts = normalizeWeights(tbl.colWeights, cols.map((c) => c.id));
      return (
        <div style={outerStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {pcts.map((p, i) => (
                <col key={i} style={{ width: `${p}%` }} />
              ))}
            </colgroup>
            {tbl.header.show && (
              <thead>
                <tr>
                  {headerCells.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: cellPad,
                        textAlign: h.align,
                        background: headerBg,
                        color: theme.secondaryColor,
                        fontWeight: tbl.header.bold ? 700 : 400,
                        fontSize: baseFont * 0.85,
                      }}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((r) => (
                <tr key={r.key}>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      style={{
                        padding: cellPad,
                        textAlign: c.align,
                        background: r.bg,
                        color: r.color,
                        borderBottom: r.borderBottom,
                        filter: r.filter,
                      }}
                    >
                      {c.content}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // 列宽 auto（现状）：CSS Grid，各列固定基准宽
    const gridCols = cols
      .map((c) =>
        c.id === 'rank' ? '64px' : c.id === 'name' ? '1fr' : c.id === 'secondary' ? '110px' : '150px',
      )
      .join(' ');
    const cellBase: CSSProperties = {
      display: 'grid',
      gridTemplateColumns: gridCols,
      alignItems: 'center',
      padding: cellPad,
      columnGap: 8,
    };

    return (
      <div style={outerStyle}>
        {tbl.header.show && (
          <div
            style={{
              ...cellBase,
              background: headerBg,
              color: theme.secondaryColor,
              fontWeight: tbl.header.bold ? 700 : 400,
              fontSize: baseFont * 0.85,
            }}
          >
            {headerCells.map((h, i) => (
              <div key={i} style={{ textAlign: h.align }}>
                {h.label}
              </div>
            ))}
          </div>
        )}
        {bodyRows.map((r) => (
          <div
            key={r.key}
            style={{
              ...cellBase,
              background: r.bg,
              color: r.color,
              borderBottom: r.borderBottom,
              filter: r.filter,
            }}
          >
            {r.cells.map((c, i) => (
              <div key={i} style={{ textAlign: c.align }}>
                {c.content}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  // ---- 榜单块：按变体分发（行样式/徽章/图标/进度条等块级配置透传 RankRowCard） ----
  const renderRankList = (cfg: RankListBlockConfig): ReactNode => {
    if (rows.length === 0) return emptyNode;
    const mapRows = (list: RankRow[]): ReactNode =>
      list.map((row, i) => renderRow(row, i, cfg, i === list.length - 1));
    if (cfg.variant === 'twoColumn') {
      const [left, right] = splitTwoColumn(rows);
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={columnStyle}>{mapRows(left)}</div>
          <div style={columnStyle}>{mapRows(right)}</div>
        </div>
      );
    }
    if (cfg.variant === 'paged') {
      return chunkRows(rows, cfg.pageSize).map((pageRows, i) => (
        <div key={i} style={{ marginBottom: pad * 2 }}>
          <div style={{ fontSize: baseFont * 0.8, color: theme.secondaryColor, marginBottom: pad / 2 }}>
            第 {i + 1} 页
          </div>
          <div style={columnStyle}>{mapRows(pageRows)}</div>
        </div>
      ));
    }
    if (cfg.variant === 'table') return renderTable(cfg);
    return <div style={columnStyle}>{mapRows(rows)}</div>;
  };

  // ---- 通用区块渲染（流式 / 悬浮共用；全部 inline style） ----
  const renderBlock = (block: PosterBlock, isFloat: boolean): ReactNode => {
    switch (block.type) {
      case 'text': {
        const cfg = block.config as TextBlockConfig;
        const color =
          cfg.colorMode === 'custom' && cfg.customColor !== ''
            ? cfg.customColor
            : roleColorFor(theme, cfg.role);
        return (
          <div
            style={{
              fontSize: baseFont * cfg.fontSizeScale,
              fontWeight: cfg.bold ? 700 : 400,
              color,
              textAlign: cfg.align,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {cfg.content}
          </div>
        );
      }
      case 'image': {
        const cfg = block.config as ImageBlockConfig;
        if (cfg.src === null) {
          // 未上传占位：虚线框，宽随 widthPct（悬浮时铺满悬浮容器）
          return (
            <div
              style={{
                width: isFloat ? '100%' : `${clampNum(cfg.widthPct, 10, 100, 50)}%`,
                height: 80,
                border: '2px dashed rgba(128,128,128,0.6)',
                borderRadius: cfg.borderRadius,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(128,128,128,0.8)',
                fontSize: baseFont,
                boxSizing: 'border-box',
              }}
            >
              图片
            </div>
          );
        }
        const img = (
          <img
            src={cfg.src}
            alt=""
            style={{
              width: isFloat ? '100%' : `${clampNum(cfg.widthPct, 10, 100, 50)}%`,
              borderRadius: cfg.borderRadius,
              display: 'block',
            }}
          />
        );
        if (isFloat) return img;
        return (
          <div
            style={{
              display: 'flex',
              justifyContent:
                cfg.align === 'center' ? 'center' : cfg.align === 'right' ? 'flex-end' : 'flex-start',
            }}
          >
            {img}
          </div>
        );
      }
      case 'rankList':
        return renderRankList(block.config as RankListBlockConfig);
      case 'divider': {
        const cfg = block.config as DividerBlockConfig;
        const color =
          cfg.colorMode === 'custom' && cfg.customColor !== '' ? cfg.customColor : accent;
        return (
          <div
            style={{
              marginTop: cfg.marginY,
              marginBottom: cfg.marginY,
              height: clampNum(cfg.thickness, 1, 8, 2),
              background: color,
              borderRadius: clampNum(cfg.thickness, 1, 8, 2) / 2,
            }}
          />
        );
      }
      default:
        return null;
    }
  };

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: BOARD_WIDTH,
    minHeight: 320,
    background: theme.pageBg,
    color: theme.textColor,
    overflow: 'hidden',
    borderRadius: 8,
    flexShrink: 0,
  };

  const innerStyle: CSSProperties = {
    position: 'relative',
    padding: 32,
    display: 'flex',
    flexDirection: 'column',
    gap: pad,
  };

  return (
    <div id="rankboard-preview-node" style={containerStyle}>
      {config.backgroundImage && (
        <>
          <img
            src={config.backgroundImage}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit:
                config.bgFill === 'stretch' ? 'fill' : config.bgFill === 'center' ? 'none' : 'cover',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: config.overlayColor || defaultOverlayFor(theme),
              opacity: config.overlayOpacity,
            }}
          />
        </>
      )}

      {/* 流式区块（有序堆叠） */}
      <div style={innerStyle}>
        {config.blocks.map((b) => (
          <div key={b.id}>{renderBlock(b, false)}</div>
        ))}

        {/* 非阻断提示（E3/E4/E5 + 排除统计） */}
        {board && board.warnings.length > 0 && (
          <div style={{ marginTop: pad }}>
            {board.warnings.map((w, i) => (
              <div key={i} style={{ color: '#F59E0B', fontSize: baseFont * 0.8 }}>
                ⚠ {w}
              </div>
            ))}
          </div>
        )}
        {board && board.excludedCount > 0 && (
          <div style={{ color: theme.secondaryColor, fontSize: baseFont * 0.8 }}>
            已排除 {board.excludedCount} 项
          </div>
        )}
      </div>

      {/* 悬浮层：绝对定位百分比坐标，渲染在流式内容之上；inline style 保证导出还原 */}
      {config.floats.map((f) => {
        const x = clampNum(f.x ?? 0, 0, 100, 0);
        const y = clampNum(f.y ?? 0, 0, 100, 0);
        const floatStyle: CSSProperties = {
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          zIndex: 10,
        };
        if (f.type === 'image') {
          const cfg = f.config as ImageBlockConfig;
          floatStyle.width = `${clampNum(cfg.widthPct, 10, 100, 50)}%`;
        }
        return (
          <div key={f.id} style={floatStyle}>
            {renderBlock(f, true)}
          </div>
        );
      })}
    </div>
  );
}
