import { describe, expect, it } from 'vitest';
import { humanizeNodeTypes, humanizeNodeIds, humanizeParams, humanizeReply } from '../ai/humanize';
import { NODE_TYPE_LABELS } from '../flow/nodes';
import { createDefaultCanvasConfig } from '../defaults';

describe('AI 回答人性化', () => {
  it('节点类型中文化', () => {
    const out = humanizeNodeTypes('挂一个 cellEdit 节点，再接 filter');
    expect(out).toContain('修数节点（cellEdit）');
    expect(out).toContain('筛选节点（filter）');
  });

  it('不重复包裹已写全的形式', () => {
    const out = humanizeNodeTypes('修数节点（cellEdit）');
    expect(out.match(/修数节点/g)).toHaveLength(1);
  });

  it('节点 id 映射用户命名', () => {
    const cfg = createDefaultCanvasConfig();
    cfg.pipeline.nodes = [
      { id: 'n_branch', type: 'groupAgg', name: '分行汇总', inputs: [], params: {}, enabled: true },
      { id: 'n_ds_123', type: 'source', name: '国庆明细', inputs: [], params: {}, enabled: true },
    ];
    const out = humanizeNodeIds('把 n_branch 的输出行接到 n_ds_123 下游', cfg);
    expect(out).toContain('「分行汇总」');
    expect(out).toContain('「国庆明细」');
    expect(out).not.toContain('n_branch');
  });

  it('反引号参数 key 中文化', () => {
    expect(humanizeParams('`dim` 填分行')).toContain('`分组维度（dim）`');
  });

  it('总链路组合', () => {
    const cfg = createDefaultCanvasConfig();
    cfg.pipeline.nodes = [{ id: 'n_branch', type: 'groupAgg', name: '分行汇总', inputs: [], params: {}, enabled: true }];
    const out = humanizeReply('把 n_branch 后面接 diff，`col` 填达标次数', cfg);
    expect(out).toContain('「分行汇总」');
    expect(out).toContain(`${NODE_TYPE_LABELS.diff}节点（diff）`);
    expect(out).toContain('`目标列（col）`');
  });
});
