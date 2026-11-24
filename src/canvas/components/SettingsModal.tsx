import { useEffect, useState, type ReactNode } from 'react';
import { K } from '../../storage/keys';
import { Button, Modal, Select, Switch } from 'antd';
import { SettingOutlined, LayoutOutlined, ExportOutlined, FolderOpenOutlined, InfoCircleOutlined, KeyOutlined } from '@ant-design/icons';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { isTauri, tauriPersistStorage } from '../../storage/tauriKv';
import { appStorage } from '../../storage/safeStorage';
import { loadAiConfig, saveAiConfig } from '../ai/aiConfig';
import { useCanvasStore } from '../../store/useCanvasStore';
import CanvasSettings from './CanvasSettings';
import packageInfo from '../../../package.json';

const SECTIONS = [
  { id: 'general', label: '常规', icon: <SettingOutlined />, description: '应用外观与启动行为，仅影响本机。' },
  { id: 'canvas', label: '当前画布', icon: <LayoutOutlined />, description: '标题、尺寸、主题和排版随当前项目保存，支持撤销。' },
  { id: 'export', label: '导出', icon: <ExportOutlined />, description: '图片清晰度随当前项目保存；保存目录为本机偏好。' },
  { id: 'storage', label: '项目与存储', icon: <FolderOpenOutlined />, description: '管理项目保存目录，以及工作区和模板库的数据迁移。' },
  { id: 'ai', label: 'AI 助手', icon: <span style={{ fontSize: 12 }}>✨</span>, description: '自然语言生成日报画布与数据管道；配置仅存本机。' },
  { id: 'shortcuts', label: '快捷键', icon: <KeyOutlined />, description: '在编辑区使用快捷键，提高常用操作效率。' },
  { id: 'about', label: '关于', icon: <InfoCircleOutlined />, description: '应用版本与运行环境。' },
] as const;
export type SettingsSection = typeof SECTIONS[number]['id'];

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4"><div className="min-w-0 flex-1"><div className="text-[13px] font-medium text-ink">{title}</div>{description && <p className="mt-1 text-xs leading-relaxed text-ink-dim">{description}</p>}</div>{children}</div>;
}

function DirectorySetting({ storageKey, title, fallback, description }: { storageKey: string; title: string; fallback: string; description: string }) {
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(false); setError('');
    if (!isTauri()) return;
    void tauriPersistStorage.getItem(storageKey).then(v => { if (active) { setValue(v ?? ''); setLoaded(true); } }).catch(e => { if (active) setError(`读取失败：${String(e)}`); });
    return () => { active = false; };
  }, [storageKey, attempt]);
  const update = async (reset: boolean) => {
    setBusy(true); setError('');
    try {
      const picked = reset ? '' : await openDialog({ directory: true, title: `选择${title}` });
      if (typeof picked !== 'string') return;
      if (reset) await tauriPersistStorage.removeItem(storageKey);
      else if (picked) await tauriPersistStorage.setItem(storageKey, picked);
      setValue(picked);
    } catch (e) { setError(`保存失败：${String(e)}`); }
    finally { setBusy(false); }
  };
  return <div className="border-b border-line py-4"><h3 className="text-[13px] font-medium text-ink">{title}</h3><p className="mt-1 text-xs leading-relaxed text-ink-dim">{description}</p>{isTauri() ? <>
    <div className="mt-3 break-all rounded border border-line bg-soft px-3 py-2 text-xs text-ink">{loaded ? value || fallback : '正在读取目录…'}</div>
    <div className="mt-2 flex gap-2"><Button size="small" disabled={!loaded || busy} loading={busy} onClick={() => void update(false)}>更改目录</Button><Button size="small" disabled={!loaded || busy || !value} onClick={() => void update(true)}>恢复默认</Button>{error && <Button size="small" onClick={() => setAttempt(n => n + 1)}>重新读取</Button>}</div>
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
  </> : <p className="mt-3 rounded bg-soft px-3 py-2 text-xs leading-relaxed text-ink-dim">浏览器版使用浏览器下载目录，请在浏览器设置中调整。桌面应用支持自定义保存目录。</p>}</div>;
}

export default function SettingsModal({ open, onClose, initialSection = 'general' }: { open: boolean; onClose: () => void; initialSection?: SettingsSection }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [skipLauncher, setSkipLauncher] = useState(false);
  const uiTheme = useCanvasStore(s => s.uiTheme);
  const toggleUiTheme = useCanvasStore(s => s.toggleUiTheme);
  useEffect(() => { if (open) { setSection(initialSection); setSkipLauncher(appStorage.getItem(K.skipLauncher) === '1'); } }, [open, initialSection]);
  const current = SECTIONS.find(s => s.id === section)!;
  return <Modal open={open} onCancel={onClose} title={<div className="py-1"><div>设置</div><p className="mt-1 text-xs font-normal text-ink-dim">管理 OnlyRep 的应用偏好与当前画布配置</p></div>} width={900} zIndex={2000} centered footer={null} styles={{ body: { padding: 0 } }} destroyOnHidden>
    <div className="-mx-6 mt-3 flex h-[min(560px,65vh)] min-h-[260px] border-y border-line">
      <nav aria-label="设置分类" className="w-40 shrink-0 space-y-1 overflow-y-auto border-r border-line bg-soft p-2 max-sm:w-28">{SECTIONS.map(s => <button type="button" key={s.id} aria-current={section === s.id ? 'page' : undefined} onClick={() => setSection(s.id)} className={`flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-xs transition-colors ${section === s.id ? 'bg-brand-soft text-brand' : 'text-ink-dim hover:bg-hover hover:text-ink'}`}>{s.icon}{s.label}</button>)}</nav>
      <main key={section} aria-label={current.label} className="min-w-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-3"><h2 className="text-base font-semibold text-ink">{current.label}</h2><p className="mb-4 mt-1 text-xs leading-relaxed text-ink-dim">{current.description}</p>
        {section === 'general' && <>
          <Row title="界面主题" description="编辑器、节点和弹窗统一切换明暗外观。"><Select aria-label="界面主题" className="w-32" value={uiTheme} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色 · 石墨灰' }]} onChange={v => { if (v !== uiTheme) toggleUiTheme(); }} /></Row>
          <Row title="启动时直接进入工作区" description="开启后跳过项目启动页；仍可通过顶部主页按钮返回项目列表。"><Switch aria-label="启动时直接进入工作区" checked={skipLauncher} onChange={v => { appStorage.setItem(K.skipLauncher, v ? '1' : ''); setSkipLauncher(v); }} /></Row>
        </>}
        {section === 'canvas' && <CanvasSettings section="canvas" />}
        {section === 'export' && <><CanvasSettings section="export" /><DirectorySetting storageKey={K.exportDir} title="导出图片保存位置" fallback="默认：系统下载目录下的 OnlyRep 文件夹" description="仅桌面应用生效。同名文件会自动追加序号。" /></>}
        {section === 'storage' && <><DirectorySetting storageKey={K.projectDir} title="项目保存目录" fallback="默认：文档 / OnlyRep / Projects" description="更改后用于后续项目保存，不会自动搬移已有项目文件。" /><div className="mt-5"><CanvasSettings section="storage" /></div></>}
        {section === 'ai' && <AiSettings />}
        {section === 'shortcuts' && <div className="divide-y divide-line">{[
          ['Ctrl + ,', '打开设置'], ['Ctrl + S', '保存当前项目'], ['Ctrl + Z', '撤销'], ['Ctrl + Shift + Z / Ctrl + Y', '重做'], ['Ctrl + K', '添加节点（数据节点视图）'], ['Delete', '删除选中的节点或连线（数据节点视图）'], ['Shift + 拖动画布', '框选节点'], ['滚轮', '缩放节点画布'], ['拖动空白区域', '平移节点画布'], ['Esc', '关闭当前浮层'],
        ].map(([key, label]) => <div key={key} className="flex flex-wrap justify-between gap-3 py-3 text-xs"><span className="text-ink-dim">{label}</span><kbd className="rounded border border-line bg-soft px-2 py-0.5 text-ink">{key}</kbd></div>)}</div>}
        {section === 'about' && <div className="space-y-4 py-4"><div className="text-xl font-semibold text-ink">OnlyRep <span className="text-sm font-normal text-ink-dim">v{packageInfo.version}</span></div><p className="text-sm text-ink-dim">数据处理与可视化日报工作台</p><p className="text-xs text-ink-dim">运行环境：{isTauri() ? 'Tauri 桌面应用' : '浏览器'}</p><p className="text-xs text-ink-dim">工作区在本机保存。重要项目建议另存项目文件，并定期备份工作区与模板库。</p></div>}
      </main>
    </div>
    <footer className="flex items-center justify-between gap-3 pt-4"><p className="text-xs text-ink-dim">设置即时生效；画布配置随当前项目保存。</p><Button onClick={onClose}>完成</Button></footer>
  </Modal>;
}


/** AI 助手设置：端点/Key/模型/数据样本开关（仅存本机） */
function AiSettings() {
  const [cfg, setCfg] = useState(loadAiConfig);
  const save = (patch: Partial<ReturnType<typeof loadAiConfig>>): void => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveAiConfig(next);
  };
  const inputCls = 'w-64 rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand-line';
  return (
    <>
      <Row title="服务端点" description="OpenAI 兼容服务地址（不含 /chat/completions），如 https://api.deepseek.com/v1 或公司内网网关。">
        <input className={inputCls} value={cfg.endpoint} placeholder="https://…/v1" onChange={(e) => save({ endpoint: e.target.value })} />
      </Row>
      <Row title="API Key" description="仅存本机，不会上传到其他任何地方。">
        <input className={inputCls} type="password" value={cfg.apiKey} placeholder="sk-…" onChange={(e) => save({ apiKey: e.target.value })} />
      </Row>
      <Row title="模型" description="如 deepseek-chat / qwen-plus / gpt-4o-mini。">
        <input className={inputCls} value={cfg.model} placeholder="deepseek-chat" onChange={(e) => save({ model: e.target.value })} />
      </Row>
      <Row title="发送数据样本" description="开启后生成时附带每个数据源前 3 行样本，贴合度更高；关闭则只发列名与类型（推荐，银行数据不出机）。">
        <Switch aria-label="发送数据样本" checked={cfg.sendSampleRows} onChange={(v) => save({ sendSampleRows: v })} />
      </Row>
    </>
  );
}
