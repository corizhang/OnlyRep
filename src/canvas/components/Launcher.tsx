import { useEffect, useRef, useState } from 'react';
import { K } from '../../storage/keys';
import { Popconfirm, Tooltip } from 'antd';
import {
  DeleteOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  UploadOutlined,
  ArrowRightOutlined,
  PushpinOutlined,
  PushpinFilled,
} from '@ant-design/icons';
import { useCanvasStore } from '../../store/useCanvasStore';
import { isTauri } from '../../storage/tauriKv';
import { ensureAppInit } from '../appInit';
import NewProjectModal from './NewProjectModal';

/**
 * 启动页（工作台首页）：品牌区 + 主操作 + 保存目录 + 最近项目卡。
 * 每次启动默认展示；「继续上次工作区」一键回到 persist 的当前工作区。
 */

const SKIP_KEY = K.skipLauncher;

export function shouldShowLauncher(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function Launcher({ onEnter }: { onEnter: () => void }) {
  // 启动页先到时也要初始化 store（项目库/工作区都在 bootstrap 里载入）
  useEffect(() => {
    void ensureAppInit();
  }, []);
  const projects = useCanvasStore((s) => s.projects);
  const loadProjectById = useCanvasStore((s) => s.loadProjectById);
  const deleteProject = useCanvasStore((s) => s.deleteProject);
  const importProjectFile = useCanvasStore((s) => s.importProjectFile);
  const [showNew, setShowNew] = useState(false);
  const [pins, setPins] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(K.projectPins) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const togglePin = (id: string): void => {
    const next = pins.includes(id) ? pins.filter((x) => x !== id) : [id, ...pins];
    setPins(next);
    try {
      localStorage.setItem(K.projectPins, JSON.stringify(next));
    } catch {
      /* 降级不打扰 */
    }
  };

  const sorted = [...projects].sort((a, b) => {
    const pa = pins.includes(a.id) ? 1 : 0;
    const pb = pins.includes(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <div className="mx-auto w-full max-w-[900px] px-8 py-10">
        {/* 品牌区 */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">OnlyRep</div>
            <h1 className="mt-1 text-[26px] font-bold text-ink">项目</h1>
            <p className="mt-1 text-[12.5px] text-ink-dim">数据可视化日报：一次搭好，换数即用。</p>
          </div>
          <button
            type="button"
            onClick={onEnter}
            className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-2 text-[12.5px] text-ink-dim shadow-sm hover:border-brand-line hover:text-brand"
          >
            继续上次工作区
            <ArrowRightOutlined style={{ fontSize: 11 }} />
          </button>
        </div>

        {/* 主操作 */}
        <div className="mt-6 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-hover"
          >
            <FileAddOutlined style={{ fontSize: 13 }} />
            新建项目
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-line-strong bg-panel px-3.5 py-2 text-[12.5px] text-ink-dim hover:bg-hover"
          >
            <UploadOutlined style={{ fontSize: 12 }} />
            导入项目文件（.rkb）
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
              const name = await importProjectFile(await f.text());
              if (name) onEnter();
              else window.alert('文件不是有效的 OnlyRep 项目（.rkb）');
            }}
          />
          {isTauri() && <SaveDirRow />}
        </div>

        {/* 最近项目 */}
        <div className="mt-8">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold text-ink">最近项目</h2>
            <span className="text-[11px] text-ink-faint">固定优先，按更新时间排序</span>
          </div>
          {sorted.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-panel px-6 py-10 text-center text-[12.5px] text-ink-faint">
              还没有项目。点「新建项目」从空白或模板开始。
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {sorted.map((proj) => (
                <div
                  key={proj.id}
                  className="group overflow-hidden rounded-lg border border-line bg-panel shadow-card transition-shadow hover:shadow-pop"
                >
                  <button
                    type="button"
                    className="block h-[110px] w-full overflow-hidden bg-soft"
                    onClick={() => {
                      loadProjectById(proj.id);
                      onEnter();
                    }}
                  >
                    {proj.thumb ? (
                      <img src={proj.thumb} alt={proj.name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[22px] text-ink-faint">📊</div>
                    )}
                  </button>
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{proj.name}</span>
                      <Tooltip title={pins.includes(proj.id) ? '取消固定' : '固定到顶部'}>
                        <button
                          type="button"
                          className="text-ink-faint hover:text-brand"
                          onClick={() => togglePin(proj.id)}
                        >
                          {pins.includes(proj.id) ? <PushpinFilled style={{ fontSize: 11 }} /> : <PushpinOutlined style={{ fontSize: 11 }} />}
                        </button>
                      </Tooltip>
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-ink-faint">
                      {proj.config.blocks.length} 个区块 · {new Date(proj.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        className="text-brand hover:underline"
                        onClick={() => {
                          loadProjectById(proj.id);
                          onEnter();
                        }}
                      >
                        打开
                      </button>
                      <Popconfirm title={`移除项目「${proj.name}」？（数据缓存保留）`} okText="移除" cancelText="取消" onConfirm={() => deleteProject(proj.id)}>
                        <button type="button" className="text-ink-faint hover:text-danger">
                          移除记录
                        </button>
                      </Popconfirm>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-[10.5px] text-ink-faint">
          项目 = 版式 + 数据（本机保存）；「移除记录」只移出列表，不删磁盘数据。
          <label className="ml-3 inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              defaultChecked={false}
              onChange={(e) => {
                try {
                  localStorage.setItem(SKIP_KEY, e.target.checked ? '1' : '');
                } catch {
                  /* 降级 */
                }
              }}
            />
            下次跳过启动页直接进入
          </label>
        </p>
      </div>

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onEnter={onEnter} />
    </div>
  );
}

/** 项目保存目录行（仅桌面端）：显示 + 更改（原生文件夹选择器） */
function SaveDirRow() {
  const [dir, setDir] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void (async () => {
      const { tauriPersistStorage } = await import('../../storage/tauriKv');
      setDir((await tauriPersistStorage.getItem(K.projectDir)) ?? '');
      setLoaded(true);
    })();
  }, []);
  return (
    <div className="ml-auto flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-[11.5px] text-ink-dim">
      <FolderOpenOutlined className="text-ink-faint" style={{ fontSize: 12 }} />
      <span className="max-w-[260px] truncate" title={dir || undefined}>
        {loaded ? (dir ? dir : '默认：文档\\OnlyRep\\Projects') : '…'}
      </span>
      <button
        type="button"
        className="text-brand hover:underline"
        onClick={async () => {
          const { open } = await import('@tauri-apps/plugin-dialog');
          const { tauriPersistStorage } = await import('../../storage/tauriKv');
          const picked = await open({ directory: true, title: '选择项目保存目录' });
          if (typeof picked === 'string' && picked) {
            setDir(picked);
            await tauriPersistStorage.setItem(K.projectDir, picked);
          }
        }}
      >
        更改
      </button>
    </div>
  );
}
