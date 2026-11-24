import { describe, expect, it } from 'vitest';
import { extractJson } from '../ai/generate';
import { buildAiMessages } from '../ai/prompt';
import { sanitizeCanvasConfig } from '../template';
import type { DataSource } from '../types';

describe('AI 生成', () => {
  it('extractJson：剥围栏与前后废话', () => {
    expect(extractJson('好的，如下：\n```json\n{"a":1}\n```\n希望有帮助')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
    expect(extractJson('没有 JSON')).toBeNull();
  });

  it('提示词：默认只发列结构，不发样本', () => {
    const ds: DataSource[] = [{ id: 'ds1', name: '渠道表', kind: 'import', fileName: 'a.xlsx', sheetName: '' }];
    const sources = {
      ds1: {
        table: {
          columns: [
            { key: '渠道', type: 'text', rawName: '渠道' },
            { key: '新增', type: 'number', rawName: '新增' },
          ],
          rows: [{ __idx: 0, '渠道': '机密渠道X', '新增': 120 }],
        },
        sheets: [],
        file: null,
        status: 'ready',
        version: 1,
        fromCache: false,
        cachedAt: 0,
        hasHandle: false,
      },
    } as never;
    const m1 = buildAiMessages('做渠道日报', ds, sources, false);
    expect(m1.user).toContain('渠道(文本)');
    expect(m1.user).toContain('新增(数值)');
    expect(m1.user).not.toContain('机密渠道X'); // 不发样本行
    const m2 = buildAiMessages('做渠道日报', ds, sources, true);
    expect(m2.user).toContain('机密渠道X | 120'); // 开启后发样本
  });

  it('无数据时提示 AI 造示例数据', () => {
    const m = buildAiMessages('做渠道日报', [], {}, false);
    expect(m.user).toContain('manualTable');
  });

  it('生成的典型 JSON 能过 sanitize 校验', () => {
    const sample = {
      version: 2,
      title: 'AI 日报',
      width: 750,
      fontSize: 'medium',
      theme: { accent: '#2563eb', bg: '#f6f7f9' },
      dataSources: [{ id: 'ds1', name: '表', kind: 'manualTable', table: { columns: ['渠道', '新增'], rows: [['公众号', 1]] } }],
      pipeline: { nodes: [{ id: 'n1', type: 'source', name: '表', inputs: [], params: { sourceId: 'ds1' }, enabled: true }] },
      blocks: [{ id: 'b1', type: 'text', config: { content: '标题', variant: 'title' } }],
    };
    const cfg = sanitizeCanvasConfig(JSON.parse(JSON.stringify(sample)));
    expect(cfg.blocks).toHaveLength(1);
    expect(cfg.pipeline.nodes).toHaveLength(1);
  });
});
