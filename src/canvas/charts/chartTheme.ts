import type { CleanedTable } from '../../parser/clean';
import { getRawText, getVal } from '../../parser/clean';
import type { ChartConfig } from '../types';
import { formatShortDate, parseDateValue } from '../pipeline/dates';

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

  const isBar = cfg.chartType === 'bar';
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
