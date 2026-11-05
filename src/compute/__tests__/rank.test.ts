import { describe, expect, it } from 'vitest';
import {
  applyTopN,
  computeRanks,
  sortRankItems,
  type RankItem,
  type RankedRow,
} from '../rank';

const items: RankItem[] = [
  { key: 'a', value: 30 },
  { key: 'b', value: 20 },
  { key: 'c', value: 20 },
  { key: 'd', value: 10 },
];

describe('computeRanks 三种并列策略（R2-07 / 验收标准 4）', () => {
  it('策略① competition：同值同名次跳位 → 1,2,2,4', () => {
    expect(computeRanks(items, 'desc', 'competition').map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('策略② ordinal：严格顺序 → 1,2,3,4', () => {
    expect(computeRanks(items, 'desc', 'ordinal').map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('策略③ secondary：按次要列打破并列（次要值大者在前）', () => {
    const withSec: RankItem[] = [
      { key: 'a', value: 30, secondaryValue: 1 },
      { key: 'b', value: 20, secondaryValue: 5 },
      { key: 'c', value: 20, secondaryValue: 9 },
      { key: 'd', value: 10 },
    ];
    const sorted = sortRankItems(withSec, 'desc', 'secondary', 'desc');
    expect(sorted.map((i) => i.key)).toEqual(['a', 'c', 'b', 'd']);
    expect(computeRanks(withSec, 'desc', 'secondary', 'desc').map((r) => r.rank)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('displayRank 并列时仍连续（competition → 1,2,3,4）', () => {
    expect(computeRanks(items, 'desc', 'competition').map((r) => r.displayRank)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('升序榜：值小者名次靠前（R2-03 语义反转）', () => {
    expect(computeRanks(items, 'asc', 'competition').map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('浮点近似并列：EPSILON 内视为同值', () => {
    const f: RankItem[] = [
      { key: 'x', value: 10.0000000001 },
      { key: 'y', value: 10.0 },
    ];
    expect(computeRanks(f, 'desc', 'competition').map((r) => r.rank)).toEqual([1, 1]);
  });
});

function makeRanked(n: number): RankedRow[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `k${i}`,
    name: `对象${i + 1}`,
    rank: i + 1,
    displayRank: i + 1,
    rawValue: n - i,
    sampleCount: 1,
    delta: null,
    secondary: [],
  }));
}

describe('applyTopN TopN 截断 +「其他」合并（R2-08 / 验收标准 5）', () => {
  it('TopN=5 + showOthers + 12 个对象 → 6 行且末行为「其他 7 人 合计 28」', () => {
    const { rows, othersCount } = applyTopN(makeRanked(12), 5, true);
    expect(rows).toHaveLength(6);
    expect(rows[5].isOthers).toBe(true);
    expect(rows[5].name).toBe('其他 7 人');
    expect(rows[5].value).toBe(7 + 6 + 5 + 4 + 3 + 2 + 1);
    expect(rows[5].rank).toBe(6);
    expect(othersCount).toBe(7);
    expect(rows[0].ratio).toBe(1);
  });

  it('关闭 showOthers → 仅 5 行', () => {
    const { rows, othersCount } = applyTopN(makeRanked(12), 5, false);
    expect(rows).toHaveLength(5);
    expect(othersCount).toBe(0);
  });

  it('其余行 ratio = 值 / 榜首值', () => {
    const { rows } = applyTopN(makeRanked(12), 5, false);
    expect(rows[1].ratio).toBeCloseTo(11 / 12, 9);
  });
});
