import type { ReactNode } from 'react';
import { Button, Checkbox, Input, InputNumber, Select as AntSelect, Slider } from 'antd';

/**
 * 画布编辑器的通用表单控件（纯 Tailwind，不含业务逻辑）。
 * v2.1：内部实现切换为 antd（按需引入），对外 API 与手写版完全一致，调用方零改动。
 * 密度基线：控件高 32px（ConfigProvider controlHeight）、主力字号 13px（fontSize token）。
 */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[12px] font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-slate-400">{hint}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return <Input className="w-full" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <InputNumber
      className="w-full"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step ?? 1}
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
        className="h-8 w-9 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#3B82F6'}
        onChange={(e) => onChange(e.target.value)}
      />
      <Input className="w-full" value={value} placeholder="跟随主题" onChange={(e) => onChange(e.target.value)} />
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

export function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <h2 className="text-[12px] font-medium tracking-wide text-slate-500">{title}</h2>
        {extra}
      </header>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${tones[tone]}`}>{children}</span>;
}
