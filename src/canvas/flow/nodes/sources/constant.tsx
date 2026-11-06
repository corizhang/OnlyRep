import { useCanvasStore } from '../../../../store/useCanvasStore';
import { FieldRow, NInput } from '../controls';
import type { SourceKindDef } from '../types';
import type { ConstantDataSource } from '../../../types';

/** 常量数据源：单个数值（以数据源名作为变量名） */
export const constantSourceDef: SourceKindDef = {
  kind: 'constant',
  label: '常量',
  desc: '单个数值',
  icon: 'π',
  Config: ({ srcDef }) => {
    const def = srcDef as ConstantDataSource;
    const updateSource = useCanvasStore((s) => s.updateSource);
    return (
      <div className="no-drag">
        <FieldRow label="常量值">
          <NInput value={def.value} onChange={(v) => updateSource(def.id, { value: v })} />
        </FieldRow>
      </div>
    );
  },
};
