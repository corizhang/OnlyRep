import { useRef } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { CANVAS_PRESETS } from '../defaults';
import { downloadCanvasTemplate, validateCanvasTemplate } from '../template';
import { THEME_LIST } from '../../themes/themes';
import { Btn, ColorInput, Field, NumberInput, Section, Select, TextInput } from './ui';
import { useState } from 'react';

/** 画布级基础配置（PRD R4-10 / K9）：主题、宽度、字号、涨跌语义、模板存取 */
export default function CanvasSettings() {
  const config = useCanvasStore((s) => s.config);
  const patch = useCanvasStore((s) => s.patchConfig);
  const applyPreset = useCanvasStore((s) => s.applyPreset);
  const loadTemplate = useCanvasStore((s) => s.loadTemplate);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <Section title="模板">
        <Field label="从模板开始">
          <Select
            value=""
            placeholder="选择内置模板…"
            options={CANVAS_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => {
              if (v) applyPreset(v);
            }}
          />
        </Field>
        <div className="flex flex-wrap gap-1">
          <Btn size="xs" onClick={() => downloadCanvasTemplate(config)}>
            导出模板 JSON
          </Btn>
          <Btn size="xs" onClick={() => fileRef.current?.click()}>
            导入模板
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const json = JSON.parse(await f.text());
                loadTemplate(validateCanvasTemplate(json));
                setMsg('模板已载入，请重新导入数据文件');
              } catch (err) {
                setMsg(err instanceof Error ? err.message : '模板解析失败');
              }
              e.target.value = '';
            }}
          />
        </div>
        {msg && <p className="text-[11.5px] text-amber-600">{msg}</p>}
        <p className="text-[11.5px] text-slate-400">
          模板含数据源定义、处理步骤、绑定与手填数据；导入源的文件不会保存。
        </p>
      </Section>

      <Section title="画布">
        <Field label="标题（导出文件名用）">
          <TextInput value={config.title} onChange={(v) => patch({ title: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="宽度 px">
            <Select
              value={String(config.width)}
              options={[
                { value: '900', label: '900（推荐）' },
                { value: '860', label: '860' },
                { value: '750', label: '750' },
              ]}
              onChange={(v) => patch({ width: Number(v) })}
            />
          </Field>
          <Field label="基准字号">
            <NumberInput value={config.baseFontSize} min={10} max={24} onChange={(v) => patch({ baseFontSize: v })} />
          </Field>
          <Field label="内边距">
            <NumberInput value={config.padding} min={0} max={80} onChange={(v) => patch({ padding: v })} />
          </Field>
          <Field label="区块间距">
            <NumberInput value={config.gap} min={0} max={60} onChange={(v) => patch({ gap: v })} />
          </Field>
        </div>
        <Field label="主题">
          <div className="grid grid-cols-2 gap-1">
            {THEME_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => patch({ themeId: t.id })}
                className={`rounded border px-2 py-1 text-[12px] ${config.themeId === t.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                <span
                  className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ background: t.accent }}
                />
                {t.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="主题主色（留空跟随主题）">
          <ColorInput value={config.accentColor} onChange={(v) => patch({ accentColor: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="头部色带高度 px">
            <NumberInput
              value={config.headerHeight ?? 110}
              min={0}
              max={400}
              onChange={(v) => patch({ headerHeight: v })}
            />
          </Field>
          <Field label="头部背景（留空跟随主题）">
            <ColorInput value={config.headerBg ?? ''} onChange={(v) => patch({ headerBg: v })} />
          </Field>
        </div>
        <p className="text-[11.5px] text-slate-400">
          主题为「白底正文 + 彩色头部色带」；高度设 0 可隐藏色带（此时标题建议改深色）。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="涨色（默认红）">
            <ColorInput value={config.riseColor} onChange={(v) => patch({ riseColor: v })} />
          </Field>
          <Field label="跌色（默认绿）">
            <ColorInput value={config.fallColor} onChange={(v) => patch({ fallColor: v })} />
          </Field>
        </div>
      </Section>

      <Section title="导出">
        <Field label="倍率">
          <Select
            value={String(config.exportScale)}
            options={[
              { value: '1', label: '1x（快）' },
              { value: '2', label: '2x（推荐）' },
              { value: '4', label: '4x（高清）' },
            ]}
            onChange={(v) => patch({ exportScale: Number(v) as 1 | 2 | 4 })}
          />
        </Field>
        <p className="text-[11.5px] text-slate-400">图表使用 SVG 渲染，4x 导出依然清晰；导出时编辑框会自动隐藏。</p>
      </Section>
    </div>
  );
}
