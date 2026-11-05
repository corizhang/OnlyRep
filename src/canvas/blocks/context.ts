import type { ThemeTokens } from '../../types';
import type { ResolveContext } from '../binding/resolve';

/** 区块渲染上下文（主题 token + 绑定解析环境） */
export interface RenderCtx {
  theme: ThemeTokens;
  accent: string;
  baseFont: number;
  gap: number;
  resolve: ResolveContext;
  rise: string;
  fall: string;
  /**
   * 通用设置·圆角（块级，px）：组件自带卡片/面板的圆角应优先用它，
   * 与外壳裁切保持同一口径；undefined = 未设置（组件用各自默认值）
   */
  shellRadius?: number;
}

/** 数值展示：千分位，最多 2 位小数 */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

/** 百分比展示：入参 0~1 */
export function fmtPct(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

/** color + 透明度（仅处理 #rrggbb；其他格式原样返回） */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${m[1]}${a}`;
}
