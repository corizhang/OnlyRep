import { describe, expect, it } from 'vitest';
import { windowedHistory, useAiChat, CHAT_WINDOW } from '../ai/chat';

describe('AI 会话', () => {
  it('历史窗口截断：超长只留最近 N 条', () => {
    const msgs = Array.from({ length: CHAT_WINDOW + 5 }, (_, i) => ({ id: `m${i}`, role: 'user' as const, content: `第${i}条`, ts: i }));
    const w = windowedHistory(msgs);
    expect(w).toHaveLength(CHAT_WINDOW);
    expect(w[0].content).toBe('第5条');
  });

  it('动作卡消息在历史里压成简述（不重复发大 JSON）', () => {
    const msgs = [
      { id: 'm1', role: 'assistant' as const, content: '已生成', ts: 1, action: { config: {} as never, summary: '5 区块 / 3 节点' } },
    ];
    const w = windowedHistory(msgs);
    expect(w[0].content).toContain('上一轮生成了画布配置');
    expect(w[0].content).not.toContain('blocks');
  });

  it('push/update/clear 消息流', () => {
    const chat = useAiChat.getState();
    chat.clear();
    const m = chat.push({ role: 'user', content: 'hi' });
    expect(useAiChat.getState().messages).toHaveLength(1);
    chat.update(m.id, { content: 'edited' });
    expect(useAiChat.getState().messages[0].content).toBe('edited');
    chat.clear();
    expect(useAiChat.getState().messages).toHaveLength(0);
  });
});
