import { Input } from 'antd';
import { useCanvasStore } from '../../../../store/useCanvasStore';
import { NBtn } from '../controls';
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
          <Input
            size="small"
            className="w-[42%]"
            value={e.key}
            placeholder="名称"
            onChange={(ev) => updateSource(def.id, { entries: entries.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)) })}
          />
          <Input
            size="small"
            className="min-w-0 flex-1"
            value={e.value}
            placeholder="数值"
            onChange={(ev) => updateSource(def.id, { entries: entries.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) })}
          />
          <button
            type="button"
            className="px-0.5 text-[11px] text-[var(--nb-text-faint,#9ca3af)] hover:text-[var(--nb-err,#dc2626)]"
            onClick={() => updateSource(def.id, { entries: entries.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <NBtn onClick={() => updateSource(def.id, { entries: [...entries, { key: '', value: '' }] })}>+ 添加参数</NBtn>
      <p className="text-[10px] leading-snug text-[var(--nb-text-faint,#9ca3af)]">参数名即公式变量名，如「已完成/全年目标」。</p>
    </div>
  );
}
