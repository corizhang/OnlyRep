import { useEffect, useRef, useState } from 'react';
import { ClearOutlined, CloseOutlined, PaperClipOutlined, SendOutlined } from '@ant-design/icons';
import { useAiChat } from './chat';
import { adoptAction, attachFile, discardAction, sendChatMessage } from './chatActions';
import type { ChatMsg } from './chat';

/**
 * AI 助手面板：右下角悬浮入口 + 会话面板（消息流/动作卡/文件附件）。
 * 参考各家 AI 助手形态：浮层不遮画布，随开随用。
 */

const PANEL_H = 540;

export default function AiAssistantPanel() {
  const panelOpen = useAiChat((s) => s.panelOpen);
  const setPanelOpen = useAiChat((s) => s.setPanelOpen);
  const width = useAiChat((s) => s.width);
  const setWidth = useAiChat((s) => s.setWidth);
  const messages = useAiChat((s) => s.messages);
  const generating = useAiChat((s) => s.generating);
  const unread = useAiChat((s) => s.messages.filter((m) => m.role === 'assistant').length > 0 && !panelOpen);

  return (
    <>
      {/* 悬浮入口 */}
      {!panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          title="AI 助手"
          className="fixed bottom-5 right-5 z-[1500] flex h-12 w-12 items-center justify-center rounded-full bg-brand text-[20px] text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-hover"
        >
          ✨
          {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warn" />}
        </button>
      )}

      {/* 会话面板 */}
      {panelOpen && (
        <div
          className="fixed bottom-5 right-5 z-[1500] flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
          style={{ width, height: PANEL_H }}
        >
          {/* 左缘拖拽调宽 */}
          <div
            className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-brand/30"
            onPointerDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = width;
              const onMove = (ev: PointerEvent): void => setWidth(startW + (startX - ev.clientX));
              const onUp = (): void => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
              };
              document.addEventListener('pointermove', onMove);
              document.addEventListener('pointerup', onUp);
            }}
          />
          <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-soft px-3">
            <span className="text-[13px]">✨</span>
            <span className="text-[12.5px] font-semibold text-ink">AI 助手</span>
            <span className="text-[10px] text-ink-faint">搭画布 · 配节点 · 传数据</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                title="清空会话"
                onClick={() => useAiChat.getState().clear()}
                className="rounded p-1 text-[12px] text-ink-faint hover:bg-hover hover:text-ink"
              >
                <ClearOutlined />
              </button>
              <button
                type="button"
                title="收起"
                onClick={() => setPanelOpen(false)}
                className="rounded p-1 text-[12px] text-ink-faint hover:bg-hover hover:text-ink"
              >
                <CloseOutlined />
              </button>
            </div>
          </header>

          <MessageList messages={messages} generating={generating} />
          <InputBox generating={generating} />
        </div>
      )}
    </>
  );
}

function MessageList({ messages, generating }: { messages: ChatMsg[]; generating: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, generating]);

  return (
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
      {messages.length === 0 && (
        <div className="mt-8 space-y-2 text-center">
          <div className="text-[22px]">✨</div>
          <p className="text-[12.5px] font-medium text-ink">直接告诉我你想做什么</p>
          <div className="mx-auto max-w-[300px] space-y-1.5 text-left text-[11.5px] text-ink-faint">
            <p>·「用我上传的表做一份渠道转介日报，带 KPI 和柱状图」</p>
            <p>·「想做环比对比，节点怎么配？」</p>
            <p>· 点 📎 把 Excel/CSV 直接发给我</p>
          </div>
        </div>
      )}
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed ${
          isUser ? 'bg-brand text-white' : msg.failed ? 'border border-danger/40 bg-danger-soft/50 text-danger' : 'bg-soft text-ink'
        }`}
      >
        {msg.attachment && <div className="mb-1 rounded bg-black/10 px-1.5 py-0.5 text-[10.5px]">📎 {msg.attachment}</div>}
        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        {msg.action && (
          <div className="mt-2 rounded-md border border-brand-line bg-panel p-2">
            <div className="text-[10px] font-medium text-brand">{msg.action.kind === 'patch' ? '增量修改' : '完整画布'}</div>
            <div className="text-[11px] text-ink-dim">{msg.action.summary}</div>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => adoptAction(msg.id)}
                className="rounded bg-brand px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-hover"
              >
                采用
              </button>
              <button
                type="button"
                onClick={() => discardAction(msg.id)}
                className="rounded border border-line px-2.5 py-1 text-[11px] text-ink-dim hover:bg-hover"
              >
                放弃
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InputBox({ generating }: { generating: boolean }) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = (): void => {
    const t = text.trim();
    if (!t || generating) return;
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    void sendChatMessage(t);
  };

  return (
    <div className="shrink-0 border-t border-line bg-panel p-2">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void attachFile(f);
        }}
      />
      <div className="flex items-end gap-1.5 rounded-lg border border-line bg-soft px-2 py-1.5 focus-within:border-brand-line">
        <button
          type="button"
          title="发送数据文件（xlsx / csv，本地解析）"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded p-1 text-[13px] text-ink-faint hover:bg-hover hover:text-brand"
        >
          <PaperClipOutlined />
        </button>
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          placeholder="描述需求，或问怎么配节点…"
          onChange={(e) => {
            setText(e.target.value);
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-24 min-h-[20px] flex-1 resize-none bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || generating}
          title="发送（Enter）"
          className="shrink-0 rounded p-1 text-[13px] text-brand hover:bg-brand-soft disabled:opacity-40"
        >
          <SendOutlined rotate={-45} />
        </button>
      </div>
      <p className="mt-1 text-center text-[9.5px] text-ink-faint">Enter 发送 · Shift+Enter 换行 · 数据样本发送受设置开关控制</p>
    </div>
  );
}
