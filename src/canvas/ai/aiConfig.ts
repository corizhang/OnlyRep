import { appStorage } from '../../storage/safeStorage';

/** AI 配置（OpenAI 兼容端点）：仅存本机，绝不外带 */
export interface AiConfig {
  endpoint: string; // OpenAI 兼容服务地址（如 DeepSeek /v1）
  apiKey: string;
  model: string; // 如 deepseek-chat
  /** 是否允许把数据样本（前 3 行）发给 AI（默认关——只发列结构） */
  sendSampleRows: boolean;
}

const KEY = 'onlyrep-ai-config';

export function loadAiConfig(): AiConfig {
  try {
    const raw = appStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<AiConfig>;
      return { endpoint: d.endpoint ?? '', apiKey: d.apiKey ?? '', model: d.model ?? '', sendSampleRows: d.sendSampleRows === true };
    }
  } catch {
    /* 降级 */
  }
  return { endpoint: '', apiKey: '', model: '', sendSampleRows: false };
}

export function saveAiConfig(c: AiConfig): void {
  try {
    appStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 降级 */
  }
}

export function aiConfigured(c: AiConfig): boolean {
  return Boolean(c.endpoint.trim() && c.apiKey.trim() && c.model.trim());
}
