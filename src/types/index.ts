// ========== 导入与解析 ==========

/** 单元格原始值（SheetJS sheet_to_json 稠密模式产物归一化） */
export type CellRaw = string | number | boolean | Date | null;

/** 解析后的原始表 */
export interface RawTable {
  /** 当前选中的 sheet 名 */
  sheetName: string;
  /** 全部 sheet 概览（供多 Sheet 选择页使用，R1-03） */
  sheets: { name: string; rows: number; cols: number }[];
  /** 表头所在行下标（0-based，用户可改，R1-04） */
  headerRowIndex: number;
  /** 原始单元格二维数组（保留原始文本，未清洗） */
  cells: CellRaw[][];
  /** 列元信息（随 headerRowIndex / 排除规则变化而重算） */
  columns: ColumnMeta[];
  /** 解析来源，用于错误提示与重解析策略 */
  source: 'xlsx' | 'xls' | 'csv' | 'tsv';
  /** 文件名（仅用于展示与导出默认名参考，不含数据） */
  fileName: string;
}

/** 列元信息 */
export interface ColumnMeta {
  /** 内部稳定 key，等于原始列名字符串（同名后列加序号后缀 #2） */
  key: string;
  /** 原始列名 */
  rawName: string;
  /** 推断类型 */
  type: ColumnType;
  /** 推断置信度 0~1，<0.7 时 UI 标「疑似」（R1-06） */
  typeConfidence: number;
  /** 脏数据单元格数（parseCell 抛错/回退的个数） */
  dirtyCount: number;
  /** 缺失（空 / - / — / N/A）单元格数 */
  missingCount: number;
  /** 单位推断：'个'|'元'|'%'|'万'|'' …，用户可改（R2-02） */
  unitHint: string;
}

export type ColumnType = 'number' | 'percent' | 'date' | 'text';

// ========== 字段角色与排行配置 ==========

export type RankColumnRole =
  | 'ignore'      // 不参与
  | 'metric'      // 指标
  | 'dimension'   // 维度（分组聚合用）
  | 'name'        // 名称
  | 'secondary'   // 次要字段（0~2 个）
  | 'prevValue';  // 上期值（环比，P1）

export type RankMode = 'direct' | 'grouped';
export type AggMethod = 'sum' | 'avg' | 'count' | 'countDistinct' | 'max' | 'min';
export type SortDirection = 'desc' | 'asc';
/** 并列策略：competition=同值同名次(2,2,4)；ordinal=严格顺序(2,3,4)；secondary=次要列打破 */
export type TieStrategy = 'competition' | 'ordinal' | 'secondary';
/** v1 展示模式（已废弃，仅保留类型供 v1→v2 迁移使用） */
export type DisplayMode = 'long' | 'twoColumn' | 'paged';
export type ThemeId = 'businessBlue' | 'festiveRed' | 'darkGold' | 'cleanWhite';

// ========== 海报区块（v2 区块化版式） ==========

/** 区块类型：文本 / 图片 / 榜单列表 / 分隔线 */
export type BlockType = 'text' | 'image' | 'rankList' | 'divider';

/** 文本角色：决定默认字号倍数与跟随的主题色 */
export type TextRole = 'title' | 'subtitle' | 'body' | 'note' | 'signature';

/** 榜单变体：长图 / 双列 / 分页 / 表格 */
export type RankListVariant = 'long' | 'twoColumn' | 'paged' | 'table';

/** 榜单行样式：卡片（现状）/ 极简行（无底色 + 细分隔线 + 彩色名次数字） */
export type RowStyle = 'card' | 'minimal';

/** 名次徽章形状：圆 / 胶囊 / 方块 / 纯数字（无底色） */
export type BadgeShape = 'circle' | 'pill' | 'square' | 'plain';

/** 第 1 名图标：auto=跟随全局 showMedal；或强制皇冠/奖牌/奖杯；none=从不显示 */
export type Top1Icon = 'auto' | 'crown' | 'medal' | 'trophy' | 'none';

/** 表格变体列 id：'secondary' 展开为每个次要字段一列 */
export type TableColId = 'rank' | 'name' | 'secondary' | 'value';

/** 表格列对齐 */
export type TableColAlign = 'left' | 'center' | 'right';

export type BlockAlign = 'left' | 'center' | 'right';

export interface TextBlockConfig {
  content: string;
  /** 预设角色：决定默认字号/颜色的乘数基准，用户可再覆盖 fontSizeScale */
  role: TextRole;
  /** 相对基准字号倍数，默认按 role 给 1.8/1.0/0.95/0.8/0.8 */
  fontSizeScale: number;
  bold: boolean;
  align: BlockAlign;
  /** 'theme' = 跟随主题对应角色色，'custom' = 用 customColor */
  colorMode: 'theme' | 'custom';
  customColor: string;
}

export interface ImageBlockConfig {
  /** dataURL（已压缩，复用背景图压缩逻辑 utils/image.ts），null = 未上传 */
  src: string | null;
  /** 相对海报宽度 10~100 */
  widthPct: number;
  align: BlockAlign;
  borderRadius: number;
}

export interface RankListBlockConfig {
  variant: RankListVariant;
  /** paged 变体每页条数 */
  pageSize: number;
  /** 行样式：card=卡片（现状）/ minimal=极简行（细分隔线 + 彩色名次数字），表格变体忽略 */
  rowStyle: RowStyle;
  /** 名次徽章形状（仅 card/minimal 行样式生效） */
  badgeShape: BadgeShape;
  /** 第 1 名图标：'auto' 跟随全局 config.showMedal */
  top1Icon: Top1Icon;
  /** 进度条（表格变体忽略） */
  progressBar: {
    show: boolean;
    /** 'accent'=主题主色；'tier'=Top3 行用金银铜，其余行主题主色 */
    color: 'accent' | 'tier';
  };
  /** 表格变体专属配置（仅 variant==='table' 时生效） */
  table: {
    /** 顺序即渲染顺序；不含=不显示；'secondary' 只出现一次 */
    columns: TableColId[];
    /** 'auto'=现状自适应；'custom'=按 colWeights 归一化为百分比列宽 */
    colWidthMode: 'auto' | 'custom';
    /** 每列权重 1~10，仅 colWidthMode==='custom' 时用；缺省按 1 计 */
    colWeights: Partial<Record<TableColId, number>>;
    /** 每列对齐；缺省 rank:center / name:left / secondary:left / value:right */
    aligns: Partial<Record<TableColId, TableColAlign>>;
    header: {
      show: boolean;
      bold: boolean;
      /** 'theme'=主题底色（现状）；'none'=透明 */
      bg: 'theme' | 'none';
    };
  };
}

export interface DividerBlockConfig {
  colorMode: 'theme' | 'custom';
  customColor: string;
  /** 1~8 px */
  thickness: number;
  /** 上下留白 px */
  marginY: number;
}

/** 区块配置联合类型 */
export type BlockConfig =
  | TextBlockConfig
  | ImageBlockConfig
  | RankListBlockConfig
  | DividerBlockConfig;

/**
 * 海报区块。流式区块放 config.blocks（从上到下堆叠），悬浮元素放 config.floats
 * （绝对定位渲染在流式内容之上）——由所在数组决定，不设 floating 布尔字段。
 */
export interface PosterBlock {
  /** 随机 id（newBlockId() 生成） */
  id: string;
  type: BlockType;
  config: BlockConfig;
  /** 悬浮层坐标（仅 floats 数组中的元素生效）：相对海报宽高的百分比 0~100，左上角为原点 */
  x?: number;
  y?: number;
}

/** 榜单模板 JSON 的完整 schema（v2 区块化版式，含 P0+P1 全部配置项） */
export interface RankConfig {
  /** schema 版本，v2 = 区块化版式 */
  version: 2;

  /** 流式区块（有序，从上到下渲染） */
  blocks: PosterBlock[];
  /** 悬浮层元素（绝对定位渲染在流式区块之上；百分比坐标 x/y 0~100，左上角为原点） */
  floats: PosterBlock[];

  // ---- 排行规则（R2 系列）----
  mode: RankMode;
  metricKey: string;
  aggMethod: AggMethod;
  dimensionKey: string;
  sortDirection: SortDirection;
  tieStrategy: TieStrategy;
  /** 策略③的次要排序列 key（tieStrategy==='secondary' 时生效） */
  secondarySortKey: string;
  /** 展示人数 1~200 */
  topN: number;
  /** TopN 外合并为「其他」行（默认关） */
  showOthers: boolean;
  filters: {
    /** 组内最少样本数，默认 1 */
    minSamples: number;
    /** 指标最小值阈值，null=不启用 */
    minValue: number | null;
  };

  // ---- 数值格式化（R3-03）----
  numberFormat: {
    thousands: boolean;
    /** 'auto' 或固定 0~2 位小数 */
    decimals: number | 'auto';
    /** 'auto'=跟随列单位推断 */
    unit: 'none' | 'wan' | 'yi' | 'auto';
    /** 值本身是百分比时是否带 % 显示（不再 ÷100 后丢符号） */
    percent: boolean;
    /** 前缀符号，如 '¥'，默认 '' */
    prefix: string;
  };

  // ---- 字段映射（R3-04/05，R2-09）----
  nameKey: string;
  /** 0~2 个次要字段 key */
  secondaryKeys: string[];
  /** 上期值列 key，'' = 不启用环比 */
  prevValueKey: string;

  // ---- 视觉（R5 系列）----
  themeId: ThemeId;
  /** 主色微调，'' = 跟随主题（R5-03） */
  accentColor: string;
  /** 背景图 dataURL（已压缩至长边 ≤2048），null = 纯主题底色 */
  backgroundImage: string | null;
  bgFill: 'cover' | 'stretch' | 'center';
  /** 遮罩透明度 0~1，默认 0.6 */
  overlayOpacity: number;
  /** 遮罩颜色，随深浅主题给默认值 */
  overlayColor: string;
  fontSize: 'small' | 'medium' | 'large';
  lineHeight: 'compact' | 'normal' | 'loose';
  /** 卡片圆角 0~24px */
  borderRadius: number;
  zebra: boolean;
  /** Top3 奖牌/皇冠 SVG 开关（R5-06） */
  showMedal: boolean;
  /** Top10 外灰度弱化开关（R5-05），默认开 */
  dimTop10Outside: boolean;

  // ---- 导出（R6 系列）----
  exportScale: 1 | 2 | 4;
  exportFileName: string;
  /** 仅导出首屏（P1，R6-03） */
  exportFirstScreenOnly: boolean;
}

// ========== 计算结果 ==========

/** 管线产出的榜单行 */
export interface RankRow {
  /** 名次数字（按并列策略显示的值） */
  rank: number;
  /** 展示序号（并列时仍连续，用于取档位/进度条等视觉用途从 1 开始） */
  displayRank: number;
  name: string;
  /** 次要字段文本（已格式化为字符串，0~2 项） */
  secondary: string[];
  /** 格式化后的展示值 */
  value: number;
  /** 清洗后的原始数值 */
  rawValue: number;
  /** 环比差值（本期-上期），未启用为 null */
  delta: number | null;
  /** 进度条比例 = rawValue / 榜首 rawValue，0~1 */
  ratio: number;
  /** 「其他」合并行标记（showOthers 时末行） */
  isOthers: boolean;
  /** 分组模式下的组内样本数（过滤提示用） */
  sampleCount: number;
}

/** 管线最终产物 */
export interface BoardResult {
  rows: RankRow[];
  /** 被过滤/截断的对象数（「已排除 N 项」/「其他 N 人」） */
  excludedCount: number;
  /** 有效对象总数（截断前） */
  totalCount: number;
  /** E3/E4/E5 等非阻断提示 */
  warnings: string[];
}

// ========== 主题 ==========

/** 名次样式档位：所有视觉差异收敛为 3 档（PRD §6 规则 4） */
export type RankTier = 'top3' | 'top10' | 'rest';

export interface TierStyle {
  /** 徽章背景（可为 linear-gradient 表达式） */
  badgeBg: string;
  /** 徽章文字色 */
  badgeText: string;
  /** 行卡片背景（可为渐变） */
  cardBg: string;
  /** 行卡片边框色，'transparent' 表示无边框 */
  cardBorder: string;
  /** 名称文字色 */
  textColor: string;
  /** 指标值文字色 */
  valueColor: string;
  /** 整行缩放：top3=1.0，徽章/数值单独放大由组件按档位乘系数（top3 徽章×1.2、数值×1.1） */
  valueScale: number;
}

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  /** 深色主题（决定遮罩默认色） */
  dark: boolean;
  /** 海报页面底色（可为渐变） */
  pageBg: string;
  /** 头部通栏色带背景（画布日报用；缺省 = 无色带） */
  headerBg?: string;
  /** 标题/副标题/正文/次要文字色 */
  titleColor: string;
  subtitleColor: string;
  textColor: string;
  secondaryColor: string;
  /** 默认主色（徽章/进度条） */
  accent: string;
  /** 金银铜（Top3 徽章与卡片渐变） */
  medalColors: { gold: string; silver: string; bronze: string };
  /** 三档样式 */
  tiers: Record<RankTier, TierStyle>;
  /** 基准字号 px：小/中/大（R5-04） */
  fontSizes: Record<'small' | 'medium' | 'large', number>;
  /** 行间距 px：紧凑/标准/宽松 */
  spacing: Record<'compact' | 'normal' | 'loose', number>;
}
