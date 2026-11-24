import { useMemo, useRef, useState } from 'react';
import { Modal } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { aiConfigured, loadAiConfig } from './aiConfig';
import { buildAiMessages } from './prompt';
import { callAi } from './generate';
import type { CanvasConfig } from '../types';

type Phase = 'input' | 'generating' | 'done';

/**
 * AI 生成日报对话框：自然语言描述 → AI 产出 CanvasConfig → 预览摘要 → 采用（可撤销）。
 * 数据上下文默认只给列结构；样本行需在设置里显式开启。
 */
export default function AiGenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const config = useCanvasStore((s) => s.config);
  const sources = useCanvasStore((s) => s.sources);
  const applyAiConfig = useCanvasStore((s) => s.applyAiConfig);
  const aiCfg = useMemo(() => loadAiConfig(), [open]);

  const [desc, setDesc] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [result, setResult] = useState<CanvasConfig | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ready = aiConfigured(aiCfg);
  const srcWithData = config.dataSources.filter((d) => (sources[d.id]?.table?.rows.length ?? 0) > 0).length;

  const summary = result
    ? {
        blocks: result.blocks.length,
        nodes: result.pipeline.nodes.length,
        sources: result.dataSources.length,
        title: result.title,
      }
    : null;

  const doGenerate = async (): Promise<void> => {
    if (!desc.trim()) return;
    setPhase('generating');
    setError('');
    abortRef.current = new AbortController();
    const messages = buildAiMessages(desc.trim(), config.dataSources, sources, aiCfg.sendSampleRows);
    const res = await callAi(aiCfg, messages, abortRef.current.signal);
    if (res.config) {
      setResult(res.config);
      setPhase('done');
    } else {
      setError(res.error ?? '生成失败');
      setPhase('input');
    }
  };

  const close = (): void => {
    abortRef.current?.abort();
    setPhase('input');
    setError('');
    setResult(null);
    onClose();
  };

  return (
    <Modal title="AI 生成日报" open={open} onCancel={close} footer={null} width={520} destroyOnHidden>
      {!ready ? (
        <div className="py-4 text-center">
          <p className="text-[13px] text-ink-dim">还没配置 AI 服务。请先在「设置 → AI 助手」里填写 OpenAI 兼容端点、Key 和模型名。</p>
          <p className="mt-2 text-[11.5px] text-ink-faint">（DeepSeek / 通义 / 公司内网网关等兼容服务均可）</p>
        </div>
      ) : (
        <div className="space-y-3">
          {phase !== 'done' && (
            <>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={4}
                placeholder="描述你想要的日报，例如：做一份渠道转介日报，顶部标题+三个 KPI（公众号新增、短信新增、总新增），中间一张各渠道柱状图，底部明细表。"
                className="w-full rounded-md border border-line bg-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-line"
                disabled={phase === 'generating'}
              />
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {srcWithData > 0
                  ? `将把 ${srcWithData} 个已导入数据源的列结构（列名+类型${aiCfg.sendSampleRows ? ' + 前3行样本' : ''}）发给 AI 作为上下文。`
                  : '当前没有已导入数据，AI 会用内置示例数据搭建，之后可换接真实数据源。'}
              </p>
              {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                {phase === 'generating' ? (
                  <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-dim hover:bg-hover">
                    取消
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void doGenerate()}
                  disabled={!desc.trim() || phase === 'generating'}
                  className="rounded-md bg-brand px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {phase === 'generating' ? '生成中…（通常 10-30 秒）' : '生成'}
                </button>
              </div>
            </>
          )}

          {phase === 'done' && summary && result && (
            <>
              <div className="rounded-md border border-ok/40 bg-ok-soft/50 px-3 py-2.5">
                <div className="text-[13px] font-medium text-ink">「{summary.title}」生成完成</div>
                <div className="mt-1 text-[11.5px] text-ink-dim">
                  {summary.blocks} 个区块 · {summary.nodes} 个管道节点 · {summary.sources} 个数据源
                </div>
              </div>
              <p className="text-[11px] text-ink-faint">采用后将替换当前画布（可用 Ctrl+Z 撤销恢复原状）。AI 产出请人工核对后再发客户。</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('input');
                    setResult(null);
                  }}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-dim hover:bg-hover"
                >
                  重新生成
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyAiConfig(result);
                    close();
                  }}
                  className="rounded-md bg-brand px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-hover"
                >
                  采用
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
