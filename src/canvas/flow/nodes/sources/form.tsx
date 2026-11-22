import { useCanvasStore } from '../../../../store/useCanvasStore';
import { NBtn, NInput } from '../controls';
import type { SourceKindDef } from '../types';
import type { FormDataSource } from '../../../types';

/** 表单数据源：名称 + 数值的口径参数（参数名即公式变量名） */
export const formSourceDef: SourceKindDef = {
  kind: 'form',
  label: '表单',
  desc: '名称 + 数值口径参数',
  icon: '≡',
  Config: ({ srcDef }) => {
    const def = srcDef as FormDataSource;
    return <FormConfig def={def} />;
  },
};

function FormConfig({ def }: { def: FormDataSource }) {
  const updateSource = useCanvasStore((s) => s.updateSource);
  const entries = def.entries;
  return (
    <div className="no-drag space-y-1">
      {entries.map((e, i) => (
        <div key={i} className="flex gap-1">
          <NInput className="w-[42%]" value={e.key} placeholder="参数名" ariaLabel="参数名" onChange={(value) => updateSource(def.id, { entries: entries.map((x, j) => (j === i ? { ...x, key: value } : x)) })} />
          <NInput className="min-w-0 flex-1" value={e.value} placeholder="参数值" ariaLabel="参数值" onChange={(value) => updateSource(def.id, { entries: entries.map((x, j) => (j === i ? { ...x, value } : x)) })} />
          <button
            type="button"
            aria-label={`删除参数 ${e.key || i + 1}`}
            title="删除参数"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] text-[var(--nb-text-faint,#9ca3af)] hover:bg-red-500/10 hover:text-[var(--nb-err,#dc2626)]"
            onClick={() => updateSource(def.id, { entries: entries.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <NBtn onClick={() => updateSource(def.id, { entries: [...entries, { key: '', value: '' }] })}>+ 添加参数</NBtn>
      <p className="text-[10.5px] leading-relaxed text-[var(--nb-text-faint,#9ca3af)]">参数名会作为公式变量名使用，例如「已完成」或「全年目标」。</p>
    </div>
  );
}
