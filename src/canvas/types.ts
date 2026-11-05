import type { CellRaw } from '../types';
import type { CleanedTable } from '../parser/clean';
import type { FormatOpts } from '../compute/format';

/**
 * 日报画布类型定义（config schema v3）。
 *
 * 铁律（ARCH R10）：
 * - 本文件为新增模块，禁止反向污染 src/types（排行榜既有类型一行不动）；
 * - 绑定只认「列名 + 行选择规则」，不存单元格坐标；
 * - 导入源数据/File 引用仅存运行时，绝不进入持久化。
 */

// ========== 标量 ==========

export type ScalarValue = number | string | boolean | null;

/** 标量命名空间：变量名 → 值（公式与文案模板的求值环境） */
export type NamedScalars = Record<string, ScalarValue>;

// ========== 数据源 ==========

export type DataSourceKind = 'import' | 'manualTable' | 'form' | 'constant';

interface DataSourceBase {
  id: string;
  /** 数据源名，同时作为公式环境里该源的命名空间前缀（见 registry） */
  name: string;
  kind: DataSourceKind;
}

/** 导入文件指纹（name+size+lastModified），用于缓存一致性校验 */
export interface FileFingerprint {
  name: string;
  size: number;
  lastModified: number;
}

/** 导入源：元信息与指纹落盘；解析结果默认缓存 IndexedDB（cacheData 可关），文件句柄可记忆 */
export interface ImportDataSource extends DataSourceBase {
  kind: 'import';
  /** 上次导入的文件名，仅用于提示；刷新后为空表示待重新导入 */
  fileName: string;
  /** 指定 sheet 名，'' = 首个 sheet */
  sheetName: string;
  /** 是否缓存解析快照到 IndexedDB（刷新自动恢复）；缺省 = true */
  cacheData?: boolean;
  /** 上次导入文件的指纹（落盘，仅用于展示/校验，不含文件内容） */
  fileMeta?: FileFingerprint;
}

/** 手填表格源：随模板落盘，单源 ≤200 行 */
export interface ManualTableDataSource extends DataSourceBase {
  kind: 'manualTable';
  columns: string[];
  /** 单元格原始值（数值/文本混合，清洗规则与导入源一致） */
  rows: CellRaw[][];
}

/** 表单单值源：逐项「名称 + 数值」，值统一按字符串存，解析时自动转数值 */
export interface FormDataSource extends DataSourceBase {
  kind: 'form';
  entries: { key: string; value: string }[];
}

/** 常量源：单值（数字或文本/日期字符串），变量名 = 源名 */
export interface ConstantDataSource extends DataSourceBase {
  kind: 'constant';
  value: string;
}

export type DataSource =
  | ImportDataSource
  | ManualTableDataSource
  | FormDataSource
  | ConstantDataSource;

/** 手填源行数硬上限（PRD R1-07 / E4） */
export const MANUAL_ROW_LIMIT = 200;

// ========== 管道（DAG） ==========

export type NodeType =
  | 'source'
  | 'filter'
  | 'pickRows'
  | 'derive'
  | 'sortTopN'
  | 'groupAgg'
  | 'scalarOut'
  | 'formula';

export type AggMethod = 'sum' | 'avg' | 'count' | 'countDistinct' | 'max' | 'min';

export interface PipelineNode {
  id: string;
  type: NodeType;
  /** 显示名；scalarOut/formula 节点的名称即公式环境变量名 */
  name: string;
  /** 上游节点 id（DAG 边），source 节点为空 */
  inputs: string[];
  params: Record<string, unknown>;
  /** 停用后下游拿不到输入（用默认值/失联态兜底） */
  enabled: boolean;
}

export interface PipelineGraph {
  nodes: PipelineNode[];
}

export type NodeOutput =
  | { kind: 'table'; table: CleanedTable }
  | { kind: 'scalar'; value: ScalarValue }
  /** 表单类源一次产出多个命名标量 */
  | { kind: 'scalars'; values: NamedScalars }
  | { kind: 'error'; message: string };

/** 管道运行结果（含诊断信息，供 UI 提示） */
export interface RunResult {
  outputs: Record<string, NodeOutput>;
  /** 全局标量环境（公式与文案模板可直接引用） */
  env: NamedScalars;
  errors: string[];
  /** 节点执行耗时（ms），性能自查用 */
  ms: number;
}

// ========== 绑定 ==========

export type FieldBinding =
  | { kind: 'none' }
  /** 引用某个标量节点/标量源 */
  | { kind: 'node'; nodeRef: string }
  /** 引用表单源里的某一项 */
  | { kind: 'form'; sourceRef: string; key: string }
  /** 引用常量源 */
  | { kind: 'constant'; sourceRef: string }
  /** 现场公式（可引用全部标量） */
  | { kind: 'formula'; expr: string };

export interface TableBinding {
  /** 表格型节点 id（source/filter/pickRows/derive/sortTopN/groupAgg） */
  nodeRef: string;
}

export type ResolvedField =
  | { kind: 'value'; value: ScalarValue }
  | { kind: 'missing'; reason: string }
  | { kind: 'error'; message: string };

// ========== 区块 ==========

export type CanvasBlockType =
  | 'text'
  | 'image'
  | 'divider'
  | 'kpiCard'
  | 'goalProgress'
  | 'chart'
  | 'dataTable'
  | 'rankList'
  | 'row';

/** 数字展示格式（复用排行榜 FormatOpts，另加后缀与小数控制） */
export interface NumberFormat extends FormatOpts {
  suffix: string;
}

export interface TextBlockConfig {
  content: string;
  role: 'title' | 'subtitle' | 'body' | 'note' | 'signature';
  fontSizeScale: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  colorMode: 'theme' | 'custom';
  customColor: string;
}

export interface ImageBlockConfig {
  src: string | null;
  widthPct: number;
  align: 'left' | 'center' | 'right';
  borderRadius: number;
}

export interface DividerBlockConfig {
  colorMode: 'theme' | 'custom';
  customColor: string;
  thickness: number;
  marginY: number;
}

export interface KpiCardConfig {
  label: string;
  value: FieldBinding;
  unit: string;
  format: NumberFormat;
  /** 注释行，支持 {{表达式}} 占位 */
  note: string;
  noteTone: 'secondary' | 'rise' | 'fall' | 'custom';
  customNoteColor: string;
  accent: string;
  cardBg: string;
}

export interface GoalProgressConfig {
  label: string;
  /** 完成率，约定 0~1（公式里用 已完成/目标 即天然 0~1） */
  ratio: FieldBinding;
  decimals: number;
  barColor: string;
  trackColor: string;
  panelBg: string;
  pctColor: string;
  metaLeft: string;
  metaRight: string;
  showPct: boolean;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'gauge';

export interface ChartMetric {
  col: string;
  label: string;
  color: string;
}

export interface ChartConfig {
  title: string;
  chartType: ChartType;
  table: TableBinding;
  dimension: string;
  metrics: ChartMetric[];
  /** 排序依据：维度（时间轴）或首个数值列（排行） */
  sortBy: 'dimension' | 'value';
  sort: 'none' | 'asc' | 'desc';
  /** 0 = 不截断；维度排序时取最近 N 行，数值排序时取 TopN */
  maxRows: number;
  showValueLabel: boolean;
  highlightLast: boolean;
  horizontal: boolean;
  height: number;
  showLegend: boolean;
  showGrid: boolean;
  yUnit: string;
}

export interface TableColumnConfig {
  col: string;
  label: string;
  align: 'left' | 'center' | 'right';
  /** text=原样；number=千分位；percent=×100 加 %；ratio=两列相除转百分比 */
  format: 'text' | 'number' | 'percent' | 'ratio';
  decimals: number | 'auto';
  /** format==='ratio' 时的分子/分母列 */
  ratioNum?: string;
  ratioDen?: string;
  /** 合计方式：auto=number求和/percent平均(配置了分子分母列则加权)/ratio重算；weighted=按分子÷分母列加权重算；none=留空 */
  totalAgg?: TotalAgg;
  /** 列宽 px，0 = 自适应 */
  width?: number;
}

/** 合计行聚合方式（weighted 仅用于 percent 列：分子合计÷分母合计加权重算） */
export type TotalAgg = 'auto' | 'sum' | 'avg' | 'max' | 'min' | 'weighted' | 'none';

export interface HighlightRule {
  col: string;
  op: '>' | '>=' | '<' | '<=' | '=' | '!=' | 'nonEmpty';
  value: number;
  color: string;
}

export interface DataTableConfig {
  title: string;
  table: TableBinding;
  columns: TableColumnConfig[];
  zebra: boolean;
  showHeader: boolean;
  headerBold: boolean;
  /** 合计行：数值列求和；含 ratio 列时按分子分母合计后重算 */
  totalRow: boolean;
  totalLabel: string;
  highlightRules: HighlightRule[];
  maxRows: number;
  fontSizeScale: number;
  showIndex: boolean;
  cardBg: string;
}

export type RankVariant = 'long' | 'twoColumn' | 'table';

export interface RankBlockConfig {
  table: TableBinding;
  nameCol: string;
  metricCol: string;
  /** 分组聚合（'' = 一行一对象直接排序） */
  groupCol: string;
  aggMethod: AggMethod;
  sortDir: 'desc' | 'asc';
  topN: number;
  variant: RankVariant;
  showProgress: boolean;
  format: NumberFormat;
  accent: string;
}

export interface RowBlockConfig {
  /** 与 children 等长，按比例分配宽度（1~3 个子块） */
  widths: number[];
  children: CanvasBlock[];
  align: 'stretch' | 'top';
}

/** 区块外壳通用设置（挂在块根级而非各 config，向后兼容：旧模板缺省即默认值） */
export interface BlockShellStyle {
  /** 外边距 [上,右,下,左] px；缺省 [0,0,0,0] */
  shellMargin?: [number, number, number, number];
  /** 外壳圆角 px（配合 overflow 裁切）；缺省 4 */
  radius?: number;
}

type CanvasBlockVariant =
  | { id: string; type: 'text'; config: TextBlockConfig }
  | { id: string; type: 'image'; config: ImageBlockConfig }
  | { id: string; type: 'divider'; config: DividerBlockConfig }
  | { id: string; type: 'kpiCard'; config: KpiCardConfig }
  | { id: string; type: 'goalProgress'; config: GoalProgressConfig }
  | { id: string; type: 'chart'; config: ChartConfig }
  | { id: string; type: 'dataTable'; config: DataTableConfig }
  | { id: string; type: 'rankList'; config: RankBlockConfig }
  | { id: string; type: 'row'; config: RowBlockConfig };

export type CanvasBlock = BlockShellStyle & CanvasBlockVariant;

export type AnyBlockConfig = CanvasBlock['config'];

// ========== 画布配置 ==========

export interface CanvasConfig {
  version: 3;
  title: string;
  /** 画布宽度 px（900/860/750/自定义） */
  width: number;
  themeId: 'businessBlue' | 'festiveRed' | 'darkGold' | 'cleanWhite';
  /** '' = 跟随主题主色 */
  accentColor: string;
  baseFontSize: number;
  /** 涨跌配色：默认涨红跌绿（国内习惯） */
  riseColor: string;
  fallColor: string;
  padding: number;
  gap: number;
  /** '' = 跟随主题底色 */
  pageBg: string;
  /** 头部通栏色带背景；''/缺省 = 跟随主题 headerBg */
  headerBg?: string;
  /** 头部色带高度 px；0 = 隐藏色带。缺省 110 */
  headerHeight?: number;
  dataSources: DataSource[];
  pipeline: PipelineGraph;
  blocks: CanvasBlock[];
  exportScale: 1 | 2 | 4;
  /**
   * 流程视图中节点的手动位置（节点 id → 坐标）。
   * 只影响「流程视图」的排布，不参与执行；未记录的节点走自动分层布局。
   */
  flowPos?: Record<string, { x: number; y: number }>;
}

// ========== 运行时状态（不落盘） ==========

export interface SourceRuntime {
  /** 已载入的清洗表（导入源解析后 / 手填源构建后） */
  table?: CleanedTable;
  /** 导入源文件引用（切换 sheet 重解析用；不持久化） */
  file?: File | null;
  /** 全部 sheet 概览 */
  sheets?: { name: string; rows: number; cols: number }[];
  /** 载入状态 */
  status: 'empty' | 'ready' | 'loading' | 'error';
  message?: string;
  /** 表格版本号（参与引擎指纹） */
  version: number;
  /** 本表来自缓存快照（刷新恢复），非本次会话导入 */
  fromCache?: boolean;
  /** 缓存快照时间（ms 时间戳） */
  cachedAt?: number;
  /** 已记忆文件句柄，可一键重新读取磁盘最新文件 */
  hasHandle?: boolean;
}
