import type { AggMethod, RankConfig } from '../types';
import type { CleanRow } from '../parser/clean';
import { getRawText, getVal } from '../parser/clean';

/**
 * 分组聚合（6 种方式）与过滤（ARCH §5.3）。纯函数，禁止 import React / store。
 */

export interface AggEntry {
  key: string;
  value: number | null;
  samples: number;
}

/**
 * 按 groupKey 分组、对 metricKey 聚合。
 * 缺失值（null）处理：sum/avg/max/min → 跳过 null；count → 计所有样本；
 * countDistinct → 对原始文本去重计数；组内全 null → 该组值 = null（不进榜）。
 */
export function aggregate(
  rows: CleanRow[],
  groupKey: string,
  metricKey: string,
  method: AggMethod,
): Map<string, AggEntry> {
  const groups = new Map<string, CleanRow[]>();
  for (const r of rows) {
    const g = String(getVal(r, groupKey) ?? '(空)');
    const bucket = groups.get(g);
    if (bucket) bucket.push(r);
    else groups.set(g, [r]);
  }

  const out = new Map<string, AggEntry>();
  for (const [k, rs] of groups) {
    const vals: number[] = [];
    for (const r of rs) {
      const v = getVal(r, metricKey);
      if (typeof v === 'number') vals.push(v);
    }

    let value: number | null = null;
    switch (method) {
      case 'sum':
        value = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
        break;
      case 'avg':
        value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        break;
      case 'count':
        value = rs.length;
        break;
      case 'countDistinct':
        value = new Set(
          rs.map((r) => {
            const raw = getRawText(r, metricKey);
            return raw !== '' ? raw : String(getVal(r, metricKey) ?? '');
          }),
        ).size;
        break;
      case 'max':
        // 用 reduce 避免 Math.max(...vals) 在万行级数组上的调用栈溢出
        value = vals.length ? vals.reduce((a, b) => (b > a ? b : a), vals[0]) : null;
        break;
      case 'min':
        value = vals.length ? vals.reduce((a, b) => (b < a ? b : a), vals[0]) : null;
        break;
    }

    out.set(k, { key: k, value, samples: rs.length });
  }
  return out;
}

/**
 * 过滤：指标值为 null 的组不进榜；组内样本数 < minSamples（仅分组模式语义）；
 * 指标最小值阈值 minValue（null = 不启用）。返回保留项与被排除数。
 */
export function applyFilters<T extends AggEntry>(
  entries: T[],
  config: RankConfig,
  opts: { applyMinSamples: boolean },
): { kept: T[]; excluded: number } {
  let excluded = 0;
  const kept: T[] = [];
  for (const e of entries) {
    if (e.value === null) {
      excluded++;
      continue;
    }
    if (opts.applyMinSamples && e.samples < config.filters.minSamples) {
      excluded++;
      continue;
    }
    if (config.filters.minValue !== null && e.value < config.filters.minValue) {
      excluded++;
      continue;
    }
    kept.push(e);
  }
  return { kept, excluded };
}
