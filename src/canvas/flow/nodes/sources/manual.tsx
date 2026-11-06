import { ManualEditor } from '../../../components/DataSourcePanel';
import type { SourceKindDef } from '../types';
import type { ManualTableDataSource } from '../../../types';

/** 手填表格数据源：可编辑网格（ManualEditor 为自包含浅色编辑器，两主题通用） */
export const manualSourceDef: SourceKindDef = {
  kind: 'manualTable',
  label: '手填表',
  desc: '可编辑网格',
  icon: '▦',
  Config: ({ srcDef }) => {
    const def = srcDef as ManualTableDataSource;
    return (
      <div className="no-drag rounded bg-[var(--nb-manual-bg,#ffffff)] p-1.5">
        <ManualEditor sourceId={def.id} columns={def.columns} rows={def.rows} />
      </div>
    );
  },
};
