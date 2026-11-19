import { useRef, useState } from 'react';
import { useRankStore } from '../store/useRankStore';

/**
 * 拖拽 / 点击 / 粘贴三通道导入区（R1-01/02）。
 * 粘贴走全局 paste 事件（main.tsx 注册），此处只承载文件入口与进度/提示。
 */
export default function ImportZone() {
  const loadFile = useRankStore((s) => s.loadFile);
  const parseProgress = useRankStore((s) => s.parseProgress);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsing = parseProgress > 0 && parseProgress < 100;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void loadFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
        hover
          ? 'border-brand bg-brand-soft'
          : 'border-line-strong bg-panel hover:border-brand-line hover:bg-hover'
      }`}
    >
      <div className="text-base font-medium text-ink">
        拖入 Excel/CSV，或直接 Ctrl+V 粘贴表格
      </div>
      <div className="mt-2 text-xs text-ink-faint">
        支持 .xlsx / .xls / .csv，数据仅在本地解析，不会上传
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        className="mt-5 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        点击选择文件
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />

      {parsing && (
        <div className="mt-6 w-full max-w-sm">
          <div className="mb-1 text-xs text-ink-dim">数据量较大，解析中… {parseProgress}%</div>
          <div className="h-2 overflow-hidden rounded-full bg-base">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
