import { message } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { newId } from '../datasource/registry';
import type { DataSource } from '../types';
import { aiConfigured, loadAiConfig } from './aiConfig';
import { buildChatSystem } from './prompt';
import { callModel, extractJson } from './generate';
import { sanitizeCanvasConfig } from '../template';
import { useAiChat, windowedHistory } from './chat';
import { parseFile } from '../../parser/parse';
import { cleanTable } from '../../parser/clean';

/**
 * AI 会话动作层：发送消息（多轮+动作卡）、文件附件落源。
 * 面板组件只调这里，不直接碰 API。
 */

/** 从 AI 输出里分辨：动作卡（画布 JSON）还是纯回答 */
function parseReply(content: string): { kind: 'canvas'; config: ReturnType<typeof sanitizeCanvasConfig> } | { kind: 'text'; text: string } {
  const jsonText = extractJson(content);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { blocks?: unknown; version?: unknown };
      if (parsed && Array.isArray(parsed.blocks)) {
        return { kind: 'canvas', config: sanitizeCanvasConfig(parsed) };
      }
    } catch {
      /* 不是合法画布 → 当文本 */
    }
  }
  return { kind: 'text', text: content.trim() };
}

export async function sendChatMessage(text: string): Promise<void> {
  const chat = useAiChat.getState();
  const trimmed = text.trim();
  if (!trimmed || chat.generating) return;

  const aiCfg = loadAiConfig();
  if (!aiConfigured(aiCfg)) {
    chat.push({ role: 'assistant', content: '还没配置 AI 服务。请先在「设置 → AI 助手」填写端点、Key 和模型名。' });
    return;
  }

  chat.push({ role: 'user', content: trimmed });
  chat.setGenerating(true);
  const thinking = chat.push({ role: 'assistant', content: '思考中…' });

  try {
    const { config, sources } = useCanvasStore.getState();
    const system = buildChatSystem(aiCfg.sendSampleRows, config.dataSources, sources);
    // 多轮：system + 窗口内历史（刚 push 的用户消息与"思考中"占位不入历史，单独作为当前输入）
    const history = windowedHistory(useAiChat.getState().messages.filter((m) => m.id !== thinking.id).slice(0, -1));
    const userText = [...history, { role: 'user' as const, content: trimmed }].map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n\n');
    const res = await callModel(aiCfg, system, userText);

    if (res.error) {
      chat.update(thinking.id, { content: res.error, failed: true });
    } else {
      const reply = parseReply(res.content ?? '');
      if (reply.kind === 'canvas') {
        chat.update(thinking.id, {
          content: `已生成「${reply.config.title}」：${reply.config.blocks.length} 个区块 · ${reply.config.pipeline.nodes.length} 个节点`,
          action: { config: reply.config, summary: `${reply.config.blocks.length} 区块 / ${reply.config.pipeline.nodes.length} 节点 / ${reply.config.dataSources.length} 数据源` },
        });
      } else {
        chat.update(thinking.id, { content: reply.text || '（空回复）' });
      }
    }
  } catch (e) {
    chat.update(thinking.id, { content: `请求异常：${e instanceof Error ? e.message : String(e)}`, failed: true });
  } finally {
    useAiChat.getState().setGenerating(false);
  }
}

/** 文件附件：本地解析 → 落成 manualTable 数据源 → 会话里汇报 */
export async function attachFile(file: File): Promise<void> {
  const chat = useAiChat.getState();
  try {
    const raw = await parseFile(file);
    const table = cleanTable(raw, { excludeTotalKeywords: true, excludedRowIdx: new Set() });
    const cols = table.columns.map((c) => c.rawName || c.key);
    const rows = table.rows.map((r) => table.columns.map((c) => (r[c.key] as string | number | null) ?? null));
    const src: DataSource = {
      id: newId('ds'),
      name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
      kind: 'manualTable',
      columns: cols,
      rows: rows.slice(0, 200), // 手填表上限 200 行
    };
    useCanvasStore.getState().addSource(src);
    const sample = cols.join('、');
    chat.push({
      role: 'assistant',
      content: `已导入「${src.name}」：${table.rows.length} 行 × ${cols.length} 列（${sample}${cols.length > 6 ? '…' : ''}）。数据源已落到画布，可以直接让我基于它搭建日报。`,
    });
    void message.success(`已导入数据源「${src.name}」`);
  } catch (e) {
    chat.push({ role: 'assistant', content: `文件解析失败：${e instanceof Error ? e.message : String(e)}`, failed: true });
  }
}

/** 采用动作卡：应用配置（压历史可撤销）+ 会话汇报 */
export function adoptAction(msgId: string): void {
  const chat = useAiChat.getState();
  const msg = chat.messages.find((m) => m.id === msgId);
  if (!msg?.action) return;
  useCanvasStore.getState().applyAiConfig(msg.action.config);
  chat.update(msgId, { action: undefined });
  chat.push({ role: 'assistant', content: '已采用该画布（可用 Ctrl+Z 撤销）。想调整哪里，直接说。' });
}

/** 放弃动作卡 */
export function discardAction(msgId: string): void {
  const chat = useAiChat.getState();
  const msg = chat.messages.find((m) => m.id === msgId);
  if (!msg?.action) return;
  chat.update(msgId, { action: undefined });
  chat.push({ role: 'assistant', content: '好的，已放弃。可以换个说法再试。' });
}
