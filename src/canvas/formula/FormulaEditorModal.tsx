import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import FormulaInput, { useFormulaVariables } from './FormulaInput';

/**
 * 公式编辑弹窗（飞书/Notion 式）：
 * 节点内地方太小，公式在节点内只做只读展示（FormulaDisplay），
 * 点 ƒx 按钮打开本弹窗编辑：大输入区 + 默认展开的变量/函数面板 + 实时预览。
 * 通过 createPortal 渲染到 body，避免画布 zoom/transform 影响 fixed 定位。
 */
export default function FormulaEditorModal({
  open,
  title,
  value,
  rowColumns,
  rowSample,
  onOk,
  onClose,
}: {
  open: boolean;
  title: string;
  value: string;
  /** 行公式场景的上游列（derive） */
  rowColumns?: { key: string; label: string }[];
  /** 行公式预览样本 */
  rowSample?: Record<string, unknown>;
  onOk: (expr: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const variables = useFormulaVariables(rowColumns);

  // 每次打开时以当前公式为草稿起点
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[82vh] w-[720px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
          <span className="text-[13px] font-semibold text-slate-800">编辑公式</span>
          <span className="min-w-0 truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500" title={title}>
            {title}
          </span>
          <button type="button" className="ml-auto rounded px-1.5 text-[16px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onClose} title="关闭（Esc）">
            ×
          </button>
        </div>

        {/* 公式输入区 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FormulaInput value={draft} onChange={setDraft} variables={variables} rowSample={rowSample} multiline defaultExpanded placeholder="输入公式，如：ROUND((年绑卡指标-累计完成绑卡人数)/剩余日期, 2)" />
          <p className="mt-2 text-[10.5px] text-slate-400">
            支持四则运算、比较、ROUND/DAYS/IF 等函数；变量可从中英/拼音输入补全，点击右侧变量或函数插入。
          </p>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2.5">
          <span className="text-[11px] text-slate-400">修改会先以草稿预览，点「保存」后应用并重新计算。</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700"
              onClick={() => {
                onOk(draft);
                onClose();
              }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
