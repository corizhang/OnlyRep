import type { DataSource, FieldBinding, NamedScalars, NodeOutput } from '../types';
import { formatResolved, resolveField } from '../binding/resolve';
import { defaultNumberFormat } from '../defaults';
import { Field, Select } from './ui';
import FormulaInput, { useFormulaVariables } from '../formula/FormulaInput';

/** 字段绑定选择器：变量 / 表单值 / 常量 / 现场公式（PRD R3-01） */

function encode(b: FieldBinding): string {
  switch (b.kind) {
    case 'none':
      return 'none';
    case 'node':
      return `node:${b.nodeRef}`;
    case 'form':
      return `form:${b.sourceRef}:${b.key}`;
    case 'constant':
      return `const:${b.sourceRef}`;
    case 'formula':
      return 'formula';
  }
}

function decode(v: string): FieldBinding {
  if (v === 'none') return { kind: 'none' };
  if (v === 'formula') return { kind: 'formula', expr: '' };
  const [kind, a, ...rest] = v.split(':');
  if (kind === 'node') return { kind: 'node', nodeRef: a };
  if (kind === 'form') return { kind: 'form', sourceRef: a, key: rest.join(':') };
  if (kind === 'const') return { kind: 'constant', sourceRef: a };
  return { kind: 'none' };
}

export default function BindingPicker({
  value,
  onChange,
  sources,
  graphNodes,
  outputs,
  env,
  label = '数值绑定',
}: {
  value: FieldBinding;
  onChange: (b: FieldBinding) => void;
  sources: DataSource[];
  graphNodes: { id: string; name: string; type: string }[];
  outputs: Record<string, NodeOutput>;
  env: NamedScalars;
  label?: string;
}) {
  const options = [
    { value: 'none', label: '不绑定' },
    ...graphNodes
      .filter((n) => {
        const o = outputs[n.id];
        return o && o.kind === 'scalar';
      })
      .map((n) => ({ value: `node:${n.id}`, label: `变量 · ${n.name}` })),
    ...sources
      .filter((s) => s.kind === 'form')
      .flatMap((s) =>
        s.kind === 'form' ? s.entries.filter((e) => e.key.trim() !== '').map((e) => ({ value: `form:${s.id}:${e.key}`, label: `表单 · ${e.key}` })) : [],
      ),
    ...sources.filter((s) => s.kind === 'constant').map((s) => ({ value: `const:${s.id}`, label: `常量 · ${s.name}` })),
    { value: 'formula', label: '公式…' },
  ];

  const resolved = resolveField(value, { outputs, env, sources });
  const preview = formatResolved(resolved, defaultNumberFormat());
  const variables = useFormulaVariables();

  return (
    <div className="space-y-1.5">
      <Field label={label}>
        <Select value={encode(value)} onChange={(v) => onChange(decode(v))} options={options} />
      </Field>
      {value.kind === 'formula' && (
        <FormulaInput
          value={value.expr}
          onChange={(expr) => onChange({ kind: 'formula', expr })}
          variables={variables}
          placeholder="如：已完成/全年目标"
        />
      )}
      <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
        <span>当前值</span>
        <span className={preview.state === 'ok' ? 'font-medium text-emerald-600' : 'text-amber-600'}>
          {preview.text}
          {preview.message ? `（${preview.message}）` : ''}
        </span>
      </div>
    </div>
  );
}
