import { create } from 'zustand';
import type { CanvasConfig } from '../types';

/**
 * AI 会话状态：右下角助手面板的消息流与生成状态。
 * 会话级内存（不落盘）；多轮 = 历史消息原样进请求，超出窗口截断。
 */

export type ChatAction =
  | { kind: 'canvas'; config: CanvasConfig; summary: string }
  | { kind: 'patch'; summary: string; ops: import('./patch').PatchOp[]; newConfig: CanvasConfig };

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  /** assistant 文本内容（动作卡消息这里放简述） */
  content: string;
  /** 动作卡（渲染「采用/放弃」卡片） */
  action?: ChatAction;
  /** 附件说明（用户消息带文件时展示） */
  attachment?: string;
  ts: number;
  /** 生成失败后标记，可点重试 */
  failed?: boolean;
}

interface AiChatState {
  messages: ChatMsg[];
  generating: boolean;
  panelOpen: boolean;
  width: number;
  /** 引用节点发给 AI（节点工具条「问 AI」写入；发送时拼进消息） */
  quote: { label: string; detail: string } | null;
  setQuote: (q: { label: string; detail: string } | null) => void;
  setWidth: (w: number) => void;
  setPanelOpen: (v: boolean) => void;
  push: (m: Omit<ChatMsg, 'id' | 'ts'>) => ChatMsg;
  update: (id: string, patch: Partial<ChatMsg>) => void;
  setGenerating: (v: boolean) => void;
  clear: () => void;
}

let seq = 0;
const newId = (): string => `m${Date.now().toString(36)}_${(seq += 1)}`;

const PERSIST_KEY = 'onlyrep-ai-chat';
const PERSIST_CAP = 50;

/** 落盘：剥掉动作卡的重负载（config/newConfig 只存内存），留可读简述 */
function persist(state: Pick<AiChatState, 'messages' | 'width'>): void {
  try {
    const lite = state.messages.slice(-PERSIST_CAP).map((m) => ({
      ...m,
      action: m.action ? undefined : undefined, // 动作卡不恢复（采用/放弃必须在当次会话内完成）
      content: m.action ? `${m.content}（历史动作卡，配置未保留）` : m.content,
    }));
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ messages: lite, width: state.width }));
  } catch {
    /* 降级环境忽略 */
  }
}

function loadPersisted(): { messages: ChatMsg[]; width: number } {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const d = JSON.parse(raw) as { messages?: ChatMsg[]; width?: number };
      return { messages: Array.isArray(d.messages) ? d.messages : [], width: typeof d.width === 'number' ? d.width : 380 };
    }
  } catch {
    /* 忽略 */
  }
  return { messages: [], width: 380 };
}

const persisted = loadPersisted();

export const useAiChat = create<AiChatState>()((set) => ({
  messages: persisted.messages,
  generating: false,
  panelOpen: false,
  width: persisted.width,
  quote: null,
  setQuote: (q) => set({ quote: q }),
  setWidth: (w) => set({ width: Math.max(340, Math.min(720, w)) }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  push: (m) => {
    const msg: ChatMsg = { ...m, id: newId(), ts: Date.now() };
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },
  update: (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  setGenerating: (v) => set({ generating: v }),
  clear: () => set({ messages: [], generating: false }),
}));

/** 多轮请求的消息窗口：system 之外保留最近 N 条（动作卡压成简述，防 token 膨胀） */
export const CHAT_WINDOW = 12;

export function windowedHistory(messages: ChatMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  const recent = messages.slice(-CHAT_WINDOW);
  return recent.map((m) => ({
    role: m.role,
    content: m.action ? `[上一轮生成了画布配置：${m.action.summary}，用户可在面板中采用]` : m.content,
  }));
}


// 变更即落盘（messages/width）
useAiChat.subscribe((s) => persist({ messages: s.messages, width: s.width }));
