import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '../useCanvasStore';

/**
 * 撤销/重做（config 快照历史）：
 * - mutateConfig 统一推栈，undo/redo 往返恢复
 * - 同 label 时间窗合并（连续输入不产生逐字符历史）
 * - transact 嵌套合并为一步
 * - 新修改清空 future
 */

const get = () => useCanvasStore.getState();

function reset(): void {
  const s = get();
  s.loadTemplate({
    ...s.config,
    pipeline: { nodes: [{ id: 'n1', type: 'formula', name: '计算字段', inputs: [], params: { expr: '1' }, enabled: true }] },
    dataSources: [],
    blocks: [],
    flowPos: {},
  });
}

describe('撤销/重做', () => {
  beforeEach(reset);

  it('undo 恢复修改前状态，redo 重做', () => {
    const id = get().config.pipeline.nodes[0].id;
    get().updateNode(id, { params: { expr: '2' } });
    expect(get().config.pipeline.nodes[0].params.expr).toBe('2');
    expect(get().history.past.length).toBe(1);

    get().undo();
    expect(get().config.pipeline.nodes[0].params.expr).toBe('1');
    expect(get().history.future.length).toBe(1);

    get().redo();
    expect(get().config.pipeline.nodes[0].params.expr).toBe('2');
  });

  it('节点移动可撤销', () => {
    const id = get().config.pipeline.nodes[0].id;
    get().setFlowPos(id, { x: 100, y: 200 });
    expect(get().config.flowPos?.[id]).toEqual({ x: 100, y: 200 });
    get().undo();
    expect(get().config.flowPos?.[id]).toBeUndefined();
  });

  it('同 label 时间窗合并（连续输入 = 一步撤销）', () => {
    get().updateSource('ds_x', {});
    // 伪造一个表单源再连续改三次
    get().loadTemplate({
      ...get().config,
      dataSources: [{ id: 'ds1', name: '参数', kind: 'form', entries: [{ key: 'a', value: '1' }] }],
    });
    get().updateSource('ds1', { entries: [{ key: 'a', value: '12' }] });
    get().updateSource('ds1', { entries: [{ key: 'a', value: '123' }] });
    get().updateSource('ds1', { entries: [{ key: 'a', value: '1234' }] });
    // loadTemplate 清史后，三次连续 updateSource 合并为 1 步
    expect(get().history.past.length).toBe(1);
    get().undo();
    expect((get().config.dataSources[0] as { entries: { value: string }[] }).entries[0].value).toBe('1');
  });

  it('transact：多次修改合并为一步', () => {
    const id = get().config.pipeline.nodes[0].id;
    get().transact('group', () => {
      get().setFlowPos(id, { x: 10, y: 10 });
      get().updateNode(id, { params: { expr: '9' } });
    });
    expect(get().history.past.length).toBe(1);
    get().undo();
    expect(get().config.pipeline.nodes[0].params.expr).toBe('1');
    expect(get().config.flowPos?.[id]).toBeUndefined();
  });

  it('新修改清空 future', () => {
    const id = get().config.pipeline.nodes[0].id;
    get().updateNode(id, { params: { expr: '2' } });
    get().undo();
    expect(get().history.future.length).toBe(1);
    get().updateNode(id, { params: { expr: '3' } });
    expect(get().history.future.length).toBe(0);
  });

  it('历史上限 50', () => {
    const id = get().config.pipeline.nodes[0].id;
    for (let i = 0; i < 60; i += 1) {
      get().transact(`op${i}`, () => get().updateNode(id, { name: `v${i}` }));
    }
    expect(get().history.past.length).toBe(50);
  });

  it('loadTemplate / applyPreset 清空历史', () => {
    const id = get().config.pipeline.nodes[0].id;
    get().updateNode(id, { params: { expr: '2' } });
    expect(get().history.past.length).toBe(1);
    get().loadTemplate(get().config);
    expect(get().history.past.length).toBe(0);
    expect(get().history.future.length).toBe(0);
  });
});
