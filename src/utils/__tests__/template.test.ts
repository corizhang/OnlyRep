import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_KIND,
  TEMPLATE_VERSION,
  migrateTemplate,
  serializeTemplate,
  validateTemplate,
} from '../template';
import { createDefaultConfig } from '../../constants/defaults';
import { makeV1Raw } from './fixtures';

describe('模板 JSON v2 导出 / 导入', () => {
  it('序列化 version=2 且剥离图片数据（背景图 + 图片区块 src）', () => {
    const config = createDefaultConfig();
    config.backgroundImage = 'data:image/png;base64,XXXX';
    config.blocks = [
      ...config.blocks,
      { id: 'img1', type: 'image', config: { src: 'data:image/png;base64,YYYY', widthPct: 50, align: 'center', borderRadius: 0 } },
    ];
    const tpl = serializeTemplate(config);
    expect(tpl.version).toBe(TEMPLATE_VERSION);
    expect(tpl.config.backgroundImage).toBeNull();
    const img = tpl.config.blocks.find((b) => b.type === 'image');
    expect(img && (img.config as { src: string | null }).src).toBeNull();
  });

  it('v1 模板 JSON 导入自动迁移为 v2 区块结构', () => {
    const v1Tpl = {
      kind: TEMPLATE_KIND,
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      config: makeV1Raw(),
    };
    const cfg = validateTemplate(v1Tpl);
    expect(cfg.version).toBe(2);
    expect(cfg.blocks.map((b) => b.type)).toEqual(['text', 'text', 'text', 'rankList', 'text']);
    expect(cfg.themeId).toBe('festiveRed');
  });

  it('v2 模板导入保留区块结构；坏区块被清洗', () => {
    const cfg = createDefaultConfig();
    const tpl = serializeTemplate(cfg);
    (tpl.config.blocks as unknown[]).push({ type: 'bogus', config: {} });
    const out = validateTemplate(JSON.parse(JSON.stringify(tpl)));
    expect(out.version).toBe(2);
    expect(out.blocks.every((b) => ['text', 'image', 'rankList', 'divider'].includes(b.type))).toBe(true);
  });

  it('非模板 kind 抛错；裸配置对象（无包装）也可导入', () => {
    expect(() => validateTemplate({ kind: 'other-tool' })).toThrow();
    const bare = { ...makeV1Raw(), version: 2 };
    expect(validateTemplate(bare).version).toBe(2);
  });

  it('migrateTemplate v2 路径：缺省字段用默认值兜底', () => {
    const out = migrateTemplate({}, 2);
    expect(out.version).toBe(2);
    expect(Array.isArray(out.blocks)).toBe(true);
    expect(out.topN).toBe(10);
    expect(out.backgroundImage).toBeNull();
  });
});
