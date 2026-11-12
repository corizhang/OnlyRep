import type { CleanedTable } from '../../parser/clean';
import { getRawText, getVal } from '../../parser/clean';
import type { ChartConfig, FunnelStage } from '../types';
import { formatShortDate, parseDateValue } from '../pipeline/dates';
import { numericOf, resolveField, type ResolveContext } from '../binding/resolve';

/**
 * 图表数据整理 + ECharts option 构建（ARCH D23）。
 * 主题 token → 图表色板/字号/网格；输出纯数据，便于单测。
 */

export interface ChartPalette {
  text: string;
  secondary: string;
  accent: string;
  grid: string;
  dark: boolean;
  bg: string;
}

export interface PreparedChart {
  categories: string[];
  series: { name: string; data: number[]; color: string }[];
}

export const CHART_FONT = "'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif";

/**
 * 漏斗逐层取数（scalars 模式）：把 FunnelStage 列表解析为 PreparedChart。
 * 数组顺序即漏斗顺序（用户自定义，不排序）；解析失败/失联的层级归入错误信息。
 */
export function prepareFunnelScalars(
  stages: FunnelStage[],
  resolve: ResolveContext,
): PreparedChart | { error: string } {
  if (stages.length === 0) return { error: '尚未添加漏斗层级（在右侧添加层级并绑定取数）' };
  const categories: string[] = [];
  const data: number[] = [];
  const problems: string[] = [];
  for (const st of stages) {
    categories.push(st.name || '未命名层级');
    const res = resolveField(st.value, resolve);
    const num = res.kind === 'value' ? numericOf(res) : null;
    if (num === null) problems.push(`「${st.name || '未命名层级'}」${res.kind === 'value' ? '不是数值' : res.kind === 'missing' ? '取数未就绪' : '取数失败'}`);
    data.push(num ?? 0);
  }
  if (problems.length > 0 && problems.length === stages.length) {
    return { error: `全部层级取数失败：${problems[0]}${stages.length > 1 ? ' 等' : ''}` };
  }
  return { categories, series: [{ name: '数值', data, color: '' }] };
}

/** 系列配色：主题主色打头，其余用与主题协调的固定色板 */
export function seriesColors(palette: ChartPalette): string[] {
  return palette.dark
    ? [palette.accent, '#F5C542', '#4ADE80', '#A78BFA', '#F472B6']
    : [palette.accent, '#D97706', '#059669', '#7C3AED', '#DB2777'];
}

export function prepareChartData(
  cfg: ChartConfig,
  table: CleanedTable,
  palette: ChartPalette,
): PreparedChart | { error: string } {
  if (!cfg.dimension) return { error: '未选择维度列' };
  const colKeys = new Set(table.columns.map((c) => c.key));
  if (!colKeys.has(cfg.dimension)) return { error: `列「${cfg.dimension}」不存在` };
  const metrics = cfg.metrics.filter((m) => colKeys.has(m.col));
  if (metrics.length === 0) return { error: '未选择数值列' };

  type Item = { label: string; values: number[]; dim: number | null; rawDim: string };
  let items: Item[] = table.rows.map((r) => ({
    label: formatShortDate(getVal(r, cfg.dimension)),
    rawDim: getRawText(r, cfg.dimension) || String(getVal(r, cfg.dimension) ?? ''),
    dim: parseDateValue(getVal(r, cfg.dimension))?.getTime() ?? null,
    values: metrics.map((m) => {
      const v = getVal(r, m.col);
      return typeof v === 'number' ? v : 0;
    }),
  }));

  const isDateDim = items.every((i) => i.dim !== null);

  if (cfg.sort !== 'none') {
    if (cfg.sortBy === 'value') {
      const dir = cfg.sort === 'asc' ? 1 : -1;
      items.sort((a, b) => (a.values[0] - b.values[0]) * dir);
    } else if (isDateDim) {
      items.sort((a, b) => (a.dim! - b.dim!) * (cfg.sort === 'asc' ? 1 : -1));
    } else {
      items.sort(
        (a, b) => a.rawDim.localeCompare(b.rawDim, 'zh-Hans-CN', { numeric: true }) * (cfg.sort === 'asc' ? 1 : -1),
      );
    }
  }

  // 维度排序时 maxRows 表示「最近 N 期」：先升序取尾部，再按展示方向回正
  if (cfg.maxRows > 0 && cfg.sortBy === 'dimension' && cfg.sort !== 'none') {
    items.sort((a, b) => (isDateDim ? a.dim! - b.dim! : a.rawDim.localeCompare(b.rawDim, 'zh-Hans-CN', { numeric: true })));
    items = items.slice(-cfg.maxRows);
    if (cfg.sort === 'desc') items.reverse();
  } else if (cfg.maxRows > 0) {
    items = items.slice(0, cfg.maxRows);
  }

  const colors = seriesColors(palette);
  return {
    categories: items.map((i) => i.label),
    series: metrics.map((m, idx) => ({
      name: m.label || m.col,
      data: items.map((i) => i.values[idx]),
      color: m.color || colors[idx % colors.length],
    })),
  };
}

export interface BuildOptionArgs {
  cfg: ChartConfig;
  prepared: PreparedChart;
  palette: ChartPalette;
  fontSize: number;
}

/** 构建 ECharts option（animation 固定关闭，导出不会截到中间帧） */
export function buildChartOption({ cfg, prepared, palette, fontSize }: BuildOptionArgs): Record<string, unknown> {
  const base = {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: CHART_FONT, color: palette.secondary, fontSize },
    tooltip: { show: true, trigger: 'axis' as const, confine: true },
  };

  const axisLabel = { color: palette.secondary, fontSize: fontSize - 2 };
  const axisLine = { lineStyle: { color: palette.grid } };
  const splitLine = { show: cfg.showGrid, lineStyle: { color: palette.grid, type: 'dashed' as const } };
  const legend = {
    show: cfg.showLegend,
    top: 0,
    right: 0,
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { color: palette.secondary, fontSize: fontSize - 2 },
  };

  if (cfg.chartType === 'pie') {
    const s = prepared.series[0];
    return {
      ...base,
      tooltip: { show: true, trigger: 'item' as const, confine: true },
      legend: { ...legend, show: cfg.showLegend, bottom: 0, top: undefined },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '46%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: palette.bg, borderWidth: 2 },
          label: {
            show: cfg.showValueLabel,
            color: palette.secondary,
            fontSize: fontSize - 2,
            formatter: '{b} {d}%',
          },
          data: prepared.categories.map((c, i) => ({ name: c, value: s?.data[i] ?? 0 })),
          color: seriesColors(palette),
        },
      ],
    };
  }

  if (cfg.chartType === 'gauge') {
    const v = prepared.series[0]?.data[prepared.series[0].data.length - 1] ?? 0;
    const pct = Math.abs(v) <= 1.5 ? v * 100 : v;
    return {
      ...base,
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 100,
          radius: '92%',
          progress: { show: true, width: 10, itemStyle: { color: cfg.metrics[0]?.color || palette.accent } },
          axisLine: { lineStyle: { width: 10, color: [[1, palette.grid]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          detail: {
            valueAnimation: false,
            fontSize: fontSize + 12,
            offsetCenter: [0, '0%'],
            color: palette.text,
            formatter: '{value}%',
          },
          data: [{ value: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) }],
        },
      ],
    };
  }

  if (cfg.chartType === 'funnel') {
    const s = prepared.series[0];
    // 展示顺序：desc 数值降序（漏斗默认）/ asc 升序 / none 源顺序；
    // 在数据侧排好并令 echarts sort='none'，转化率才能与展示顺序严格对应
    const rows = prepared.categories.map((c, i) => ({ name: c, value: s?.data[i] ?? 0 }));
    const sorted =
      cfg.sort === 'none' ? rows : [...rows].sort((a, b) => (cfg.sort === 'asc' ? a.value - b.value : b.value - a.value));
    const top = sorted[0]?.value ?? 0;
    const pct = (v: number): string => {
      const r = Math.round(v * 10) / 10;
      return `${Number.isInteger(r) ? r.toFixed(0) : r}%`;
    };
    const fmtN = (v: number): string => v.toLocaleString('en-US');
    const data = sorted.map((v, i) => {
      const prev = i > 0 ? sorted[i - 1].value : 0;
      return {
        name: v.name,
        value: v.value,
        /** 占首层 %（首层自身恒 100） */
        ofFirst: top > 0 ? (v.value / top) * 100 : 0,
        /** 较上层转化率 %（首层为 null） */
        ofPrev: i > 0 && prev > 0 ? (v.value / prev) * 100 : null,
      };
    });
    type FunnelItem = (typeof data)[number];
    const tooltipFmt = (p: { name: string; data: FunnelItem }): string =>
      `${p.name}<br/>数值：${fmtN(p.data.value)}${p.data.ofPrev !== null ? `<br/>较上层：${pct(p.data.ofPrev)}` : ''}<br/>占首层：${pct(p.data.ofFirst)}`;
    return {
      ...base,
      tooltip: { show: true, trigger: 'item' as const, confine: true, formatter: tooltipFmt },
      series: [
        {
          type: 'funnel',
          sort: 'none',
          left: '10%',
          right: '10%',
          top: 6,
          bottom: 6,
          min: 0,
          max: top > 0 ? top : undefined,
          minSize: '14%',
          gap: 3,
          itemStyle: { borderColor: palette.bg, borderWidth: 1 },
          label: {
            show: cfg.showValueLabel,
            position: 'inside',
            color: '#FFFFFF',
            fontSize: fontSize - 1,
            lineHeight: Math.round(fontSize * 1.5),
            formatter: (p: { name: string; data: FunnelItem }) =>
              // 小层级（占首层 <22%）梯形太窄，白字会溢出到画布上看不见 → 切紧凑单行；
              // 完整转化率仍在 tooltip 中
              p.data.ofFirst < 22
                ? `${p.name}  ${fmtN(p.data.value)}`
                : `${p.name}  ${fmtN(p.data.value)}\n${p.data.ofPrev !== null ? `较上层 ${pct(p.data.ofPrev)}` : '100%'} · 占首层 ${pct(p.data.ofFirst)}`,
          },
          emphasis: { label: { fontSize } },
          data,
          color: seriesColors(palette),
        },
      ],
    };
  }

  const isBar = cfg.chartType === 'bar'; cfg.chartType === 'bar';
  const categoryAxis = {
    type: 'category' as const,
    data: prepared.categories,
    axisLabel,
    axisLine,
    axisTick: { show: false },
  };
  const valueAxis = {
    type: 'value' as const,
    axisLabel,
    axisLine: { show: false },
    splitLine,
    name: cfg.yUnit,
    nameTextStyle: { color: palette.secondary, fontSize: fontSize - 2 },
  };

  const series = prepared.series.map((s) => {
    const len = s.data.length;
    return {
      name: s.name,
      type: isBar ? ('bar' as const) : ('line' as const),
      data: s.data,
      barMaxWidth: isBar ? 26 : undefined,
      barCategoryGap: '34%',
      smooth: false,
      symbol: isBar ? 'none' : 'circle',
      symbolSize: isBar ? undefined : 5,
      lineStyle: isBar ? undefined : { width: 2, color: s.color },
      areaStyle: isBar || cfg.chartType !== 'line' ? undefined : { color: s.color, opacity: 0.12 },
      itemStyle: isBar
        ? {
            borderRadius: cfg.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
            color: (params: { dataIndex: number }) =>
              cfg.highlightLast && params.dataIndex === len - 1 ? palette.accent : s.color,
            opacity: cfg.highlightLast ? 0.92 : 1,
          }
        : undefined,
      label: {
        show: cfg.showValueLabel && isBar,
        position: cfg.horizontal ? 'right' : 'top',
        color: palette.secondary,
        fontSize: fontSize - 2,
      },
    };
  });

  return {
    ...base,
    legend,
    grid: { left: 4, right: 12, top: cfg.showLegend ? 28 : 18, bottom: 4, containLabel: true },
    xAxis: cfg.horizontal ? valueAxis : categoryAxis,
    yAxis: cfg.horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series,
  };
}
