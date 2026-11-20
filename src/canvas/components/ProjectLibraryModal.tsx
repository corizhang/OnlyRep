import { useEffect, useRef, useState } from 'react';
import { Modal, Popconfirm, Tooltip } from 'antd';
import { CheckCircleFilled, CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FolderOpenOutlined, ShareAltOutlined, UploadOutlined } from '@ant-design/icons';
import { useCanvasStore } from '../../store/useCanvasStore';

/**
 * 项目库面板（头部「项目库」按钮打开）：
 * 项目 = 壳 + 数据。切换时自动回写当前项目、载入目标项目（数据快照自动恢复，切回不丢）。
 * 「存为模板」把壳剥出来进模板库（供分享/起始创建）。
 */
export default function ProjectLibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useCanvasStore((s) => s.projects);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const saveProject = useCanvasStore((s) => s.saveProject);
  const loadProjectById = useCanvasStore((s) => s.loadProjectById);
  const renameProject = useCanvasStore((s) => s.renameProject);
  const duplicateProject = useCanvasStore((s) => s.duplicateProject);
  const deleteProject = useCanvasStore((s) => s.deleteProject);
  const saveProjectAsTemplate = useCanvasStore((s) => s.saveProjectAsTemplate);
  const exportProject = useCanvasStore((s) => s.exportProject);
  const importProjectFile = useCanvasStore((s) => s.importProjectFile);
  const sources = useCanvasStore((s) => s.sources);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const active = projects.find((p) => p.id === activeProjectId);

  // 同模板库：打开期间全局 Esc 兜底关闭（确认弹窗除外）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.ant-modal-confirm')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** 项目的数据源就绪概览（仅当前项目能读到运行时状态；其余按定义数显示） */
  const sourceSummary = (projId: string, sourceCount: number): string => {
    if (projId === activeProjectId) {
      const ready = Object.values(sources).filter((s) => s.status === 'ready').length;
      return `${ready}/${sourceCount} 数据源就绪`;
    }
    return `${sourceCount} 个数据源`;
  };

  return (
    <Modal title="项目库" open={open} onCancel={onClose} footer={null} width={540} destroyOnHidden>
      <div className="space-y-3">
        {/* 顶部：保存当前 */}
        <div className="flex items-center gap-2 rounded-md border border-brand-line bg-brand-soft/60 px-3 py-2">
          <button
            type="button"
            onClick={() => saveProject()}
            className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-hover"
          >
            {active ? `保存到「${active.name}」` : '保存当前为项目'}
          </button>
          <span className="text-[11px] text-ink-faint">项目含数据，切换自动回写当前项目</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ml-auto flex items-center gap-1 rounded-md border border-line-strong bg-panel px-2.5 py-1.5 text-[12px] text-ink-dim hover:bg-hover"
          >
            <UploadOutlined style={{ fontSize: 11 }} />
            导入 .rkb
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".rkb,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const text = await f.text();
              const name = await importProjectFile(text);
              if (name) {
                onClose();
              } else {
                window.alert('文件不是有效的 RankBoard 项目（.rkb）');
              }
            }}
          />
        </div>

        {/* 列表 */}
        {projects.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-ink-faint">
            还没有项目。导入数据搭好一份日报后点上方「保存当前为项目」，下次带数据一键回来。
          </p>
        ) : (
          <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
            {projects.map((proj) => {
              const isActive = proj.id === activeProjectId;
              const renaming = renamingId === proj.id;
              const srcCount = proj.config.dataSources.length;
              return (
                <div
                  key={proj.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 ${isActive ? 'border-brand-line bg-brand-soft/50' : 'border-line bg-panel hover:border-line-strong'}`}
                >
                  <FolderOpenOutlined className={isActive ? 'text-brand' : 'text-ink-faint'} />
                  <div className="min-w-0 flex-1">
                    {renaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          renameProject(proj.id, renameDraft);
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="w-full rounded border border-brand-line px-1 py-px text-[12.5px] outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">{proj.name}</span>
                        {isActive && <CheckCircleFilled className="shrink-0 text-[11px] text-brand" />}
                      </div>
                    )}
                    <div className="mt-0.5 text-[10.5px] text-ink-faint">
                      {proj.config.blocks.length} 个区块 · {sourceSummary(proj.id, srcCount)} ·{' '}
                      {new Date(proj.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        loadProjectById(proj.id);
                        onClose();
                      }}
                      className={`rounded px-2 py-1 text-[11.5px] font-medium ${isActive ? 'text-ink-faint' : 'text-brand hover:bg-brand-soft'}`}
                      disabled={isActive}
                    >
                      {isActive ? '当前' : '打开'}
                    </button>
                    <Tooltip title="导出项目（.rkb，含数据，可拷给同事直接用）">
                      <button
                        type="button"
                        className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink-dim"
                        onClick={() => void exportProject(proj.id)}
                      >
                        <DownloadOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Tooltip title="存为模板（只存版式壳，可分享）">
                      <button
                        type="button"
                        className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink-dim"
                        onClick={() => saveProjectAsTemplate(proj.id)}
                      >
                        <ShareAltOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Tooltip title="重命名">
                      <button
                        type="button"
                        className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink-dim"
                        onClick={() => {
                          setRenamingId(proj.id);
                          setRenameDraft(proj.name);
                        }}
                      >
                        <EditOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Tooltip title="创建副本">
                      <button type="button" className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink-dim" onClick={() => duplicateProject(proj.id)}>
                        <CopyOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Popconfirm title={`删除项目「${proj.name}」？`} okText="删除" cancelText="取消" onConfirm={() => deleteProject(proj.id)}>
                      <button type="button" className="rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger">
                        <DeleteOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Popconfirm>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10.5px] leading-relaxed text-ink-faint">
          项目 = 版式 + 数据（数据缓存在本机，切走再切回不丢）；要分享版式给同事请用「存为模板」或「导出模板 JSON」。
        </p>
      </div>
    </Modal>
  );
}
