import { useState } from 'react';
import { useRankStore } from '../store/useRankStore';
import { THEME_LIST } from '../themes/themes';
import { E8_MSG, normalizeImage } from '../utils/image';
import type { ThemeId } from '../types';

/**
 * 视觉设置（R5 系列）。缩略图按钮用 inline style 展示主题底色；
 * 海报区视觉参数全部经 config → PreviewBoard 的 inline style 生效。
 * 图片压缩逻辑与图片区块共用 utils/image.ts。
 */
export default function VisualPanel() {
  const config = useRankStore((s) => s.config);
  const patchConfig = useRankStore((s) => s.patchConfig);
  const [imgHint, setImgHint] = useState('');
  const [imgError, setImgError] = useState('');

  const input = 'w-full rounded border border-slate-300 px-2 py-1 text-xs';
  const label = 'mb-1 block font-medium text-slate-600';

  const onImageFile = async (file: File | undefined): Promise<void> => {
    setImgError('');
    setImgHint('');
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setImgError('仅支持 jpg / png 图片');
      return;
    }
    try {
      const { dataUrl, compressed } = await normalizeImage(file);
      patchConfig({ backgroundImage: dataUrl });
      if (compressed) setImgHint(E8_MSG);
    } catch {
      setImgError('图片读取失败，请重试');
    }
  };

  return (
    <div className="space-y-3 text-xs">
      {/* 主题（R5-01） */}
      <div>
        <span className={label}>主题</span>
        <div className="grid grid-cols-4 gap-2">
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => patchConfig({ themeId: t.id as ThemeId, overlayColor: '' })}
              className={`overflow-hidden rounded-lg border-2 text-center ${
                config.themeId === t.id ? 'border-blue-500' : 'border-transparent'
              }`}
              title={t.name}
            >
              <div className="w-full">
                <div style={{ background: t.headerBg || t.accent, height: 14 }} />
                <div style={{ background: t.pageBg, height: 22 }} />
              </div>
              <div className="bg-white py-0.5 text-slate-600">{t.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 背景图（R5-02） */}
      <div>
        <span className={label}>背景图</span>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => {
              void onImageFile(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="w-full text-slate-500"
          />
          {config.backgroundImage && (
            <button
              type="button"
              onClick={() => patchConfig({ backgroundImage: null })}
              className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-slate-500 hover:border-red-300 hover:text-red-600"
            >
              移除
            </button>
          )}
        </div>
        {imgHint && <div className="mt-1 text-amber-600">{imgHint}</div>}
        {imgError && <div className="mt-1 text-red-600">{imgError}</div>}
      </div>

      {config.backgroundImage && (
        <>
          <label className="block">
            <span className={label}>填充方式</span>
            <select
              value={config.bgFill}
              onChange={(e) =>
                patchConfig({ bgFill: e.target.value as 'cover' | 'stretch' | 'center' })
              }
              className={input}
            >
              <option value="cover">裁剪</option>
              <option value="stretch">拉伸</option>
              <option value="center">居中</option>
            </select>
          </label>
          <label className="block">
            <span className={label}>
              遮罩透明度 {Math.round(config.overlayOpacity * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.overlayOpacity}
              onChange={(e) => patchConfig({ overlayOpacity: Number(e.target.value) })}
              className="w-full"
            />
          </label>
        </>
      )}

      {/* 主色微调（R5-03） */}
      <div>
        <span className={label}>主色（徽章 / 进度条）</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.accentColor || '#2563eb'}
            onChange={(e) => patchConfig({ accentColor: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-slate-300"
          />
          {config.accentColor && (
            <button
              type="button"
              onClick={() => patchConfig({ accentColor: '' })}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-500"
            >
              跟随主题
            </button>
          )}
        </div>
      </div>

      {/* 排版参数（R5-04） */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={label}>字号</span>
          <select
            value={config.fontSize}
            onChange={(e) =>
              patchConfig({ fontSize: e.target.value as 'small' | 'medium' | 'large' })
            }
            className={input}
          >
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>行高密度</span>
          <select
            value={config.lineHeight}
            onChange={(e) =>
              patchConfig({ lineHeight: e.target.value as 'compact' | 'normal' | 'loose' })
            }
            className={input}
          >
            <option value="compact">紧凑</option>
            <option value="normal">标准</option>
            <option value="loose">宽松</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className={label}>卡片圆角 {config.borderRadius}px</span>
        <input
          type="range"
          min={0}
          max={24}
          step={1}
          value={config.borderRadius}
          onChange={(e) => patchConfig({ borderRadius: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={config.zebra}
          onChange={(e) => patchConfig({ zebra: e.target.checked })}
        />
        斑马纹
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={config.showMedal}
          onChange={(e) => patchConfig({ showMedal: e.target.checked })}
        />
        Top3 显示奖牌/皇冠图标
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={config.dimTop10Outside}
          onChange={(e) => patchConfig({ dimTop10Outside: e.target.checked })}
        />
        Top10 外灰度弱化
      </label>
    </div>
  );
}
