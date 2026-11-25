import { message } from 'antd';
import { useCanvasStore } from '../../store/useCanvasStore';
import { newId } from '../datasource/registry';
import type { DataSource } from '../types';
import { aiConfigured, loadAiConfig } from './aiConfig';
import { buildChatSystem } from './prompt';
import { callModelStream, extractJson } from './generate';
import { sanitizeCanvasConfig } from '../template';
import { applyPatchOps, parsePatch, type PatchRequest } from './patch';
import { useAiChat, windowedHistory } from './chat';
import { parseFile } from '../../parser/parse';
import { cleanTable } from '../../parser/clean';

/**
 * AI 会话动作层：发送消息（多轮+动作卡）、文件附件落源。
 * 面板组件只调这里，不直接碰 API。
 */

/** 从 AI 输出里分辨：增量 patch / 全量画布 / 纯回答 */
type ParsedReply =
  | { kind: 'patch'; req: PatchRequest; newConfig: ReturnType<typeof sanitizeCanvasConfig> }
  | { kind: 'canvas'; config: ReturnType<typeof sanitizeCanvasConfig> }
  | { kind: 'invalid'; reason: string }
  | { kind: 'text'; text: string };

function parseReply(content: string): ParsedReply {
  const jsonText = extractJson(content);
  if (jsonText) {
    const req = parsePatch(jsonText);
    if (req) {
      try {
        const current = useCanvasStore.getState().config;
        return { kind: 'patch', req, newConfig: applyPatchOps(current, req.ops) };
      } catch (e) {
        return { kind: 'invalid', reason: `patch 校验失败：${e instanceof Error ? e.message : String(e)}` };
      }
    }
    try {
      const parsed = JSON.parse(jsonText) as { blocks?: unknown };
      if (parsed && Array.isArray(parsed.blocks)) {
        try {
          return { kind: 'canvas', config: sanitizeCanvasConfig(parsed) };
        } catch (e) {
          return { kind: 'invalid', reason: `画布校验失败：${e instanceof Error ? e.message : String(e)}` };
        }
      }
    } catch {
      /* 不是合法 JSON → 当文本 */
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

  const quote = chat.quote;
  chat.push({ role: 'user', content: trimmed, attachment: quote ? `🔗 ${quote.label}` : undefined });
  if (quote) chat.setQuote(null);
  chat.setGenerating(true);
  const thinking = chat.push({ role: 'assistant', content: '思考中…' });

  const present = (reply: ParsedReply): boolean => {
    const c = useAiChat.getState();
    if (reply.kind === 'canvas') {
      c.update(thinking.id, {
        content: `已生成「${reply.config.title}」：${reply.config.blocks.length} 个区块 · ${reply.config.pipeline.nodes.length} 个节点`,
        action: { kind: 'canvas', config: reply.config, summary: `${reply.config.blocks.length} 区块 / ${reply.config.pipeline.nodes.length} 节点 / ${reply.config.dataSources.length} 数据源` },
      });
      return true;
    }
    if (reply.kind === 'patch') {
      c.update(thinking.id, {
        content: `增量修改：${reply.req.summary}（${reply.req.ops.length} 处变更）`,
        action: { kind: 'patch', summary: reply.req.summary, ops: reply.req.ops, newConfig: reply.newConfig },
      });
      return true;
    }
    if (reply.kind === 'text') {
      c.update(thinking.id, { content: reply.text || '（空回复）' });
      return true;
    }
    return false; // invalid
  };

  try {
    const { config, sources } = useCanvasStore.getState();
    const system = buildChatSystem(aiCfg.sendSampleRows, config.dataSources, sources, config);
    // 多轮：system + 窗口内历史（刚 push 的用户消息与"思考中"占位不入历史，单独作为当前输入）
    const history = windowedHistory(useAiChat.getState().messages.filter((m) => m.id !== thinking.id).slice(0, -1));
    const finalText = quote ? `${quote.detail}\n\n我的问题：${trimmed}` : trimmed;
    let userText = [...history, { role: 'user' as const, content: finalText }].map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n\n');

    // 最多两次尝试：第一次失败后把校验错误回喂，让 AI 自修一次
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt += 1) {
      if (attempt > 0) chat.update(thinking.id, { content: '输出未通过校验，正在让 AI 自修…' });
      // 流式节流：60ms 刷一次（打字机节奏，避免每个 token 都重渲染）
      let lastFlush = 0;
      let pending: string | null = null;
      const res = await callModelStream(aiCfg, system, userText, (full) => {
        pending = full;
        const now = Date.now();
        if (now - lastFlush < 60) return;
        lastFlush = now;
        useAiChat.getState().update(thinking.id, { content: full.length > 4000 ? `${full.slice(0, 4000)}…` : full });
      });
      if (pending !== null) {
        const f = pending as string;
        useAiChat.getState().update(thinking.id, { content: f.length > 4000 ? `${f.slice(0, 4000)}…` : f });
      }
      if (res.error) {
        chat.update(thinking.id, { content: res.error, failed: res.error !== '已取消' });
        break;
      }
      const reply = parseReply(res.content ?? '');
      if (reply.kind === 'invalid' && attempt === 0) {
        // 自愈：错误回喂重试
        userText = `用户：${trimmed}\n\n助手上次输出未通过系统校验：${reply.reason}。请修正后重新输出（保持用户意图不变，只修不合法的部分）。`;
        continue;
      }
      if (reply.kind === 'invalid') {
        chat.update(thinking.id, { content: `${reply.reason}（重试后仍未通过，请换个说法或稍后重试）`, failed: true });
        break;
      }
      done = present(reply);
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
  if (msg.action.kind === 'canvas') {
    useCanvasStore.getState().applyAiConfig(msg.action.config);
    chat.push({ role: 'assistant', content: '已采用该画布（可用 Ctrl+Z 撤销）。想调整哪里，直接说。' });
  } else {
    useCanvasStore.getState().applyAiConfig(msg.action.newConfig);
    chat.push({ role: 'assistant', content: `已应用「${msg.action.summary}」（Ctrl+Z 可撤销）。` });
  }
  chat.update(msgId, { action: undefined });
}

/** 放弃动作卡 */
export function discardAction(msgId: string): void {
  const chat = useAiChat.getState();
  const msg = chat.messages.find((m) => m.id === msgId);
  if (!msg?.action) return;
  chat.update(msgId, { action: undefined });
  chat.push({ role: 'assistant', content: '好的，已放弃。可以换个说法再试。' });
}
