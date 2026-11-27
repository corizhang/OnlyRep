import { useRef, useState } from 'react';
import { Segmented, Select, Slider } from 'antd';
import { compressImageFile } from '../../utils/imageFile';
import { ColorInput } from './ui';

/**
 * 背景字段控件（头部色带/页面底共用）：颜色 | 图片 分段。
 * 图片模式：上传（自动压缩）/预览/填充方式/蒙版（颜色+透明度）/清除。
 */

export interface BgValue {
  color: string;
  image: string;
  fit: 'cover' | 'contain' | 'repeat';
  overlay: string;
  overlayOpacity: number;
}

interface BgImageFieldProps {
  value: BgValue;
  onPatch: (patch: Partial<Record<'color' | 'image' | 'fit' | 'overlay' | 'overlayOpacity', string | number>>) => void;
}

const FIT_OPTIONS = [
  { value: 'cover', label: '铺满裁切' },
  { value: 'contain', label: '完整适应' },
  { value: 'repeat', label: '平铺' },
];

export default function BgImageField({ value, onPatch }: BgImageFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 模式是本地状态：切「颜色」不清图（图仍在配置里），切回「图片」原图原设置直接回来；
  // 有图时默认停在图片模式；外部清图（点「清除」）则跟随回颜色模式
  const [mode, setMode] = useState<'color' | 'image'>(value.image ? 'image' : 'color');
  const lastImage = useRef(value.image);
  if (value.image !== lastImage.current) {
    lastImage.current = value.image;
    if (value.image && mode !== 'image') setMode('image');
    if (!value.image && mode === 'image') setMode('color');
  }

  const pick = async (f: File): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const res = await compressImageFile(f);
      onPatch({ image: res.dataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片处理失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Segmented
        size="small"
        value={mode}
        onChange={(m) => setMode(m as 'color' | 'image')}
        options={[
          { value: 'color', label: '颜色' },
          { value: 'image', label: value.image ? '图片 ✓' : '图片' },
        ]}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />

      {mode === 'color' && <ColorInput value={value.color} onChange={(v: string) => onPatch({ color: v })} />}

      {mode === 'image' && !value.image && (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-line-strong bg-soft text-ink-dim hover:border-brand-line hover:text-brand disabled:opacity-50"
        >
          <span className="text-[13px]">{busy ? '压缩中…' : '＋ 选择图片'}</span>
          <span className="text-[10px] text-ink-faint">≤5MB，自动压缩</span>
        </button>
      )}
      {mode === 'image' && value.image && (
        <div className="space-y-2 rounded-md border border-line bg-soft p-2">
          <div className="flex items-center gap-2">
            <div className="h-12 w-20 shrink-0 overflow-hidden rounded border border-line bg-panel">
              {value.image && <img src={value.image} alt="背景预览" className="h-full w-full object-cover" />}
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="rounded border border-line bg-panel px-2 py-0.5 text-[11.5px] text-ink-dim hover:border-brand-line hover:text-brand disabled:opacity-50"
              >
                {busy ? '压缩中…' : '更换图片'}
              </button>
              <button
                type="button"
                onClick={() => onPatch({ image: '' })}
                className="rounded px-2 py-0.5 text-[11.5px] text-ink-faint hover:text-danger"
              >
                清除图片
              </button>
            </div>
            <span className="ml-auto text-[10px] text-ink-faint">{(value.image.length / 1024).toFixed(0)} KB</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-ink-dim">填充</span>
            <Select size="small" value={value.fit} onChange={(v: 'cover' | 'contain' | 'repeat') => onPatch({ fit: v })} options={FIT_OPTIONS} className="flex-1" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-ink-dim">蒙版</span>
            <div className="w-24 shrink-0">
              <ColorInput value={value.overlay} onChange={(v: string) => onPatch({ overlay: v })} />
            </div>
            <Slider
              className="min-w-0 flex-1"
              min={0}
              max={100}
              value={Math.round((value.overlayOpacity ?? 0.4) * 100)}
              onChange={(v: number | number[]) => onPatch({ overlayOpacity: (Array.isArray(v) ? v[0] : v) / 100 })}
              tooltip={{ formatter: (v) => `${v}%` }}
            />
          </div>
          <p className="text-[10px] leading-snug text-ink-faint">蒙版留空则不加罩层；深图上压深字看不清时，蒙版选黑、透明度 40% 左右最稳。</p>
        </div>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
