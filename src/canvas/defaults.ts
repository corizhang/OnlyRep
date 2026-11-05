import type {
  CanvasBlock,
  CanvasConfig,
  CanvasBlockType,
  DataTableConfig,
  ChartConfig,
  GoalProgressConfig,
  KpiCardConfig,
  NumberFormat,
  PipelineNode,
  RankBlockConfig,
} from './types';

/**
 * 画布默认配置与内置模板（ARCH §2 defaults.ts）。
 * 内置「快捷支付活动日报」模板即 PRD 场景 1 的可运行版本：
 * 三个导入源 + 一个口径表单源，换数据即可出图。
 */

let blockSeq = 0;

export function newBlockId(): string {
  blockSeq += 1;
  return `cb_${Date.now().toString(36)}_${blockSeq.toString(36)}`;
}

export function defaultNumberFormat(over: Partial<NumberFormat> = {}): NumberFormat {
  return {
    thousands: true,
    decimals: 'auto',
    unit: 'none',
    percent: false,
    prefix: '',
    suffix: '',
    ...over,
  };
}

// ========== 区块工厂 ==========

export function createBlock(type: CanvasBlockType): CanvasBlock {
  const id = newBlockId();
  switch (type) {
    case 'text':
      return {
        id,
        type,
        config: {
          content: '双击右侧编辑文本，支持 {{表达式}} 插入数值',
          role: 'body',
          fontSizeScale: 1,
          bold: false,
          align: 'left',
          colorMode: 'theme',
          customColor: '',
        },
      };
    case 'image':
      return { id, type, config: { src: null, widthPct: 60, align: 'center', borderRadius: 8 } };
    case 'divider':
      return { id, type, config: { colorMode: 'theme', customColor: '', thickness: 2, marginY: 12 } };
    case 'kpiCard':
      return {
        id,
        type,
        config: {
          label: '指标名称',
          value: { kind: 'none' },
          unit: '户',
          format: defaultNumberFormat(),
          note: '',
          noteTone: 'secondary',
          customNoteColor: '',
          accent: '',
          cardBg: '',
        },
      };
    case 'goalProgress':
      return {
        id,
        type,
        config: {
          label: '全年目标完成率',
          ratio: { kind: 'none' },
          decimals: 1,
          barColor: '',
          trackColor: '',
          panelBg: '',
          pctColor: '',
          metaLeft: '',
          metaRight: '',
          showPct: true,
        },
      };
    case 'chart':
      return {
        id,
        type,
        config: {
          title: '图表标题',
          chartType: 'bar',
          table: { nodeRef: '' },
          dimension: '',
          metrics: [],
          sortBy: 'dimension',
          sort: 'asc',
          maxRows: 0,
          showValueLabel: true,
          highlightLast: false,
          horizontal: false,
          height: 240,
          showLegend: false,
          showGrid: true,
          yUnit: '',
        },
      };
    case 'dataTable':
      return {
        id,
        type,
        config: {
          title: '',
          table: { nodeRef: '' },
          columns: [],
          zebra: true,
          showHeader: true,
          headerBold: true,
          totalRow: false,
          totalLabel: '合计',
          highlightRules: [],
          maxRows: 0,
          fontSizeScale: 1,
          showIndex: false,
          cardBg: '',
        },
      };
    case 'rankList':
      return {
        id,
        type,
        config: {
          table: { nodeRef: '' },
          nameCol: '',
          metricCol: '',
          groupCol: '',
          aggMethod: 'sum',
          sortDir: 'desc',
          topN: 10,
          variant: 'long',
          showProgress: true,
          format: defaultNumberFormat(),
          accent: '',
        },
      };
    case 'row':
      return {
        id,
        type,
        config: {
          widths: [50, 50],
          align: 'stretch',
          children: [createBlock('kpiCard'), createBlock('kpiCard')],
        },
      };
  }
}

/** 空白画布 */
export function createDefaultCanvasConfig(): CanvasConfig {
  return {
    version: 3,
    title: '未命名日报',
    width: 900,
    themeId: 'businessBlue',
    accentColor: '',
    baseFontSize: 15,
    riseColor: '#FF6B6B',
    fallColor: '#34D399',
    padding: 32,
    gap: 14,
    pageBg: '',
    dataSources: [],
    pipeline: { nodes: [] },
    blocks: [
      {
        id: newBlockId(),
        type: 'text',
        config: {
          content: '未命名日报',
          role: 'title',
          fontSizeScale: 1.7,
          bold: true,
          align: 'left',
          colorMode: 'theme',
          customColor: '',
        },
      },
      {
        id: newBlockId(),
        type: 'text',
        config: {
          content: '左侧添加数据源 → 配置处理步骤 → 从组件库拖入组件 → 绑定数据 → 导出图片',
          role: 'note',
          fontSizeScale: 0.9,
          bold: false,
          align: 'left',
          colorMode: 'custom',
          customColor: 'rgba(255, 255, 255, 0.85)',
        },
      },
    ],
    exportScale: 2,
  };
}

// ========== 内置模板：快捷支付活动日报 ==========

function node(
  id: string,
  type: PipelineNode['type'],
  name: string,
  inputs: string[],
  params: Record<string, unknown>,
): PipelineNode {
  return { id, type, name, inputs, params, enabled: true };
}

function col(col: string, label: string, align: DataTableConfig['columns'][number]['align'], format: DataTableConfig['columns'][number]['format'] = 'number', extra: Partial<DataTableConfig['columns'][number]> = {}) {
  return { col, label, align, format, decimals: 'auto' as const, ...extra };
}

/**
 * 场景 1 模板：三张报表 + 口径参数。
 * 导入源文件名留空 → 用户点「选择文件」即可；绑定全部按列名，换次日文件不用改配置。
 */
export function createDailyReportPreset(): CanvasConfig {
  const nodes: PipelineNode[] = [
    // ---- 活动看板 ----
    node('n_board', 'source', '活动看板', [], { sourceId: 'ds_board' }),
    node('n_board_latest', 'pickRows', '取最新日期', ['n_board'], { mode: 'latestDate', dateCol: '数据日期' }),
    node('n_kpi_today', 'scalarOut', '当日新增绑卡', ['n_board_latest'], { col: '全量当日新增', method: 'sum' }),
    node('n_kpi_target', 'scalarOut', '目标客户新增', ['n_board_latest'], { col: '当日新增', method: 'sum' }),
    node('n_kpi_total', 'scalarOut', '累计绑卡', ['n_board_latest'], { col: '累计绑卡', method: 'max' }),
    node('n_board_trend', 'sortTopN', '近9日', ['n_board'], { col: '数据日期', dir: 'desc', n: 9, asDate: true }),
    // ---- 推送汇总 ----
    node('n_push', 'source', '推送汇总', [], { sourceId: 'ds_push' }),
    node('n_push_wx', 'filter', '企微批次', ['n_push'], { col: '渠道', op: 'contains', value: '企微' }),
    node('n_push_mp', 'filter', '公众号批次', ['n_push'], { col: '渠道', op: 'contains', value: '公众号' }),
    // ---- 转介统计 ----
    node('n_branch', 'source', '转介统计', [], { sourceId: 'ds_branch' }),
    node('n_branch_latest', 'pickRows', '取最新日期', ['n_branch'], { mode: 'latestDate', dateCol: '数据日期' }),
    node('n_branch_sort', 'sortTopN', '按员工数排序', ['n_branch_latest'], { col: '员工数', dir: 'desc', n: 0 }),
    // ---- 口径参数与计算字段 ----
    node('n_params', 'source', '口径参数', [], { sourceId: 'ds_params' }),
    node('n_remain', 'formula', '剩余户数', [], { expr: '全年目标-已完成' }),
    node('n_rate', 'formula', '完成率', [], { expr: '已完成/全年目标' }),
    node('n_days', 'formula', '剩余天数', [], { expr: 'DAYS(截止日期,TODAY())+1' }),
    node('n_perday', 'formula', '每日需新增', [], { expr: 'CEILING(剩余户数/剩余天数)' }),
  ];

  const blocks: CanvasBlock[] = [
    {
      id: 'b_title',
      type: 'text',
      config: {
        content: '快捷支付活动日报',
        role: 'title',
        fontSizeScale: 1.75,
        bold: true,
        align: 'left',
        colorMode: 'theme',
        customColor: '',
      },
    },
    {
      id: 'b_sub',
      type: 'text',
      config: {
        content: '数据日期：{{TODAY()}}　｜　分行展码数据截至前一日（T+2）',
        role: 'note',
        fontSizeScale: 0.85,
        bold: false,
        align: 'left',
        colorMode: 'custom',
        customColor: 'rgba(255, 255, 255, 0.85)',
      },
    },
    {
      id: 'b_goal',
      type: 'goalProgress',
      config: {
        label: '全年绑卡目标完成率',
        ratio: { kind: 'node', nodeRef: 'n_rate' },
        decimals: 1,
        barColor: '',
        trackColor: '',
        panelBg: '',
        pctColor: '',
        metaLeft: '已完成 {{已完成|num}} 户　｜　全年目标 {{全年目标|num}} 户　｜　剩余 {{剩余户数|num}} 户',
        metaRight: '剩余 {{剩余天数}} 天　｜　预计每日需新增 {{每日需新增|num}} 户',
        showPct: true,
      },
    },
    {
      id: 'b_sec1',
      type: 'text',
      config: {
        content: '一、当日绑卡概况',
        role: 'subtitle',
        fontSizeScale: 1.05,
        bold: true,
        align: 'left',
        colorMode: 'theme',
        customColor: '',
      },
    },
    {
      id: 'b_kpi_row',
      type: 'row',
      config: {
        widths: [34, 33, 33],
        align: 'stretch',
        children: [
          {
            id: 'b_kpi1',
            type: 'kpiCard',
            config: {
              label: '当日新增绑卡',
              value: { kind: 'node', nodeRef: 'n_kpi_today' },
              unit: '户',
              format: defaultNumberFormat(),
              note: "较9月末日均（{{基期日均|num}} 户）{{IF(当日新增绑卡>=基期日均,'提升','下降')}} {{ROUND(ABS(当日新增绑卡/基期日均-1)*100,1)}}%",
              noteTone: 'rise',
              customNoteColor: '',
              accent: '',
              cardBg: '',
            },
          },
          {
            id: 'b_kpi2',
            type: 'kpiCard',
            config: {
              label: '目标客户新增',
              value: { kind: 'node', nodeRef: 'n_kpi_target' },
              unit: '户',
              format: defaultNumberFormat(),
              note: '活动定向邀约客群贡献',
              noteTone: 'secondary',
              customNoteColor: '',
              accent: '',
              cardBg: '',
            },
          },
          {
            id: 'b_kpi3',
            type: 'kpiCard',
            config: {
              label: '累计绑卡',
              value: { kind: 'node', nodeRef: 'n_kpi_total' },
              unit: '户',
              format: defaultNumberFormat(),
              note: '活动期内累计完成绑卡',
              noteTone: 'secondary',
              customNoteColor: '',
              accent: '',
              cardBg: '',
            },
          },
        ],
      },
    },
    {
      id: 'b_trend',
      type: 'chart',
      config: {
        title: '',
        chartType: 'bar',
        table: { nodeRef: 'n_board_trend' },
        dimension: '数据日期',
        metrics: [{ col: '全量当日新增', label: '当日新增绑卡', color: '' }],
        sortBy: 'dimension',
        sort: 'asc',
        maxRows: 0,
        showValueLabel: true,
        highlightLast: true,
        horizontal: true,
        height: 230,
        showLegend: false,
        showGrid: false,
        yUnit: '户',
      },
    },
    {
      id: 'b_sec2',
      type: 'text',
      config: {
        content: '二、推送批次转化',
        role: 'subtitle',
        fontSizeScale: 1.05,
        bold: true,
        align: 'left',
        colorMode: 'theme',
        customColor: '',
      },
    },
    {
      id: 'b_push_row',
      type: 'row',
      config: {
        widths: [50, 50],
        align: 'stretch',
        children: [
          {
            id: 'b_tbl_wx',
            type: 'dataTable',
            config: {
              title: '企微特邀 · 5元立减金',
              table: { nodeRef: 'n_push_wx' },
              columns: [
                col('数据日期', '投放日期', 'left', 'text'),
                col('总人数', '投放人数', 'right'),
                col('达标人数', '达标人数', 'right'),
                col('达标人数', '转化率', 'right', 'ratio', { ratioNum: '达标人数', ratioDen: '总人数' }),
              ],
              zebra: true,
              showHeader: true,
              headerBold: true,
              totalRow: true,
              totalLabel: '合计',
              highlightRules: [],
              maxRows: 0,
              fontSizeScale: 0.92,
              showIndex: false,
              cardBg: '',
            },
          },
          {
            id: 'b_tbl_mp',
            type: 'dataTable',
            config: {
              title: '公众号推送',
              table: { nodeRef: 'n_push_mp' },
              columns: [
                col('数据日期', '投放日期', 'left', 'text'),
                col('总人数', '投放人数', 'right'),
                col('达标人数', '达标人数', 'right'),
                col('达标人数', '转化率', 'right', 'ratio', { ratioNum: '达标人数', ratioDen: '总人数' }),
              ],
              zebra: true,
              showHeader: true,
              headerBold: true,
              totalRow: true,
              totalLabel: '合计',
              highlightRules: [],
              maxRows: 0,
              fontSizeScale: 0.92,
              showIndex: false,
              cardBg: '',
            },
          },
        ],
      },
    },
    {
      id: 'b_sec3',
      type: 'text',
      config: {
        content: '三、分行展码营销情况通报',
        role: 'subtitle',
        fontSizeScale: 1.05,
        bold: true,
        align: 'left',
        colorMode: 'theme',
        customColor: '',
      },
    },
    {
      id: 'b_branch',
      type: 'dataTable',
      config: {
        title: '',
        table: { nodeRef: 'n_branch_sort' },
        columns: [
          col('分行', '分行', 'left', 'text'),
          col('员工数', '员工数', 'right'),
          col('m1人数', 'M1人数', 'right'),
          col('扫码人数', '扫码人数', 'right'),
          col('扫码-绑卡人数', '扫码-绑卡', 'right'),
          col('达标人数', '达标人数', 'right'),
        ],
        zebra: true,
        showHeader: true,
        headerBold: true,
        totalRow: true,
        totalLabel: '合计',
        highlightRules: [{ col: '扫码人数', op: '>', value: 0, color: '#F59E0B' }],
        maxRows: 0,
        fontSizeScale: 0.95,
        showIndex: false,
        cardBg: '',
      },
    },
    {
      id: 'b_note',
      type: 'text',
      config: {
        content:
          '口径说明：① 目标客户为活动定向邀约客群；② 推送表中「达标人数」即完成绑卡人数，转化率 = 达标人数 ÷ 投放人数；③ 9 月末日均新增绑卡基数为 {{基期日均|num}} 户；④ 分行展码数据时效 T+2。',
        role: 'note',
        fontSizeScale: 0.8,
        bold: false,
        align: 'left',
        colorMode: 'theme',
        customColor: '',
      },
    },
  ];

  return {
    version: 3,
    title: '快捷支付活动日报',
    width: 900,
    themeId: 'businessBlue',
    accentColor: '',
    baseFontSize: 15,
    riseColor: '#FF6B6B',
    fallColor: '#34D399',
    padding: 32,
    gap: 14,
    pageBg: '',
    dataSources: [
      { id: 'ds_board', name: '活动看板', kind: 'import', fileName: '', sheetName: '' },
      { id: 'ds_push', name: '推送汇总', kind: 'import', fileName: '', sheetName: '' },
      { id: 'ds_branch', name: '转介统计', kind: 'import', fileName: '', sheetName: '' },
      {
        id: 'ds_params',
        name: '口径参数',
        kind: 'form',
        entries: [
          { key: '全年目标', value: '420000' },
          { key: '已完成', value: '317343' },
          { key: '截止日期', value: '2026-12-31' },
          { key: '基期日均', value: '1067' },
        ],
      },
    ],
    pipeline: { nodes },
    blocks,
    exportScale: 2,
  };
}

export interface CanvasPreset {
  id: string;
  name: string;
  desc: string;
  create: () => CanvasConfig;
}

/**
 * 示例数据模板：与「快捷支付活动日报」同一套区块/绑定，但数据用手填表格内置，
 * 打开就能看到完整效果（无需先准备文件），也方便快速改造成自己的模板。
 */
export function createDemoCanvasConfig(): CanvasConfig {
  const base = createDailyReportPreset();
  const boardRows = [
    ['2026-10-22', '978', '2048', '562'],
    ['2026-10-23', '1008', '3026', '604'],
    ['2026-10-24', '846', '4034', '512'],
    ['2026-10-25', '764', '4880', '449'],
    ['2026-10-26', '1108', '5644', '687'],
    ['2026-10-27', '1127', '6752', '742'],
    ['2026-10-28', '1045', '7879', '574'],
    ['2026-10-29', '1204', '9083', '657'],
  ];
  const pushRows = [
    ['20261021', '公众号-快捷支付特邀推送', '公众号', '15009', '428'],
    ['20261023', '企微-快捷支付特邀推送', '企微', '11221', '161'],
    ['20261027', '企微-快捷支付特邀推送', '企微', '24296', '133'],
    ['20261027', '公众号-快捷支付特邀推送', '公众号', '10936', '116'],
  ];
  const branchRows = [
    ['20261028', '沈阳分行', '2337', '1', '1', '0', '0'],
    ['20261028', '长春分行', '315', '1', '3', '0', '1'],
    ['20261028', '鞍山分行', '205', '1', '2', '0', '1'],
    ['20261028', '抚顺分行', '131', '1', '2', '2', '2'],
    ['20261028', '阜新分行', '120', '0', '0', '0', '0'],
  ];

  return {
    ...base,
    title: '快捷支付活动日报（示例）',
    dataSources: base.dataSources.map((d) => {
      if (d.id === 'ds_board') {
        return { id: d.id, name: d.name, kind: 'manualTable' as const, columns: ['数据日期', '全量当日新增', '累计绑卡', '当日新增'], rows: boardRows };
      }
      if (d.id === 'ds_push') {
        return { id: d.id, name: d.name, kind: 'manualTable' as const, columns: ['数据日期', '客群名称', '渠道', '总人数', '达标人数'], rows: pushRows };
      }
      if (d.id === 'ds_branch') {
        return {
          id: d.id,
          name: d.name,
          kind: 'manualTable' as const,
          columns: ['数据日期', '分行', '员工数', 'm1人数', '扫码人数', '扫码-绑卡人数', '达标人数'],
          rows: branchRows,
        };
      }
      return d;
    }),
  };
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  {
    id: 'blank',
    name: '空白画布',
    desc: '从零开始搭一份日报',
    create: createDefaultCanvasConfig,
  },
  {
    id: 'daily-report',
    name: '快捷支付活动日报',
    desc: '三张报表导入源 + 口径参数 + 全年目标完成率模块（换数据即用）',
    create: createDailyReportPreset,
  },
  {
    id: 'demo',
    name: '示例：带数据的日报',
    desc: '内置示例数据，打开即可看到完整效果',
    create: createDemoCanvasConfig,
  },
];

/** 兜底：读取任意来源的区块配置（模板导入/旧持久化） */
export function blockConfigOf<T>(block: CanvasBlock): T {
  return block.config as unknown as T;
}

export type { ChartConfig, GoalProgressConfig, KpiCardConfig, RankBlockConfig };
