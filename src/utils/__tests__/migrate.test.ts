import { describe, expect, it } from 'vitest';
import { displayModeToVariant, fillV2BlockDefaults, migrateConfigV1toV2 } from '../migrate';
import { createRankListBlockConfig } from '../blocks';
import { makeV1Raw } from './fixtures';
import type {
  ImageBlockConfig,
  RankListBlockConfig,
  TextBlockConfig,
} from '../../types';
import { createDefaultConfig } from '../../constants/defaults';

describe('v1 → v2 配置迁移', () => {
  it('旧展示字段翻译为经典通报 blocks（title/subtitle/caliber/signature/rankList）', () => {
    const v2 = migrateConfigV1toV2(makeV1Raw());
    expect(v2.version).toBe(2);
    expect(v2.blocks.map((b) => b.type)).toEqual(['text', 'text', 'text', 'rankList', 'text']);
    const texts = v2.blocks.filter((b) => b.type === 'text');
    expect((texts[0].config as TextBlockConfig).content).toBe('月度销冠榜');
    expect((texts[0].config as TextBlockConfig).role).toBe('title');
    expect((texts[1].config as TextBlockConfig).content).toBe('6 月冲刺');
    expect((texts[2].config as TextBlockConfig).content).toBe('统计周期：2024-06-01~06-30');
    expect((texts[3].config as TextBlockConfig).content).toBe('企微渠道运营');
    expect((texts[3].config as TextBlockConfig).align).toBe('right');
  });

  it('displayMode 映射进 rankList.variant；视觉/规则字段全部沿用', () => {
    const v2 = migrateConfigV1toV2(makeV1Raw());
    const rl = v2.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.variant).toBe('twoColumn');
    expect(v2.themeId).toBe('festiveRed');
    expect(v2.topN).toBe(20);
    expect(v2.showOthers).toBe(true);
    expect(v2.filters.minValue).toBe(10);
    expect(v2.numberFormat.prefix).toBe('¥');
    expect(v2.secondaryKeys).toEqual(['网点']);
    expect(v2.exportScale).toBe(4);
    expect(v2.zebra).toBe(true);
  });

  it('paged 展示模式迁移保留 pageSize', () => {
    const raw = { ...makeV1Raw(), displayMode: 'paged', pageSize: 7 };
    const v2 = migrateConfigV1toV2(raw);
    const rl = v2.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.variant).toBe('paged');
    expect(rl.pageSize).toBe(7);
  });

  it('空对象兜底：产出含榜单块的合法 v2 配置', () => {
    const v2 = migrateConfigV1toV2({});
    expect(v2.version).toBe(2);
    expect(v2.blocks.some((b) => b.type === 'rankList')).toBe(true);
    expect((v2.blocks[0].config as TextBlockConfig).content).toBe('排行榜');
    expect(v2.topN).toBe(10);
    expect(v2.floats).toEqual([]);
  });

  it('displayModeToVariant：未知值回退 long，无 table 变体', () => {
    expect(displayModeToVariant('long')).toBe('long');
    expect(displayModeToVariant('twoColumn')).toBe('twoColumn');
    expect(displayModeToVariant('paged')).toBe('paged');
    expect(displayModeToVariant('table')).toBe('long');
    expect(displayModeToVariant(undefined)).toBe('long');
  });
});

describe('fillV2BlockDefaults（v2 旧持久化补榜单块 P0 字段默认值）', () => {
  it('旧榜单块（仅 variant/pageSize）补齐新字段默认值，旧行为不变', () => {
    const cfg = createDefaultConfig();
    // 模拟早期 v2 持久化：榜单块 config 没有任何 P0 样式字段
    const old = {
      ...cfg,
      version: 2 as const,
      blocks: cfg.blocks.map((b) =>
        b.type === 'rankList'
          ? { ...b, config: { variant: 'long', pageSize: 10 } as unknown as RankListBlockConfig }
          : b,
      ),
    };
    const out = fillV2BlockDefaults(old);
    expect(out.version).toBe(2);
    const rl = out.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.variant).toBe('long');
    expect(rl.pageSize).toBe(10);
    expect(rl.rowStyle).toBe('card');
    expect(rl.badgeShape).toBe('circle');
    expect(rl.top1Icon).toBe('auto');
    expect(rl.progressBar).toEqual({ show: true, color: 'accent' });
    expect(rl.table).toEqual({
      columns: ['rank', 'name', 'value'],
      colWidthMode: 'auto',
      colWeights: {},
      aligns: {},
      header: { show: true, bold: true, bg: 'theme' },
    });
  });

  it('已带合法新字段的配置原样保留（不覆盖用户设置）', () => {
    const cfg = createDefaultConfig();
    cfg.blocks = cfg.blocks.map((b) =>
      b.type === 'rankList'
        ? {
            ...b,
            config: {
              ...(b.config as RankListBlockConfig),
              rowStyle: 'minimal',
              badgeShape: 'square',
              top1Icon: 'trophy',
              progressBar: { show: false, color: 'tier' },
              table: {
                columns: ['name', 'rank', 'value'],
                colWidthMode: 'custom',
                colWeights: { rank: 2, value: 6 },
                aligns: { rank: 'left' },
                header: { show: false, bold: false, bg: 'none' },
              },
            } as RankListBlockConfig,
          }
        : b,
    );
    const out = fillV2BlockDefaults(cfg);
    const rl = out.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.rowStyle).toBe('minimal');
    expect(rl.badgeShape).toBe('square');
    expect(rl.top1Icon).toBe('trophy');
    expect(rl.progressBar).toEqual({ show: false, color: 'tier' });
    expect(rl.table.columns).toEqual(['name', 'rank', 'value']);
    expect(rl.table.colWidthMode).toBe('custom');
    expect(rl.table.colWeights).toEqual({ rank: 2, value: 6 });
    expect(rl.table.aligns).toEqual({ rank: 'left' });
    expect(rl.table.header).toEqual({ show: false, bold: false, bg: 'none' });
  });

  it('非法新字段值收敛回默认（rowStyle/badgeShape/table.columns）', () => {
    const cfg = createDefaultConfig();
    cfg.blocks = cfg.blocks.map((b) =>
      b.type === 'rankList'
        ? {
            ...b,
            config: {
              ...(b.config as RankListBlockConfig),
              rowStyle: 'bogus',
              badgeShape: 'triangle',
              top1Icon: 'star',
              table: { columns: ['nope', 42] },
            } as unknown as RankListBlockConfig,
          }
        : b,
    );
    const out = fillV2BlockDefaults(cfg);
    const rl = out.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.rowStyle).toBe('card');
    expect(rl.badgeShape).toBe('circle');
    expect(rl.top1Icon).toBe('auto');
    expect(rl.table.columns).toEqual(['rank', 'name', 'value']);
  });

  it('图片区块与悬浮层结构不被破坏（透传清洗）', () => {
    const cfg = createDefaultConfig();
    cfg.blocks = [
      ...cfg.blocks,
      { id: 'img1', type: 'image', config: { src: null, widthPct: 50, align: 'center', borderRadius: 8 } },
    ];
    cfg.floats = [{ id: 'f1', type: 'image', x: 4, y: 3, config: { src: null, widthPct: 18, align: 'left', borderRadius: 0 } }];
    const out = fillV2BlockDefaults(cfg);
    expect(out.blocks.some((b) => b.id === 'img1')).toBe(true);
    expect(out.floats).toHaveLength(1);
    expect((out.floats[0].config as ImageBlockConfig).widthPct).toBe(18);
  });

  it('v1 → v2 迁移产物自带 P0 默认值（buildClassicStructure 走默认配置工厂）', () => {
    const v2 = migrateConfigV1toV2(makeV1Raw());
    const rl = v2.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.rowStyle).toBe('card');
    expect(rl.top1Icon).toBe('auto');
    expect(rl.table.header).toEqual({ show: true, bold: true, bg: 'theme' });
  });
});

describe('文本块（回归保护）', () => {
  it('迁移后文本块字段不受 P0 改动影响', () => {
    const v2 = migrateConfigV1toV2(makeV1Raw());
    const texts = v2.blocks.filter((b) => b.type === 'text');
    expect((texts[0].config as TextBlockConfig).content).toBe('月度销冠榜');
  });
});

describe('白屏事故回归（线上 v2 持久化缺 table 子对象）', () => {
  it('variant=table 但缺 table 字段的旧持久化，fillV2BlockDefaults 必须补齐（防渲染读 undefined.columns 白屏）', () => {
    const cfg = createDefaultConfig();
    cfg.blocks = cfg.blocks.map((b) =>
      b.type === 'rankList'
        ? {
            ...b,
            // 模拟 P0 之前的 v2 持久化：用户切过表格变体，但没有 table 子对象与新样式字段
            config: { variant: 'table', pageSize: 10 } as unknown as RankListBlockConfig,
          }
        : b,
    );
    const out = fillV2BlockDefaults(cfg);
    const rl = out.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.table).toBeDefined();
    expect(rl.table.columns).toEqual(['rank', 'name', 'value']);
    expect(rl.table.header).toEqual({ show: true, bold: true, bg: 'theme' });
    expect(rl.rowStyle).toBe('card');
  });

  it('渲染兜底：cfg.table 缺失时 renderTable 路径可取默认 table（createRankListBlockConfig 工厂）', () => {
    // 与 PreviewBoard.tsx 的 `cfg.table ?? createRankListBlockConfig(...).table` 兜底保持同源
    const cfg = createDefaultConfig();
    cfg.blocks = cfg.blocks.map((b) =>
      b.type === 'rankList' ? { ...b, config: { variant: 'table', pageSize: 10 } as RankListBlockConfig } : b,
    );
    const rl = cfg.blocks.find((b) => b.type === 'rankList')!.config as RankListBlockConfig;
    expect(rl.table).toBeUndefined();
    const fallback = createRankListBlockConfig(rl.variant, rl.pageSize).table;
    expect(fallback.columns).toEqual(['rank', 'name', 'value']);
    expect(fallback.colWidthMode).toBe('auto');
  });
});
