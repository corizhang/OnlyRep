import type { NodeTypeDef } from '../types';

/**
 * 合并（纵向堆叠）：把 2 张表按列并集拼成一张。
 * 典型场景：T 与 T-1 两份日报快照合并后做「较上日」分组差分。
 * 双输入节点：把两个上游节点的输出端口依次连到本节点。
 */
export const unionDef: NodeTypeDef = {
  type: 'union',
  label: '合并',
  icon: '∪',
  desc: '两张表纵向拼接',
  hint: '两表按列并集纵向堆叠',
  needsTableInput: true,
  maxInputs: 2,
  defaultParams: () => ({}),
  Config: () => (
    <p className="text-[10.5px] leading-snug text-[var(--nb-text-dim,#6b7280)]">
      双输入节点：从两个上游节点的右侧端口各连一条线到本节点（「2 入」即就绪）。列取并集，缺的列补空。
    </p>
  ),
};
