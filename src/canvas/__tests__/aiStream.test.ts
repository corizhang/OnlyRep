import { afterEach, describe, expect, it, vi } from 'vitest';
import { callModelStream } from '../ai/generate';

const CFG = { endpoint: 'https://x.test/v1', apiKey: 'k', model: 'm', sendSampleRows: false };

function sseResponse(chunks: string[]): Response {
  const text = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(new TextEncoder().encode(text));
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('流式调用', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('SSE 逐段累积回传', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['你好', '，世界', '!'])));
    const deltas: string[] = [];
    const res = await callModelStream(CFG, 'sys', 'user', (full) => deltas.push(full));
    expect(res.content).toBe('你好，世界!');
    expect(deltas).toEqual(['你好', '你好，世界', '你好，世界!']);
  });

  it('端点忽略 stream（返回普通 JSON）→ 回退直读', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const res = await callModelStream(CFG, 'sys', 'user', () => {});
    expect(res.content).toBe('ok');
  });

  it('401 分类错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 401 })));
    const res = await callModelStream(CFG, 'sys', 'user', () => {});
    expect(res.error).toContain('鉴权失败');
  });
});
