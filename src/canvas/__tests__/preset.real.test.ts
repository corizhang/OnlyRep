import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readWorkbookSync } from '../../parser/xlsxCore';
import { cleanTable } from '../../parser/clean';
import { toRawTable } from '../../parser/parse';
import { createDailyReportPreset } from '../defaults';
import { runGraph } from '../pipeline/engine';
import { resolveField, formatResolved, resolveTable } from '../binding/resolve';
import type { SourceRuntime } from '../types';

/**
 * 场景 1 验收（PRD 验收标准 1）：用真实三张报表跑内置模板，核对关键指标。
 * 报表按「文件名前缀取最新」匹配（看板导出每天带时间戳）；找不到时自动跳过。
 */

const DIR = 'D:/日报';
const LOCAL = `${process.cwd()}/tmp-validation`;
const PREFIXES = {
  ds_board: '快捷支付202610活动看板_快捷支付202610活动看板_',
  ds_push: '快捷支付202610活动看板_快捷支付看板推送汇总_',
  ds_branch: '快捷支付202610活动看板_快捷绑卡活动-转介统计_',
};

const LOCAL_FILES = { ds_board: 'board.xlsx', ds_push: 'push.xlsx', ds_branch: 'branch.xlsx' } as const;

function pick(prefix: string, localName: string): string | null {
  // 1) 本地临时目录优先（CI 可投放样本）
  const localPath = `${process.cwd()}/tmp-validation/${localName}`;
  try {
    if (existsSync(localPath) && readFileSync(localPath).byteLength > 0) return localPath.replace(/\\/g, '/');
  } catch {
    // 不可读时忽略
  }
  // 2) D:/日报 下按前缀匹配最新导出
  try {
    const hits = readdirSync(DIR)
      .filter((f) => f.startsWith(prefix))
      .sort()
      .reverse();
    for (const f of hits) {
      const p = `${DIR}/${f}`;
      if (existsSync(p) && readFileSync(p).byteLength > 0) return p;
    }
  } catch {
    // 沙箱/网络盘不可读时返回 null
  }
  return null;
}

function loadTable(path: string) {
  const buf = readFileSync(path);
  const bytes = new Uint8Array(buf);
  const core = readWorkbookSync({ format: 'xlsx', buffer: bytes.buffer as ArrayBuffer });
  const raw = toRawTable(core.cells, {
    source: 'xlsx',
    fileName: path.split('/').pop() ?? '',
    sheetName: core.sheetName,
    sheets: core.sheets,
  });
  return cleanTable(raw, { excludeTotalKeywords: true, excludedRowIdx: new Set<number>() });
}

const resolved = Object.fromEntries(
  Object.entries(PREFIXES).map(([id, prefix]) => [id, pick(prefix, LOCAL_FILES[id as keyof typeof LOCAL_FILES])]),
) as Record<keyof typeof PREFIXES, string | null>;

const available = Object.values(resolved).every((p) => p !== null);

describe.skipIf(!available)('内置模板 × 真实报表（验收标准 1）', () => {
  const config = createDailyReportPreset();
  const sources: Record<string, SourceRuntime> = {};
  for (const [id, path] of Object.entries(resolved)) {
    if (!path) continue;
    sources[id] = { table: loadTable(path), status: 'ready', version: 1 };
  }
  const res = runGraph({ nodes: config.pipeline.nodes }, { sourceDefs: config.dataSources, sources });

  /** 从活动看板源表独立取「最新日期行」，作为 KPI 的口径基准（不依赖管道逻辑）。
   *  注意：describe.skipIf 跳过时 body 仍会执行，因此必须惰性调用，不能在 body 顶层求值 */
  function getBoardLatest(): Record<string, unknown> {
    const t = sources['ds_board']?.table;
    if (!t) throw new Error('活动看板源未就绪');
    const rows = [...t.rows].sort((a, b) => String(b['数据日期']).localeCompare(String(a['数据日期'])));
    return rows[0] as Record<string, unknown>;
  }

  it('当日 KPI 与看板最新行一致（全量/目标客户/累计）', () => {
    const boardLatest = getBoardLatest();
    expect(res.env['当日新增绑卡']).toBe(Number(boardLatest['全量当日新增']));
    expect(res.env['目标客户新增']).toBe(Number(boardLatest['当日新增']));
    expect(res.env['累计绑卡']).toBe(Number(boardLatest['累计绑卡']));
  });

  it('全年目标完成率按口径参数测算（剩余天数>0，每日需新增动态）', () => {
    // 全年目标/已完成 来自手填口径参数，与报表数据无关
    const days = Number(res.env['剩余天数']);
    expect(days).toBeGreaterThan(0); // DAYS 已修正为「结束-开始」语义
    expect(Number(res.env['完成率'])).toBeGreaterThan(0);
    expect(Number(res.env['完成率'])).toBeLessThanOrEqual(1);
    expect(res.env['每日需新增']).toBe(Math.ceil(Number(res.env['剩余户数']) / days));
  });

  it('推送汇总按渠道拆分（各 2 批次，数值有效）', () => {
    const wx = resolveTable({ nodeRef: 'n_push_wx' }, { outputs: res.outputs, env: res.env, sources: config.dataSources });
    const mp = resolveTable({ nodeRef: 'n_push_mp' }, { outputs: res.outputs, env: res.env, sources: config.dataSources });
    if (!('table' in wx) || !('table' in mp)) throw new Error('推送表未产出');
    expect(wx.table.rows.length).toBe(2);
    expect(mp.table.rows.length).toBe(2);
    expect(Number(wx.table.rows.reduce((s, r) => s + Number(r['总人数']), 0))).toBeGreaterThan(0);
    expect(Number(mp.table.rows.reduce((s, r) => s + Number(r['达标人数']), 0))).toBeGreaterThan(0);
  });

  it('分行表取最新日期（T+2），行数与源表最新日期一致', () => {
    const t = resolveTable({ nodeRef: 'n_branch_sort' }, { outputs: res.outputs, env: res.env, sources: config.dataSources });
    if (!('table' in t)) throw new Error('分行表未产出');
    expect(t.table.rows.length).toBeGreaterThanOrEqual(10);
    const dates = new Set(t.table.rows.map((r) => String(r['数据日期'])));
    expect(dates.size).toBe(1);
  });

  it('完成率绑定解析结果 = 75.6%', () => {
    const field = resolveField({ kind: 'node', nodeRef: 'n_rate' }, { outputs: res.outputs, env: res.env, sources: config.dataSources });
    const out = formatResolved(field, {
      thousands: true,
      decimals: 1,
      unit: 'none',
      percent: true,
      prefix: '',
      suffix: '',
    });
    expect(out.text).toBe('75.6%');
  });

  it('趋势表为最新 9 日（管道降序，升序展示由图表块负责）', () => {
    const t = resolveTable({ nodeRef: 'n_board_trend' }, { outputs: res.outputs, env: res.env, sources: config.dataSources });
    if (!('table' in t)) throw new Error('趋势表未产出');
    expect(t.table.rows.length).toBe(9);
    const d0 = String(t.table.rows[0]['数据日期']);
    const d8 = String(t.table.rows[8]['数据日期']);
    expect(d0 > d8).toBe(true); // 降序：首行最新
  });
});
