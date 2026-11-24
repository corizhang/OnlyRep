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
