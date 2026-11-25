import { describe, expect, it } from 'vitest';
import { applyPatchOps, parsePatch, canvasSummary } from '../ai/patch';
import { createDefaultCanvasConfig, createBlock } from '../defaults';

const base = () => {
  const c = createDefaultCanvasConfig();
  c.title = '旧标题';
  c.blocks = [createBlock('text'), createBlock('kpiCard')];
  return c;
};

describe('AI 增量 patch', () => {
  it('setTitle / setTheme / updateCanvas', () => {
    const c = applyPatchOps(base(), [
      { op: 'setTitle', title: '新标题' },
      { op: 'setTheme', accentColor: '#ff0000' },
      { op: 'updateCanvas', patch: { width: 900 } },
    ]);
    expect(c.title).toBe('新标题');
    expect(c.accentColor).toBe('#ff0000');
    expect(c.width).toBe(900);
  });

  it('updateBlock 合并配置（含容器内块）', () => {
    const b = base();
    const kpiId = b.blocks[1].id;
    const c = applyPatchOps(b, [{ op: 'updateBlock', id: kpiId, config: { label: '公众号新增' } }]);
    expect((c.blocks[1].config as unknown as { label: string }).label).toBe('公众号新增');
  });

  it('addBlock 默认追加 / afterId 插入；removeBlock 删除', () => {
    const b = base();
    const chart = createBlock('chart');
    const c = applyPatchOps(b, [
      { op: 'addBlock', block: chart, afterId: b.blocks[0].id },
      { op: 'removeBlock', id: b.blocks[1].id },
    ]);
    expect(c.blocks).toHaveLength(2);
    expect(c.blocks[1].type).toBe('chart');
  });

  it('非法操作整体拒绝：找不到目标块', () => {
    expect(() => applyPatchOps(base(), [{ op: 'removeBlock', id: 'ghost' }])).toThrow('找不到块');
  });

  it('parsePatch 识别与非 patch 放行', () => {
    expect(parsePatch('{"action":"patch","summary":"改标题","ops":[{"op":"setTitle","title":"x"}]}')?.ops).toHaveLength(1);
    expect(parsePatch('{"action":"patch","ops":[]}')).toBeNull();
    expect(parsePatch('{"version":2,"blocks":[]}')).toBeNull();
    expect(parsePatch('随便聊聊')).toBeNull();
  });

  it('canvasSummary 带块 id 供 AI 引用', () => {
    const s = canvasSummary(base());
    expect(s).toContain('旧标题');
    expect(s).toContain('kpiCard');
    expect(s).toContain('id=');
  });
});

describe('管道节点 patch', () => {
  const withNodes = () => {
    const c = createDefaultCanvasConfig();
    c.pipeline.nodes = [
      { id: 'n_src', type: 'source', name: '数据', inputs: [], params: { sourceId: 'ds1' }, enabled: true },
      { id: 'n_filter', type: 'filter', name: '筛选', inputs: ['n_src'], params: { col: '渠道', op: 'contains', value: '公众号' }, enabled: true },
    ];
    return c;
  };

  it('updateNode 合并参数与改名', () => {
    const c = applyPatchOps(withNodes(), [{ op: 'updateNode', id: 'n_filter', params: { value: '短信' }, name: '只看短信' }]);
    const n = c.pipeline.nodes.find((x) => x.id === 'n_filter')!;
    expect(n.params.value).toBe('短信');
    expect(n.params.col).toBe('渠道'); // 未动字段保留
    expect(n.name).toBe('只看短信');
  });

  it('addNode afterId 插入并重接下游', () => {
    const c = applyPatchOps(withNodes(), [
      { op: 'addNode', node: { id: 'n_edit', type: 'cellEdit', name: '修数', inputs: [], params: { edits: [] }, enabled: true }, afterId: 'n_src' },
    ]);
    const edit = c.pipeline.nodes.find((x) => x.id === 'n_edit')!;
    const filter = c.pipeline.nodes.find((x) => x.id === 'n_filter')!;
    expect(edit.inputs).toEqual(['n_src']);
    expect(filter.inputs).toEqual(['n_edit']); // 原下游重接到新节点
  });

  it('removeNode 有依赖时拒绝', () => {
    expect(() => applyPatchOps(withNodes(), [{ op: 'removeNode', id: 'n_src' }])).toThrow('依赖');
    const c = applyPatchOps(withNodes(), [{ op: 'removeNode', id: 'n_filter' }]);
    expect(c.pipeline.nodes).toHaveLength(1);
  });
});
