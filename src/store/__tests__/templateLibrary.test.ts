import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '../useCanvasStore';

/** 模板库：保存/载入/重命名/复制/删除/脏检查（存档点模式） */

const get = () => useCanvasStore.getState();

beforeEach(() => {
  // 清库 → 清空工作区 → 载入含 n1 的基线配置
  for (const t of [...get().templates]) get().deleteTemplate(t.id);
  get().newBlankWorkspace();
  get().loadTemplate({
    ...get().config,
    pipeline: { nodes: [{ id: 'n1', type: 'formula', name: '计算字段', inputs: [], params: { expr: '1' }, enabled: true }] },
    dataSources: [],
    blocks: [],
    flowPos: {},
  });
});

describe('模板库', () => {
  it('保存新建 → 覆盖更新 → 脏检查', () => {
    const id = get().saveTemplate('日报A');
    expect(get().templates.length).toBe(1);
    expect(get().templates[0].name).toBe('日报A');
    expect(get().activeTemplateId).toBe(id);
    expect(get().isTemplateDirty()).toBe(false);

    // 修改后变脏；保存覆盖后干净
    get().updateNode('n1', { params: { expr: '42' } });
    expect(get().isTemplateDirty()).toBe(true);
    get().saveTemplate();
    expect(get().isTemplateDirty()).toBe(false);
    expect((get().templates[0].config.pipeline.nodes[0].params as { expr: string }).expr).toBe('42');
  });

  it('载入模板恢复工作区（清撤销历史）', () => {
    const id = get().saveTemplate('模板1');
    get().updateNode('n1', { params: { expr: '99' } });
    expect(get().history.past.length).toBeGreaterThan(0);
    expect(get().loadTemplateById(id)).toBe(true);
    expect((get().config.pipeline.nodes[0].params as { expr: string }).expr).toBe('1');
    expect(get().history.past.length).toBe(0);
    expect(get().activeTemplateId).toBe(id);
    // 载入不存在的 id
    expect(get().loadTemplateById('nope')).toBe(false);
  });

  it('重命名 / 复制 / 删除', () => {
    const id = get().saveTemplate('原始');
    get().renameTemplate(id, '改名后');
    expect(get().templates[0].name).toBe('改名后');
    get().renameTemplate(id, '   '); // 空名忽略
    expect(get().templates[0].name).toBe('改名后');

    get().duplicateTemplate(id);
    expect(get().templates.length).toBe(2);
    expect(get().templates[1].name).toBe('改名后 副本');
    expect(get().templates[1].id).not.toBe(id);

    get().deleteTemplate(id);
    expect(get().templates.length).toBe(1);
    expect(get().activeTemplateId).toBe(null); // 删除当前项后脱离
  });

  it('newBlankWorkspace 清空工作区并脱离当前模板', () => {
    get().saveTemplate('X');
    get().newBlankWorkspace();
    expect(get().activeTemplateId).toBe(null);
    expect(get().config.pipeline.nodes.length).toBe(0);
  });
});
