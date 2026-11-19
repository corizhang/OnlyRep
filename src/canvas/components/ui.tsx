import type { ReactNode } from 'react';
import { Button, Checkbox, Input, InputNumber, Select as AntSelect, Slider } from 'antd';

/**
 * 画布编辑器的通用表单控件（纯 Tailwind，不含业务逻辑）。
 * v3：Figma 风格——输入控件 variant="filled"（灰底无边框，聚焦出品牌蓝），
 * 支持 prefix 内嵌标签（X/Y/px/% 式），IconSegment 图标分段控件替代对齐类下拉。
 * 对外 API 保持兼容：prefix 可选，不传则与原样一致。
 */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11.5px] font-medium text-ink-dim">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-ink-faint">{hint}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 内嵌标签前缀（Figma 式：X / Y / % 等浅灰提示） */
  prefix?: ReactNode;
}) {
  return (
    <Input
      className="w-full"
      variant="filled"
      value={value}
      placeholder={placeholder}
      prefix={prefix ? <span className="mr-1 text-[11px] text-ink-faint">{prefix}</span> : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  prefix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 内嵌标签前缀（如 px / % / N） */
  prefix?: ReactNode;
}) {
  return (
    <InputNumber
      className="w-full"
      variant="filled"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step ?? 1}
      prefix={prefix ? <span className="mr-1 text-[11px] text-ink-faint">{prefix}</span> : undefined}
      onChange={(v) => onChange(typeof v === 'number' ? v : 0)}
    />
  );
}

export function Select({
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
  // 保持手写版语义：placeholder 是一个值为 '' 的真实选项（大量调用方依赖「空 = 未设置」）
  const merged = placeholder !== undefined ? [{ value: '', label: placeholder }, ...options] : options;
  return (
    <AntSelect
      className="w-full"
      variant="filled"
      value={value}
      options={merged}
      showSearch
      optionFilterProp="label"
      onChange={(v) => onChange(v as string)}
    />
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)}>{label}</Checkbox>;
}

export function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  return (
    <Input.TextArea
      ref={inputRef as never}
      className="resize-y font-mono text-[12.5px]"
      variant="filled"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        className="h-8 w-9 cursor-pointer rounded-md border border-line bg-soft p-0.5"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#3B82F6'}
        onChange={(e) => onChange(e.target.value)}
      />
      <Input
        className="w-full"
        variant="filled"
        value={value}
        placeholder="跟随主题"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Btn({
  children,
  onClick,
  tone = 'default',
  size = 'sm',
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'xs';
  title?: string;
  disabled?: boolean;
}) {
  // antd v6 按钮 API：color + variant（与手写版四种 tone 一一对应）
  const props: Record<string, unknown> = {
    default: { color: 'default', variant: 'outlined' },
    primary: { color: 'primary', variant: 'solid' },
    danger: { color: 'danger', variant: 'outlined' },
    ghost: { color: 'default', variant: 'text' },
  }[tone];
  return (
    <Button
      {...(props as object)}
      title={title}
      disabled={disabled}
      onClick={onClick}
      size={size === 'xs' ? 'small' : 'middle'}
    >
      {children}
    </Button>
  );
}

/** 滑杆（antd Slider 受控薄封装）：通用设置圆角等场景使用 */
export function SliderBar({
  value,
  onChange,
  min = 0,
  max = 24,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Slider
      className="flex-1"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(v) => onChange(v)}
      tooltip={{ formatter: (v) => `${v}px` }}
    />
  );
}

/**
 * 图标分段控件（Figma 对齐按钮组）：灰底圆角容器 + 单色图标，选中反白。
 * 用于对齐/方向等「一眼能看懂选项」的场景，替代下拉。
 */
export function IconSegment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; icon: ReactNode; title: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-soft p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex h-7 flex-1 items-center justify-center rounded text-[13px] transition-colors ${
              active ? 'bg-panel text-ink shadow-card' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

export function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3 last:border-b-0">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold tracking-wide text-ink">{title}</h2>
        {extra}
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones: Record<string, string> = {
    slate: 'bg-hover text-ink-dim',
    green: 'bg-ok-soft text-ok',
    amber: 'bg-warn-soft text-warn',
    red: 'bg-danger-soft text-danger',
    blue: 'bg-brand-soft text-brand',
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${tones[tone]}`}>{children}</span>;
}
