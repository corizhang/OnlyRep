import { describe, expect, it } from 'vitest';
import { rectsIntersect } from '../flow/layout';

describe('框选矩形相交', () => {
  const node = { x: 100, y: 100, w: 300, h: 200 };
  it('完全包含 / 部分相交 / 边缘接触', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 500, h: 500 }, node)).toBe(true);
    expect(rectsIntersect({ x: 350, y: 250, w: 100, h: 100 }, node)).toBe(true);
    expect(rectsIntersect({ x: 390, y: 290, w: 20, h: 20 }, node)).toBe(true);
  });
  it('不相交', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 50, h: 50 }, node)).toBe(false);
    expect(rectsIntersect({ x: 500, y: 100, w: 100, h: 100 }, node)).toBe(false);
    expect(rectsIntersect({ x: 100, y: 400, w: 300, h: 50 }, node)).toBe(false);
  });
});
