import { Button, Checkbox, Input, InputNumber, Select } from 'antd';

/**
 * 节点内控件（antd 紧凑实现）：
 * - 主题由上下文 ConfigProvider 决定——节点内是 FlowNodeCard 的嵌套暗色/浅色主题，
 *   右侧抽屉是 App 全局浅色主题，同一套组件两处复用。
 * - 文字色用 var(--nb-*)，带浅色兜底（抽屉上下文没有注入 --nb-* 变量）。
 */

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[54px_1fr] items-center gap-1.5">
      <span className="truncate text-[10.5px] text-[var(--nb-text-dim,#64748b)]" title={label}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** 未接表格上游的提示（needsTableInput 节点通用） */
export function NoTableHint() {
  return (
    <p className="text-[10.5px] leading-snug text-[var(--nb-warn,#b45309)]">
      尚未连上表格节点：先把本节点接到数据源或上游表格之后，再配置列。
    </p>
  );
}

export function NSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select
      size="small"
      className="w-full min-w-0"
      value={value === '' ? undefined : value}
      placeholder={placeholder}
      options={options}
      onChange={(v) => onChange(v ?? '')}
    />
  );
}

export function NInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input size="small" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function NNum({ value, min = 0, onChange }: { value: number; min?: number; onChange: (v: number) => void }) {
  return <InputNumber size="small" className="w-full" value={Number.isFinite(value) ? value : 0} min={min} onChange={(v) => onChange(Math.max(min, v ?? 0))} />;
}

export function NCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)}>
      <span className="text-[10.5px] text-[var(--nb-text,#1f2937)]">{label}</span>
    </Checkbox>
  );
}

export function NBtn({
  children,
  onClick,
  tone = 'default',
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
  title?: string;
  disabled?: boolean;
}) {
  return (
    <Button size="small" type={tone === 'primary' ? 'primary' : 'default'} danger={tone === 'danger'} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
