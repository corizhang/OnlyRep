import type { CSSProperties, ReactNode } from 'react';
import type {
  BadgeShape,
  RankConfig,
  RankListBlockConfig,
  RankRow,
  ThemeTokens,
  Top1Icon,
} from '../types';
import { tierOf } from '../themes/themes';
import { formatValue } from '../compute/format';

/** 奖牌 SVG（本地内联，无图标库依赖） */
function MedalIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2 L10 9 L14 9 L17 2" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="12" cy="15" r="6" fill={color} />
      <circle cx="12" cy="15" r="3" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

/** 皇冠 SVG（第 1 名） */
function CrownIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8 L7.5 12 L12 5 L16.5 12 L21 8 L19 19 H5 Z" fill={color} />
    </svg>
  );
}

/** 奖杯 SVG（第 1 名可选图标，P0 新增：杯体填充 + 双耳/杯脚/底座描边，风格与奖牌/皇冠一致） */
function TrophyIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 20.5 h8" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12 16.5 v4" stroke={color} strokeWidth="2" fill="none" />
      <path d="M7 3 h10 v5 a5 5 0 0 1 -10 0 Z" fill={color} />
      <path d="M7 4 H4 a3 3 0 0 0 3.2 4.2" stroke={color} strokeWidth="2" fill="none" />
      <path d="M17 4 h3 a3 3 0 0 1 -3.2 4.2" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}

/**
 * Top1 图标解析：返回实际渲染的图标种类，null = 只显示名次数字。
 * auto = 跟随全局 showMedal（第 1 名皇冠、2/3 名奖牌，现状逻辑）；
 * crown/medal/trophy = 强制该图标（displayRank 1~3 且非「其他」行）；
 * none = 从不显示。
 */
function resolveTopIcon(
  top1Icon: Top1Icon,
  row: RankRow,
  globalShowMedal: boolean,
): 'crown' | 'medal' | 'trophy' | null {
  if (top1Icon === 'none') return null;
  if (row.isOthers || row.displayRank < 1 || row.displayRank > 3) return null;
  if (top1Icon === 'auto') {
    if (!globalShowMedal) return null;
    return row.displayRank === 1 ? 'crown' : 'medal';
  }
  return top1Icon;
}

/** 十六进制色 → 低透明度 rgba（minimal 行分隔线用）；非 hex 输入原样返回（本身已带透明度） */
function lowAlphaColor(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

export interface RankRowCardProps {
  row: RankRow;
  /** 序号位置（斑马纹用，从 0 开始） */
  index: number;
  theme: ThemeTokens;
  config: RankConfig;
  /** 所在榜单块的私有样式配置（rowStyle/badgeShape/top1Icon/progressBar） */
  block: RankListBlockConfig;
  /** 指标列单位推断（formatValue 的 colUnit） */
  colUnit: string;
  /** 主色（config.accentColor || theme.accent） */
  accent: string;
  /** 是否为所在列表的最后一行（minimal 行样式末行不画分隔线） */
  isLast?: boolean;
}

/**
 * 单行条目（PRD §6 版式）：名次徽章 56px 区 ｜ 名称区自适应 ｜ 数值区右对齐 140px + 进度条。
 * 三档样式只经 tierOf() 取 ThemeTokens.tiers；全部 inline style（html-to-image 序列化要求）。
 * P0 行样式：card（现状卡片）/ minimal（极简行：无底色 + 细分隔线 + 彩色名次数字）。
 */
export default function RankRowCard({
  row,
  index,
  theme,
  config,
  block,
  colUnit,
  accent,
  isLast = false,
}: RankRowCardProps) {
  const tier = tierOf(row.displayRank);
  const t = theme.tiers[tier];
  const baseFont = theme.fontSizes[config.fontSize];
  const pad = theme.spacing[config.lineHeight];
  const dim =
    config.dimTop10Outside && tier === 'rest' && !row.isOthers
      ? 'grayscale(1)'
      : undefined;

  // Top3 徽章用金银铜（按展示名次取色），4 名起用主题徽章样式
  const medalColor =
    row.displayRank === 1
      ? theme.medalColors.gold
      : row.displayRank === 2
        ? theme.medalColors.silver
        : theme.medalColors.bronze;
  const useMedalBg = tier === 'top3' && !row.isOthers;

  // ---- 行样式：minimal 强制无徽章底（纯数字名次）；card 跟随 badgeShape 配置 ----
  const isMinimal = block.rowStyle === 'minimal';
  const badgeShape: BadgeShape = isMinimal ? 'plain' : block.badgeShape;
  const hasBadgeBg = badgeShape !== 'plain';
  const badgeSize = useMedalBg ? 46 : 38;
  const badgeWidth = badgeShape === 'pill' ? Math.round(badgeSize * 1.5) : badgeSize;
  const badgeRadius =
    badgeShape === 'circle'
      ? '50%'
      : badgeShape === 'pill'
        ? 9999
        : badgeShape === 'square'
          ? 6
          : 0;

  // 纯数字名次（plain / minimal）：Top3 金银铜加粗，其余用主题次要色
  const top3Number = useMedalBg;
  const rankNumberColor = top3Number ? medalColor : theme.secondaryColor;

  const icon = resolveTopIcon(block.top1Icon, row, config.showMedal);
  const showIcon = icon !== null;
  // 图标颜色：徽章带金银铜底时用深色，否则直接用金银铜色（与现状一致）
  const iconColor = hasBadgeBg && useMedalBg ? '#3A2A00' : medalColor;

  // ---- 行容器：card 保持现状视觉；minimal 无底色/边框/圆角，行间 1px 细分隔线 ----
  const cardStyle: CSSProperties = isMinimal
    ? {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${pad}px 4px`,
        background: 'transparent',
        border: 'none',
        borderBottom: isLast
          ? 'none'
          : `1px solid ${lowAlphaColor(theme.secondaryColor, 0.25)}`,
        borderRadius: 0,
        color: t.textColor,
      }
    : {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${pad}px 14px`,
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: config.borderRadius,
        color: t.textColor,
      };
  if (!isMinimal && config.zebra && index % 2 === 1) {
    cardStyle.backgroundColor = theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
  }

  const valueStr = formatValue(row.value, config.numberFormat, colUnit);

  // 环比箭头：升序榜语义反转——值变小（delta<0）为好 = ↑绿（R2-09）
  let deltaNode: ReactNode = null;
  if (row.delta !== null && row.delta !== 0) {
    const good = config.sortDirection === 'desc' ? row.delta > 0 : row.delta < 0;
    const deltaStr = formatValue(
      Math.abs(row.delta),
      { ...config.numberFormat, unit: 'none' },
      '',
    );
    deltaNode = (
      <span
        style={{
          color: good ? '#22C55E' : '#EF4444',
          fontSize: baseFont * 0.85,
          marginLeft: 4,
        }}
      >
        {good ? '↑' : '↓'}
        {deltaStr}
      </span>
    );
  }

  // 进度条填充色：'tier' = Top3 行用对应金银铜，其余行（及 accent 模式）用主题主色
  const progressColor =
    block.progressBar.color === 'tier' && useMedalBg ? medalColor : accent;

  const iconNode = (size: number): ReactNode => {
    if (icon === 'crown') return <CrownIcon color={iconColor} size={size} />;
    if (icon === 'trophy') return <TrophyIcon color={iconColor} size={size} />;
    return <MedalIcon color={iconColor} size={size} />;
  };

  return (
    <div style={cardStyle}>
      {/* 名次区 */}
      <div style={{ width: 56, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {hasBadgeBg ? (
          <div
            style={{
              width: badgeWidth,
              height: badgeSize,
              borderRadius: badgeRadius,
              background: useMedalBg ? medalColor : t.badgeBg,
              color: useMedalBg ? '#3A2A00' : t.badgeText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: baseFont * (useMedalBg ? 1.2 : 1),
              filter: dim,
              flexShrink: 0,
            }}
          >
            {showIcon ? iconNode(badgeSize * 0.5) : row.rank}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: rankNumberColor,
              fontWeight: 700,
              fontSize: baseFont * (top3Number ? 1.2 : 1),
              filter: dim,
              flexShrink: 0,
            }}
          >
            {showIcon ? iconNode(badgeSize * 0.5) : row.rank}
          </div>
        )}
      </div>

      {/* 名称区 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: baseFont,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={row.name}
        >
          {row.name}
        </div>
        {row.secondary.map((s, i) => (
          <div
            key={i}
            style={{
              fontSize: baseFont * 0.78,
              color: theme.secondaryColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {s}
          </div>
        ))}
        {row.isOthers && (
          <div style={{ fontSize: baseFont * 0.78, color: theme.secondaryColor }}>
            未上榜合计
          </div>
        )}
      </div>

      {/* 数值区 */}
      <div style={{ width: 140, flexShrink: 0, textAlign: 'right' }}>
        <div
          style={{
            color: t.valueColor,
            fontWeight: 700,
            fontSize: baseFont * 1.1 * t.valueScale,
            fontVariantNumeric: 'tabular-nums',
            filter: dim,
            whiteSpace: 'nowrap',
          }}
        >
          {valueStr}
          {deltaNode}
        </div>
        {block.progressBar.show && (
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
              marginTop: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, row.ratio * 100))}%`,
                background: progressColor,
                borderRadius: 2,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
