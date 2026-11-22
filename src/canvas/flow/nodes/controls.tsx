import { Button, Checkbox, Input, InputNumber, Select } from 'antd';

/**
 * 节点内控件（antd 紧凑实现）：
 * - 主题由上下文 ConfigProvider 决定——节点内是 FlowNodeCard 的嵌套暗色/浅色主题，
 *   右侧抽屉是 App 全局浅色主题，同一套组件两处复用。
 * - 文字色用 var(--nb-*)，带浅色兜底（抽屉上下文没有注入 --nb-* 变量）。
 */

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-[11px] leading-5 text-[var(--nb-text-dim,#64748b)]" title={label}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** 未接表格上游的提示（needsTableInput 节点通用） */
export function NoTableHint() {
  return (
    <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-[var(--nb-warn,#b45309)]">
      等待表格输入。连接一个数据源或上游处理节点后，即可配置列。
    </p>
  );
}

export function NSelect({
  value,
  onChange,
  options,
  placeholder,
  className = 'w-full min-w-0',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select
      size="small"
      className={className}
      aria-label={placeholder ?? '选择值'}
      value={value === '' ? undefined : value}
      placeholder={placeholder}
      options={options}
      onChange={(v) => onChange(v ?? '')}
    />
  );
}

export function NInput({ value, onChange, placeholder, ariaLabel, className }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string; className?: string }) {
  return <Input size="small" className={className} value={value} placeholder={placeholder} aria-label={ariaLabel ?? placeholder ?? '输入值'} onChange={(e) => onChange(e.target.value)} />;
}

export function NNum({ value, min = 0, onChange, ariaLabel }: { value: number; min?: number; onChange: (v: number) => void; ariaLabel?: string }) {
  return <InputNumber size="small" className="w-full" aria-label={ariaLabel ?? '数值'} value={Number.isFinite(value) ? value : 0} min={min} onChange={(v) => onChange(Math.max(min, v ?? 0))} />;
}

export function NCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)}>
      <span className="text-[11px] text-[var(--nb-text,#1f2937)]">{label}</span>
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
    <Button size="small" type={tone === 'primary' ? 'primary' : 'default'} danger={tone === 'danger'} title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
