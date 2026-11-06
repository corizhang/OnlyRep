import { useCanvasStore } from '../../store/useCanvasStore';
import { Field, TextInput } from '../components/ui';
import { NoTableHint } from './nodes/controls';
import { stepDef } from './nodes';
import type { PipelineNode } from '../types';

/**
 * 右侧详情抽屉的节点配置区。
 * 与节点内嵌配置共用注册表里的同一个 Config 组件（避免两套实现漂移）；
 * 本文件只额外提供「显示名」字段与上游列推导。
 */

// 兼容既有导入（徽标名/聚合文案的单一事实来源在 flow/nodes）
export { AGG_LABELS, NODE_TYPE_LABELS } from './nodes';

export default function NodeFields({ node, cols }: { node: PipelineNode; cols: { value: string; label: string }[] }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const outputs = useCanvasStore((s) => s.outputs);
  const set = (patch: Partial<PipelineNode>): void => updateNode(node.id, patch);
  const setParam = (patch: Record<string, unknown>): void => set({ params: { ...node.params, ...patch } });

  const rowColumns = cols.map((c) => ({ key: c.value, label: c.label }));
  const upOutput = node.inputs[0] ? outputs[node.inputs[0]] : undefined;
  const rowSample = upOutput && upOutput.kind === 'table' ? (upOutput.table.rows[0] as Record<string, unknown> | undefined) : undefined;

  const def = stepDef(node.type);

  return (
    <div className="space-y-1.5">
      <Field label="显示名" hint={node.type === 'scalarOut' || node.type === 'formula' ? '即公式里的变量名' : undefined}>
        <TextInput value={node.name} onChange={(v) => set({ name: v })} />
      </Field>

      {node.type === 'source' && <p className="text-[11.5px] text-slate-400">数据源的配置直接内嵌在画布节点上完成。</p>}

      {def && def.needsTableInput && cols.length === 0 && <NoTableHint />}
      {def && !(def.needsTableInput && cols.length === 0) && (
        <div className="no-drag space-y-1.5">
          <def.Config node={node} cols={cols} rowColumns={rowColumns} rowSample={rowSample} setParam={setParam} />
        </div>
      )}
    </div>
  );
}
