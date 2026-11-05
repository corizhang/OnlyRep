import { describe, expect, it } from 'vitest';
import { buildClassicStructure, PRESET_TEMPLATES } from '../templates';
import { sanitizePosterBlocks } from '../../utils/blocks';
import type { ImageBlockConfig, RankListBlockConfig, TextBlockConfig } from '../../types';

describe('预设模板（v2 区块结构）', () => {
  it('内置恰好 4 套模板：经典通报/活动战报/简约表格/空白', () => {
    expect(PRESET_TEMPLATES.map((t) => t.name)).toEqual([
      '经典通报',
      '活动战报',
      '简约表格',
      '空白',
    ]);
  });

  it.each(PRESET_TEMPLATES)('「$name」结构合法', (tpl) => {
    const s = tpl.build();
    // 至少 1 个区块且包含 1 个榜单块
    expect(s.blocks.length).toBeGreaterThan(0);
    expect(s.blocks.some((b) => b.type === 'rankList')).toBe(true);
    // id 全局唯一
    const ids = [...s.blocks, ...s.floats].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 全部区块可被导入/迁移管线清洗还原（无坏结构）
    expect(sanitizePosterBlocks(s.blocks)).toHaveLength(s.blocks.length);
    expect(sanitizePosterBlocks(s.floats)).toHaveLength(s.floats.length);
    // 文本块内容非空（空文本块不应产出）
    for (const b of s.blocks) {
      if (b.type === 'text') expect((b.config as TextBlockConfig).content).not.toBe('');
    }
  });

  it('经典通报 = 原固定版式：title+rankList(long)（默认无副标题/口径/落款）', () => {
    const s = buildClassicStructure({
      title: '月度榜',
      subtitle: '副标题',
      caliber: '统计周期',
      signature: '落款',
      variant: 'long',
      pageSize: 10,
    });
    expect(s.blocks.map((b) => b.type)).toEqual(['text', 'text', 'text', 'rankList', 'text']);
    expect((s.blocks[0].config as TextBlockConfig).role).toBe('title');
    expect((s.blocks[3].config as RankListBlockConfig).variant).toBe('long');
    expect(s.floats).toEqual([]);
  });

  it('活动战报含悬浮 Logo 占位（floats）+ 双列榜单 + 分隔线', () => {
    const s = PRESET_TEMPLATES.find((t) => t.id === 'battle')!.build();
    expect(s.floats).toHaveLength(1);
    expect(s.floats[0].type).toBe('image');
    expect(typeof s.floats[0].x).toBe('number');
    expect(typeof s.floats[0].y).toBe('number');
    expect(s.blocks.some((b) => b.type === 'rankList' && (b.config as RankListBlockConfig).variant === 'twoColumn')).toBe(true);
    expect(s.blocks.some((b) => b.type === 'divider')).toBe(true);
  });

  it('简约表格含 table 变体榜单块，且显式 columns=[rank,name,value]', () => {
    const s = PRESET_TEMPLATES.find((t) => t.id === 'table')!.build();
    const rl = s.blocks.find((b) => b.type === 'rankList');
    expect(rl && (rl.config as RankListBlockConfig).variant).toBe('table');
    expect((rl!.config as RankListBlockConfig).table.columns).toEqual(['rank', 'name', 'value']);
  });

  it('非表格模板的榜单块走默认 table 配置（旧行为不变）', () => {
    for (const id of ['classic', 'battle', 'blank'] as const) {
      const s = PRESET_TEMPLATES.find((t) => t.id === id)!.build();
      const rl = s.blocks.find((b) => b.type === 'rankList')!;
      const c = rl.config as RankListBlockConfig;
      expect(c.rowStyle).toBe('card');
      expect(c.badgeShape).toBe('circle');
      expect(c.top1Icon).toBe('auto');
      expect(c.progressBar).toEqual({ show: true, color: 'accent' });
      expect(c.table).toEqual({
        columns: ['rank', 'name', 'value'],
        colWidthMode: 'auto',
        colWeights: {},
        aligns: {},
        header: { show: true, bold: true, bg: 'theme' },
      });
    }
  });

  it('每次 build 生成新 id（工厂函数，套用不冲突）', () => {
    const a = PRESET_TEMPLATES[0].build();
    const b = PRESET_TEMPLATES[0].build();
    expect(a.blocks[0].id).not.toBe(b.blocks[0].id);
  });
});

describe('sanitizePosterBlocks（区块结构清洗）', () => {
  it('过滤未知类型与坏结构', () => {
    const out = sanitizePosterBlocks([
      { type: 'nope' },
      null,
      { type: 'text', config: { content: 'hi' } },
      'junk',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('text');
  });

  it('逐字段收敛默认值：非法数字/枚举回退', () => {
    const out = sanitizePosterBlocks([
      {
        type: 'text',
        config: { content: 123, role: 'bogus', fontSizeScale: 'abc', align: 'diagonal' },
      },
    ]);
    const c = out[0].config as TextBlockConfig;
    expect(c.content).toBe('');
    expect(c.role).toBe('body');
    expect(c.fontSizeScale).toBe(1);
    expect(c.align).toBe('left');
  });

  it('悬浮坐标 x/y 收敛到 0~100，缺失保留 undefined', () => {
    const out = sanitizePosterBlocks([
      { type: 'image', x: 120, y: -5, config: {} },
      { type: 'image', config: {} },
    ]);
    const [a, b] = out.map((o) => o as { x?: number; y?: number });
    expect(a.x).toBe(100);
    expect(a.y).toBe(0);
    expect(b.x).toBeUndefined();
    expect(b.y).toBeUndefined();
  });

  it('image 区块 src 非字符串时置 null，宽度夹取 10~100', () => {
    const out = sanitizePosterBlocks([{ type: 'image', config: { src: 42, widthPct: 5 } }]);
    const c = out[0].config as ImageBlockConfig;
    expect(c.src).toBeNull();
    expect(c.widthPct).toBe(10);
  });
});
