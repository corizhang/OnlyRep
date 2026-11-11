import { useEffect, useState } from 'react';
import { Modal, Popconfirm, Tooltip } from 'antd';
import { CheckCircleFilled, CopyOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useCanvasStore } from '../../store/useCanvasStore';
import { templateSummary } from '../templateLibrary';

/**
 * 模板库面板（头部「模板库」按钮打开）：
 * 存档点模式——「保存当前」把工作区快照入库；库内条目可载入/重命名/复制/删除。
 * 载入前若当前工作区相对当前模板有未保存修改，先弹覆盖确认。
 */
export default function TemplateLibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const templates = useCanvasStore((s) => s.templates);
  const activeTemplateId = useCanvasStore((s) => s.activeTemplateId);
  const saveTemplate = useCanvasStore((s) => s.saveTemplate);
  const loadTemplateById = useCanvasStore((s) => s.loadTemplateById);
  const renameTemplate = useCanvasStore((s) => s.renameTemplate);
  const duplicateTemplate = useCanvasStore((s) => s.duplicateTemplate);
  const deleteTemplate = useCanvasStore((s) => s.deleteTemplate);
  const newBlankWorkspace = useCanvasStore((s) => s.newBlankWorkspace);
  const isTemplateDirty = useCanvasStore((s) => s.isTemplateDirty);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const dirty = isTemplateDirty();
  const active = templates.find((t) => t.id === activeTemplateId);

  // antd Modal 的 Esc 关闭只在焦点位于 wrap 内时生效；点过按钮后焦点回 body 会失效，
  // 残留的隐形遮罩会吃掉画布点击。这里兜底：打开期间全局 Esc 一律关闭本面板。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // 覆盖确认弹窗打开时，Esc 交给它处理，不连坐关本面板
      if (document.querySelector('.ant-modal-confirm')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const doLoad = (id: string): void => {
    if (dirty) {
      Modal.confirm({
        title: '当前工作区有未保存到模板的修改',
        content: '载入模板将覆盖当前工作区（未保存的修改会丢失），确定继续？',
        okText: '仍要载入',
        cancelText: '取消',
        onOk: () => {
          loadTemplateById(id);
          onClose();
        },
      });
    } else {
      loadTemplateById(id);
      onClose();
    }
  };

  return (
    <Modal title="模板库" open={open} onCancel={onClose} footer={null} width={520} destroyOnHidden>
      <div className="space-y-3">
        {/* 顶部：保存当前 + 新建空白 */}
        <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2">
          <button
            type="button"
            onClick={() => saveTemplate()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700"
          >
            {active ? `保存到「${active.name}」` : '保存当前工作区'}
          </button>
          {active && dirty && <span className="text-[11px] text-amber-600">● 有未保存修改</span>}
          {!active && <span className="text-[11px] text-slate-400">将存为新模板并设为当前</span>}
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm('当前工作区有未保存修改，新建空白将丢弃它们，继续？')) return;
              newBlankWorkspace();
              onClose();
            }}
            className="ml-auto rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50"
          >
            新建空白
          </button>
        </div>

        {/* 列表 */}
        {templates.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-slate-400">
            还没有模板。搭好一份日报后点上方「保存当前工作区」，下次一键切换。
          </p>
        ) : (
          <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
            {templates.map((t) => {
              const isActive = t.id === activeTemplateId;
              const renaming = renamingId === t.id;
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 ${isActive ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <FolderOpenOutlined className={isActive ? 'text-blue-500' : 'text-slate-300'} />
                  <div className="min-w-0 flex-1">
                    {renaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          renameTemplate(t.id, renameDraft);
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="w-full rounded border border-blue-400 px-1 py-px text-[12.5px] outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-slate-800">{t.name}</span>
                        {isActive && <CheckCircleFilled className="shrink-0 text-[11px] text-blue-500" />}
                        {isActive && dirty && <span className="shrink-0 text-[10.5px] text-amber-600">已修改</span>}
                      </div>
                    )}
                    <div className="mt-0.5 text-[10.5px] text-slate-400">
                      {templateSummary(t)} · {new Date(t.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => doLoad(t.id)}
                      className={`rounded px-2 py-1 text-[11.5px] font-medium ${isActive ? 'text-slate-400' : 'text-blue-600 hover:bg-blue-50'}`}
                      disabled={isActive && !dirty}
                    >
                      {isActive ? (dirty ? '还原' : '当前') : '载入'}
                    </button>
                    <Tooltip title="重命名">
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        onClick={() => {
                          setRenamingId(t.id);
                          setRenameDraft(t.name);
                        }}
                      >
                        <EditOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Tooltip title="创建副本">
                      <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={() => duplicateTemplate(t.id)}>
                        <CopyOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Popconfirm title={`删除模板「${t.name}」？`} okText="删除" cancelText="取消" onConfirm={() => deleteTemplate(t.id)}>
                      <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <DeleteOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Popconfirm>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10.5px] leading-relaxed text-slate-400">
          模板保存在本机浏览器；「保存当前」才更新存档，日常编辑不回写。跨电脑请配合「导出模板 JSON」。
        </p>
      </div>
    </Modal>
  );
}
