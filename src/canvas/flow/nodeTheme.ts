import type { CSSProperties } from 'react';

/**
 * 节点视图 UI 主题 token（语义化命名，组件只引用变量、不写死色值）。
 * 作用域：数据节点画布内部（FlowSheet 根节点注入 --nb-* CSS 变量），
 * 不影响整个 App 的浅色外壳；后续全 App 双主题可在此基础上扩展独立 token 组。
 *
 * dark  = 现有 ComfyUI 深色版（1:1 保持当前观感）
 * light = 浅灰卡 + 深灰头（中性 ComfyUI 浅色版）
 */

export type NodeTheme = 'dark' | 'light';

export interface NodeTokens {
  /** 节点卡片底色 */
  surface: string;
  /** 头部底色 */
  header: string;
  /** 头部与主体的分隔线 */
  headerLine: string;
  /** 头部文字 */
  headerText: string;
  /** 头部弱文字（N 入等元信息） */
  headerDim: string;
  /** 头部警告色（已停用标记） */
  headerWarn: string;
  /** 节点边框 */
  border: string;
  /** 内嵌控件底色（下拉/输入/按钮） */
  controlBg: string;
  controlBorder: string;
  controlHover: string;
  /** 正文文字 */
  text: string;
  /** 次要文字（标签、提示） */
  textDim: string;
  /** 最弱文字（占位、说明） */
  textFaint: string;
  /** 底部预览区底色 */
  previewBg: string;
  /** 预览表格底色 */
  previewTable: string;
  previewHeadLine: string;
  previewRowLine: string;
  previewBorder: string;
  /** 浮动工具条/浮层 */
  popSurface: string;
  popBorder: string;
  popText: string;
  /** 代码 chip 底（变量名标记） */
  chipBg: string;
  /** 手填网格卡片底（保持白底的自包含编辑器） */
  manualBg: string;
  /** 头部改名输入框底色 */
  inputBg: string;
  /** 连线 */
  edge: string;
  edgeBad: string;
  /** 状态色 */
  ok: string;
  err: string;
  warn: string;
}

const DARK: NodeTokens = {
  surface: '#232b38',
  header: '#151b26',
  headerLine: 'rgba(0,0,0,0.4)',
  headerText: '#f1f5f9',
  headerDim: '#94a3b8',
  headerWarn: 'rgba(251,191,36,0.9)',
  border: '#3a4557',
  controlBg: '#333d4e',
  controlBorder: '#46536a',
  controlHover: '#3d495c',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  textFaint: '#64748b',
  previewBg: '#1a212d',
  previewTable: '#222b39',
  previewHeadLine: '#313c4d',
  previewRowLine: '#2b3546',
  previewBorder: '#3b4757',
  popSurface: 'rgba(17,24,38,0.95)',
  popBorder: '#3b4757',
  popText: '#e2e8f0',
  chipBg: 'rgba(0,0,0,0.3)',
  manualBg: 'rgba(255,255,255,0.95)',
  inputBg: '#0d1219',
  edge: '#7c8ba1',
  edgeBad: '#f87171',
  ok: '#34d399',
  err: '#f87171',
  warn: 'rgba(251,191,36,0.9)',
};

const LIGHT: NodeTokens = {
  surface: '#f4f5f7',
  header: '#4b5563',
  headerLine: 'rgba(0,0,0,0.18)',
  headerText: '#f9fafb',
  headerDim: '#cbd5e1',
  headerWarn: '#fcd34d',
  border: '#d5dae1',
  controlBg: '#ffffff',
  controlBorder: '#cbd2da',
  controlHover: '#eef0f3',
  text: '#1f2937',
  textDim: '#6b7280',
  textFaint: '#9ca3af',
  previewBg: '#e7eaef',
  previewTable: '#ffffff',
  previewHeadLine: '#d5dae1',
  previewRowLine: '#e6e9ee',
  previewBorder: '#d5dae1',
  popSurface: 'rgba(255,255,255,0.96)',
  popBorder: '#d5dae1',
  popText: '#374151',
  chipBg: 'rgba(0,0,0,0.06)',
  manualBg: '#ffffff',
  inputBg: '#ffffff',
  edge: '#94a3b8',
  edgeBad: '#ef4444',
  ok: '#059669',
  err: '#dc2626',
  warn: '#b45309',
};

export const NODE_TOKENS: Record<NodeTheme, NodeTokens> = { dark: DARK, light: LIGHT };

/** 把 camelCase token 映射为 --nb-kebab CSS 变量名 */
const toVarName = (k: string): string => `--nb-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** 注入到 FlowSheet 根节点的 CSS 变量集合 */
export function nodeThemeVars(theme: NodeTheme): CSSProperties {
  const t = NODE_TOKENS[theme];
  const style: Record<string, string> = {};
  for (const [k, val] of Object.entries(t)) style[toVarName(k)] = val;
  return style as CSSProperties;
}
