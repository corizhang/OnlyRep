import { Modal } from 'antd';
import { FileAddOutlined, UploadOutlined } from '@ant-design/icons';
import { useRef } from 'react';
import { CANVAS_PRESETS } from '../defaults';
import { useCanvasStore } from '../../store/useCanvasStore';

/**
 * 新建项目面板（启动页「新建项目」）：
 * 空白项目 / 导入 .rkb / 官方模板 / 我的模板（模板库）。
 * 选模板 → 载入为新项目（数据源填充引导自动接管）。
 */
export default function NewProjectModal({ open, onClose, onEnter }: { open: boolean; onClose: () => void; onEnter: () => void }) {
  const templates = useCanvasStore((s) => s.templates);
  const loadTemplateById = useCanvasStore((s) => s.loadTemplateById);
  const applyPreset = useCanvasStore((s) => s.applyPreset);
  const resetCanvas = useCanvasStore((s) => s.resetCanvas);
  const importProjectFile = useCanvasStore((s) => s.importProjectFile);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (fn: () => void): void => {
    fn();
    onClose();
    onEnter();
  };

  return (
    <Modal title="新建项目" open={open} onCancel={onClose} footer={null} width={560} destroyOnHidden>
      <input
        ref={fileRef}
        type="file"
        accept=".rkb,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const name = await importProjectFile(await f.text());
          if (name) {
            onClose();
            onEnter();
          } else {
            window.alert('文件不是有效的 RankBoard 项目（.rkb）');
          }
        }}
      />
      <div className="space-y-4">
        {/* 主操作卡 */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => pick(() => resetCanvas())}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-brand bg-brand-soft/40 px-4 py-5 transition-colors hover:bg-brand-soft"
          >
            <span className="text-[22px] text-brand">＋</span>
            <span className="text-[13px] font-medium text-ink">空白项目</span>
            <span className="text-[11px] text-ink-faint">从零开始搭建</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-lg border border-line bg-panel px-4 py-5 transition-colors hover:border-line-strong hover:bg-hover"
          >
            <UploadOutlined style={{ fontSize: 22 }} className="text-ink-dim" />
            <span className="text-[13px] font-medium text-ink">导入项目文件</span>
            <span className="text-[11px] text-ink-faint">.rkb（含数据，拷来的直接能用）</span>
          </button>
        </div>

        {/* 官方模板 */}
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-dim">官方模板</div>
          <div className="grid grid-cols-2 gap-2">
            {CANVAS_PRESETS.map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => pick(() => applyPreset(pr.id))}
                className="rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/40"
              >
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  <FileAddOutlined className="text-brand" style={{ fontSize: 12 }} />
                  {pr.name}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-ink-faint">{pr.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 我的模板 */}
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-dim">我的模板</div>
          {templates.length === 0 ? (
            <p className="rounded-md bg-soft px-3 py-3 text-[11.5px] text-ink-faint">
              还没有保存的模板。搭好一份日报后在「模板库」保存，这里就会出现。
            </p>
          ) : (
            <div className="grid max-h-[200px] grid-cols-2 gap-2 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(() => loadTemplateById(t.id))}
                  className="rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/40"
                >
                  <div className="truncate text-[12.5px] font-medium text-ink">{t.name}</div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    {t.config.blocks.length} 个区块 · 更新于 {new Date(t.updatedAt).toLocaleDateString('zh-CN')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
