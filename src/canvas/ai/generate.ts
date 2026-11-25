import type { CanvasConfig } from '../types';
import { sanitizeCanvasConfig } from '../template';
import type { AiConfig } from './aiConfig';
import type { AiMessages } from './prompt';

/**
 * AI 生成调用：OpenAI 兼容 /chat/completions → 容错抽取 JSON → sanitize 校验。
 * 错误信息面向用户可读（网络/鉴权/格式分类）。
 */

export interface AiResult {
  config?: CanvasConfig;
  error?: string;
  /** 模型原始输出（截断展示用） */
  raw?: string;
}

export interface AiRawResult {
  content?: string;
  error?: string;
}

/** 原始调用：不做 JSON 约束（聊天模式：回答或动作卡由上层分流） */
export async function callModel(cfg: AiConfig, system: string, user: string, signal?: AbortSignal): Promise<AiRawResult> {
  const base = cfg.endpoint.trim().replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 8000,
      }),
      signal,
    });
  } catch (e) {
    return { error: `网络请求失败：${e instanceof Error ? e.message : String(e)}（端点无法连通或跨域受限）` };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) return { error: '鉴权失败：请检查 API Key 是否正确、是否过期' };
    if (resp.status === 404) return { error: `端点 404：请确认端点地址（当前 ${url}），通常应为 https://域名/v1` };
    if (resp.status === 429) return { error: '请求频率超限（429）：稍后重试' };
    return { error: `服务返回 ${resp.status}：${body.slice(0, 200)}` };
  }
  try {
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) return { error: '模型返回了空内容' };
    return { content };
  } catch {
    return { error: '响应不是有效 JSON（端点可能不兼容 OpenAI 格式）' };
  }
}

/** 从模型输出里容错抽取 JSON 本体（剥围栏/前后废话） */
export function extractJson(text: string): string | null {
  let t = text.trim();
  // 剥 markdown 围栏
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  // 找第一个 { 到最后一个 }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return t.slice(start, end + 1);
}

export async function callAi(cfg: AiConfig, messages: AiMessages, signal?: AbortSignal): Promise<AiResult> {
  const base = cfg.endpoint.trim().replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        temperature: 0.4,
        max_tokens: 8000,
      }),
      signal,
    });
  } catch (e) {
    return { error: `网络请求失败：${e instanceof Error ? e.message : String(e)}（端点无法连通或跨域受限）` };
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) return { error: '鉴权失败：请检查 API Key 是否正确、是否过期' };
    if (resp.status === 404) return { error: `端点 404：请确认端点地址（当前 ${url}），通常应为 https://域名/v1` };
    if (resp.status === 429) return { error: '请求频率超限（429）：稍后重试' };
    return { error: `服务返回 ${resp.status}：${body.slice(0, 200)}` };
  }

  let content = '';
  try {
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content ?? '';
  } catch {
    return { error: '响应不是有效 JSON（端点可能不兼容 OpenAI 格式）' };
  }
  if (!content.trim()) return { error: '模型返回了空内容' };

  const jsonText = extractJson(content);
  if (!jsonText) return { error: '模型输出中没有 JSON 本体', raw: content.slice(0, 500) };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`, raw: jsonText.slice(0, 500) };
  }

  try {
    const config = sanitizeCanvasConfig(parsed);
    return { config, raw: jsonText.slice(0, 500) };
  } catch (e) {
    return { error: `配置校验失败：${e instanceof Error ? e.message : String(e)}`, raw: jsonText.slice(0, 500) };
  }
}

/** 流式调用：SSE 逐段回传（onDelta 收到累计全文）；端点不支持流式时回退非流式 */
export async function callModelStream(
  cfg: AiConfig,
  system: string,
  user: string,
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<AiRawResult> {
  const base = cfg.endpoint.trim().replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 8000,
        stream: true,
      }),
      signal,
    });
  } catch (e) {
    return { error: `网络请求失败：${e instanceof Error ? e.message : String(e)}（端点无法连通或跨域受限）` };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) return { error: '鉴权失败：请检查 API Key 是否正确、是否过期' };
    if (resp.status === 404) return { error: `端点 404：请确认端点地址（当前 ${url}），通常应为 https://域名/v1` };
    if (resp.status === 429) return { error: '请求频率超限（429）：稍后重试' };
    return { error: `服务返回 ${resp.status}：${body.slice(0, 200)}` };
  }
  // 非 SSE（端点忽略 stream 参数）→ 按普通响应读
  const ctype = resp.headers.get('content-type') ?? '';
  if (!ctype.includes('text/event-stream') || !resp.body) {
    try {
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) return { error: '模型返回了空内容' };
      onDelta(content);
      return { content };
    } catch {
      return { error: '响应不是有效 JSON（端点可能不兼容 OpenAI 格式）' };
    }
  }
  // SSE 解析
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = j.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            onDelta(full);
          }
        } catch {
          /* 半行 JSON 忽略 */
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { error: '已取消' };
    return { error: `流式读取中断：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!full.trim()) return { error: '模型返回了空内容' };
  return { content: full };
}
