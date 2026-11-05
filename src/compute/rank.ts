import type { RankRow, SortDirection, TieStrategy } from '../types';
import { EPSILON } from '../constants/defaults';

/**
 * 排名（三种并列策略）+ TopN 截断 +「其他」合并（ARCH §5.4）。
 * 纯函数，禁止 import React / store。
 */

export interface RankItem {
  key: string;
  value: number;
  /** 策略③（secondary）使用的次要排序列值 */
  secondaryValue?: number;
}

/** 已完成排名、可直接进入 TopN 截断的行 */
export interface RankedRow {
  key: string;
  name: string;
  rank: number;
  displayRank: number;
  rawValue: number;
  sampleCount: number;
  delta: number | null;
  secondary: string[];
}

/** 基础比较：desc → 值大者在前；asc → 值小者在前（升序榜语义反转） */
function baseCompare(direction: SortDirection): (a: RankItem, b: RankItem) => number {
  return direction === 'desc' ? (a, b) => b.value - a.value : (a, b) => a.value - b.value;
}

/**
 * 排序（返回按名次先后排列的新数组；不修改入参）。
 * 策略③：并列者先按次要列排序（次要列默认与主指标同方向），再按顺序给名次。
 * Array.prototype.sort 为稳定排序，次要列也相同时保持原始顺序。
 */
export function sortRankItems(
  items: RankItem[],
  direction: SortDirection,
  tieStrategy: TieStrategy,
  secondaryDirection: SortDirection = 'desc',
): RankItem[] {
  const arr = [...items];
  const cmp = baseCompare(direction);
  if (tieStrategy === 'secondary') {
    arr.sort((a, b) => {
      const d = cmp(a, b);
      if (d !== 0) return d;
      const sa = a.secondaryValue ?? 0;
      const sb = b.secondaryValue ?? 0;
      return (sa - sb) * (secondaryDirection === 'desc' ? -1 : 1);
    });
    return arr;
  }
  arr.sort(cmp);
  return arr;
}

/**
 * 计算名次。返回数组与「排序后」的 items 对齐（sorted[i] 对应结果[i]）。
 * 策略① competition：同值同名次、跳位 → 1,2,2,4；
 * 策略② ordinal：严格顺序 → 1,2,3,4；
 * 策略③ secondary：先按次要列打破并列，再全部顺序给名次 → 1,2,3,4。
 * 浮点同值判定：Math.abs(a-b) < EPSILON 视为并列。
 */
export function computeRanks(
  items: RankItem[],
  direction: SortDirection,
  tieStrategy: TieStrategy,
  secondaryDirection: SortDirection = 'desc',
): { rank: number; displayRank: number }[] {
  const sorted = sortRankItems(items, direction, tieStrategy, secondaryDirection);

  if (tieStrategy === 'secondary') {
    return sorted.map((_, i) => ({ rank: i + 1, displayRank: i + 1 }));
  }

  const result: { rank: number; displayRank: number }[] = [];
  let i = 0;
  while (i < sorted.length) {
    // 找到同值区间 [i, j)
    let j = i + 1;
    while (j < sorted.length && Math.abs(sorted[j].value - sorted[i].value) < EPSILON) j++;
    for (let k = i; k < j; k++) {
      if (tieStrategy === 'competition') {
        result[k] = { rank: i + 1, displayRank: k + 1 };
      } else {
        result[k] = { rank: k + 1, displayRank: k + 1 };
      }
    }
    i = j;
  }
  return result;
}

/**
 * TopN 截断 +「其他」合并（PRD R2-08）。
 * 入参 rows 必须已按名次先后排序（rank/displayRank 已赋值）。
 * TopN 外合并为末行「其他 N 人 合计 X」；showOthers=false 时直接截断。
 */
export function applyTopN(
  sorted: RankedRow[],
  topN: number,
  showOthers: boolean,
): { rows: RankRow[]; othersCount: number } {
  const topValue = sorted.length > 0 ? sorted[0].rawValue : 0;
  const ratioOf = (v: number): number =>
    Math.abs(topValue) > EPSILON ? v / topValue : 0;

  const head = sorted.slice(0, Math.max(1, Math.round(topN)));
  const rows: RankRow[] = head.map((r) => ({
    rank: r.rank,
    displayRank: r.displayRank,
    name: r.name,
    secondary: r.secondary,
    value: r.rawValue,
    rawValue: r.rawValue,
    delta: r.delta,
    ratio: ratioOf(r.rawValue),
    isOthers: false,
    sampleCount: r.sampleCount,
  }));

  const rest = sorted.slice(head.length);
  let othersCount = 0;
  if (showOthers && rest.length > 0) {
    const sum = rest.reduce((acc, r) => acc + r.rawValue, 0);
    rows.push({
      rank: rest[0].rank,
      displayRank: head.length + 1,
      name: `其他 ${rest.length} 人`,
      secondary: [],
      value: sum,
      rawValue: sum,
      delta: null,
      ratio: ratioOf(sum),
      isOthers: true,
      sampleCount: rest.reduce((acc, r) => acc + r.sampleCount, 0),
    });
    othersCount = rest.length;
  }

  return { rows, othersCount };
}
