import { useState } from 'react';
import { FormulaDisplay, useFormulaVariables } from '../../formula/FormulaInput';
import FormulaEditorModal from '../../formula/FormulaEditorModal';
import { FieldRow } from './controls';
import type { PipelineNode } from '../../types';

/**
 * 公式行（计算字段 / 派生列共用）：
 * 节点/抽屉内只做完整公式的只读高亮展示，点右侧 ƒx 按钮打开飞书式公式编辑弹窗。
 */
export default function FormulaRow({
  node,
  label,
  rowColumns,
  rowSample,
  setParam,
}: {
  node: PipelineNode;
  label: string;
  rowColumns?: { key: string; label: string }[];
  rowSample?: Record<string, unknown>;
  setParam: (patch: Record<string, unknown>) => void;
}) {
  const variables = useFormulaVariables(rowColumns);
  const [open, setOpen] = useState(false);
  const expr = String(node.params.expr ?? '');
  return (
    <>
      <FieldRow label={label}>
        <div className="flex min-w-0 items-start gap-1">
          <FormulaDisplay value={expr} variables={variables} />
          <button
            type="button"
            title="打开公式编辑面板"
            className="shrink-0 rounded border border-[var(--nb-control-border,#cbd2da)] bg-[var(--nb-control-bg,#ffffff)] px-1.5 py-[3px] text-[10px] font-semibold text-emerald-600 transition-colors hover:bg-[var(--nb-control-hover,#eef0f3)] dark:text-emerald-300"
            onClick={() => setOpen(true)}
          >
            ƒx
          </button>
        </div>
      </FieldRow>
      <FormulaEditorModal
        open={open}
        title={node.name}
        value={expr}
        rowColumns={rowColumns}
        rowSample={rowSample}
        onOk={(next) => setParam({ expr: next })}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
