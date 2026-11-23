import { useState } from 'react';
import { FieldRow, NInput, NSelect } from '../controls';
import type { NodeTypeDef } from '../types';

/**
 * 修数节点：调整单元格的值（数据清洗场景）
 * - 批量规则：满足条件的行，把目标列设为新值（{{列名}} 引用同行原值）
 * - 定点编辑：预览表双击某格直接改（按主键列定位行）
 */

interface Rule {
  matchCol: string;
  matchOp: string;
  matchVal: string;
  setCol: string;
  setVal: string;
}

interface Point {
  keyCol: string;
  key: string;
  col: string;
  value: string;
}

const OP_OPTIONS = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '非空' },
];

const newRule = (): Rule => ({ matchCol: '', matchOp: 'eq', matchVal: '', setCol: '', setVal: '' });

export const cellEditDef: NodeTypeDef = {
  type: 'cellEdit',
  label: '修数',
  icon: '✎',
  desc: '批量/定点修改单元格',
  hint: '修改单元格的值',
  needsTableInput: true,
  defaultParams: () => ({ edits: [], keyCol: '', pointEdits: [] }),
  Config: ({ node, cols, setParam }) => {
    const edits = (Array.isArray(node.params.edits) ? node.params.edits : []) as Rule[];
    const points = (Array.isArray(node.params.pointEdits) ? node.params.pointEdits : []) as Point[];
    const keyCol = String(node.params.keyCol ?? '');
    const [draftRule, setDraftRule] = useState<Rule>(newRule());

    const setEdits = (list: Rule[]): void => setParam({ edits: list });
    const setPoints = (list: Point[]): void => setParam({ pointEdits: list });

    const upd = (i: number, patch: Partial<Rule>): void => setEdits(edits.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    return (
      <>
        {/* 批量规则 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-ink-dim">批量规则</span>
            <span className="text-[10.5px] text-ink-faint">按顺序应用</span>
          </div>
          {edits.map((r, i) => (
            <div key={i} className="space-y-1 rounded-md border border-line bg-soft p-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10.5px] text-ink-faint">当</span>
                <NSelect value={r.matchCol} placeholder="列" options={cols} onChange={(v) => upd(i, { matchCol: v })} />
                <NSelect value={r.matchOp} options={OP_OPTIONS} onChange={(v) => upd(i, { matchOp: v })} />
                {!['empty', 'notEmpty'].includes(r.matchOp) && (
                  <NInput value={r.matchVal} placeholder="值" onChange={(v) => upd(i, { matchVal: v })} />
                )}
                <button type="button" className="ml-auto text-ink-faint hover:text-danger" onClick={() => setEdits(edits.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10.5px] text-ink-faint">设</span>
                <NSelect value={r.setCol} placeholder="目标列" options={cols} onChange={(v) => upd(i, { setCol: v })} />
                <span className="text-[10.5px] text-ink-faint">为</span>
                <NInput value={r.setVal} placeholder="新值，可用 {{列名}}" onChange={(v) => upd(i, { setVal: v })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEdits([...edits, newRule()])}
            className="w-full rounded-md border border-dashed border-line-strong py-1 text-[11.5px] text-ink-dim hover:border-brand-line hover:text-brand"
          >
            + 添加规则
          </button>
        </div>

        {/* 定点编辑（预览表双击加入） */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-ink-dim">定点修改</span>
            <span className="text-[10.5px] text-ink-faint">预览表双击单元格加入</span>
          </div>
          <FieldRow label="主键列">
            <NSelect value={keyCol} placeholder="用哪列定位行（如姓名/ID）" options={cols} onChange={(v) => setParam({ keyCol: v })} />
          </FieldRow>
          {points.length > 0 && (
            <div className="max-h-[140px] space-y-1 overflow-y-auto">
              {points.map((pt, i) => (
                <div key={i} className="flex items-center gap-1 rounded border border-line bg-soft px-1.5 py-1 text-[11px]">
                  <span className="truncate text-ink-dim" title={`${pt.keyCol}=${pt.key} · ${pt.col}`}>
                    {pt.key} 的 {pt.col} → <b className="text-ink">{pt.value}</b>
                  </span>
                  <button type="button" className="ml-auto text-ink-faint hover:text-danger" onClick={() => setPoints(points.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  },
};
