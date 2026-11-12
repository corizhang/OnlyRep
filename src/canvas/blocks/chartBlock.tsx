import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { ChartConfig } from '../types';
import { resolveTable } from '../binding/resolve';
import { buildChartOption, prepareChartData, prepareFunnelScalars, type ChartPalette } from '../charts/chartTheme';
import { echarts, type EChartsInstance } from '../charts/echarts';
import type { RenderCtx } from './context';

/** ECharts 容器：SVG 渲染器（R10-07），随容器宽度自动 resize */
function EChart({ option, height }: { option: Record<string, unknown>; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<EChartsInstance | null>(null);
  const optionKey = useMemo(() => JSON.stringify(option), [option]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    inst.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [optionKey, option]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}

/** 图表块（PRD R4-05）：绑定表格 → 条形/折线/环形/仪表 */
export default function ChartBlock({ cfg, ctx }: { cfg: ChartConfig; ctx: RenderCtx }) {
  const tableRes = resolveTable(cfg.table, ctx.resolve);

  const palette: ChartPalette = {
    text: ctx.theme.textColor,
    secondary: ctx.theme.secondaryColor,
    accent: ctx.accent,
    grid: ctx.theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
    dark: ctx.theme.dark,
    bg: ctx.theme.dark ? '#0F2F6B' : '#FFFFFF',
  };

  const body = (() => {
    // 漏斗·逐层取数模式：不走表格绑定，逐层解析标量（数组顺序即漏斗顺序）
    if (cfg.chartType === 'funnel' && cfg.funnelMode === 'scalars') {
      const prepared = prepareFunnelScalars(cfg.funnelStages ?? [], ctx.resolve);
      if ('error' in prepared) return <Placeholder text={prepared.error} ctx={ctx} height={cfg.height} />;
      // 层级顺序由用户定义，强制 sort=none（sort 只作用于 table 模式）
      const option = buildChartOption({ cfg: { ...cfg, sort: 'none' }, prepared, palette, fontSize: ctx.baseFont });
      return <EChart option={option} height={cfg.height} />;
    }
    if ('reason' in tableRes) return <Placeholder text={`表格未就绪：${tableRes.reason}`} ctx={ctx} height={cfg.height} />;
    const prepared = prepareChartData(cfg, tableRes.table, palette);
    if ('error' in prepared) return <Placeholder text={prepared.error} ctx={ctx} height={cfg.height} />;
    if (prepared.categories.length === 0) return <Placeholder text="没有可绘制的数据行" ctx={ctx} height={cfg.height} />;
    const option = buildChartOption({ cfg, prepared, palette, fontSize: ctx.baseFont });
    return <EChart option={option} height={cfg.height} />;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cfg.title && (
        <div style={{ fontSize: ctx.baseFont * 0.92, fontWeight: 600, color: ctx.theme.textColor }}>{cfg.title}</div>
      )}
      {body}
    </div>
  );
}

function Placeholder({ text, ctx, height }: { text: string; ctx: RenderCtx; height: number }) {
  const style: CSSProperties = {
    height,
    border: `1px dashed ${ctx.theme.dark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.2)'}`,
    borderRadius: ctx.shellRadius ?? 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: ctx.theme.secondaryColor,
    fontSize: ctx.baseFont * 0.85,
    textAlign: 'center',
    padding: 12,
    boxSizing: 'border-box',
  };
  return <div style={style}>{text}</div>;
}
