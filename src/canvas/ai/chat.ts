import { create } from 'zustand';
import type { CanvasConfig } from '../types';

/**
 * AI 会话状态：右下角助手面板的消息流与生成状态。
 * 会话级内存（不落盘）；多轮 = 历史消息原样进请求，超出窗口截断。
 */

export interface ChatAction {
  /** 可采用的画布配置（已通过 sanitize 校验） */
  config: CanvasConfig;
  summary: string;
}

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
  setPanelOpen: (v: boolean) => void;
  push: (m: Omit<ChatMsg, 'id' | 'ts'>) => ChatMsg;
  update: (id: string, patch: Partial<ChatMsg>) => void;
  setGenerating: (v: boolean) => void;
  clear: () => void;
}

let seq = 0;
const newId = (): string => `m${Date.now().toString(36)}_${(seq += 1)}`;

export const useAiChat = create<AiChatState>()((set) => ({
  messages: [],
  generating: false,
  panelOpen: false,
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
