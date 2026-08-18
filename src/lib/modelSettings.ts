import { invoke } from '@tauri-apps/api/core';
import type {
  GeneratedInterviewExperience,
  GeneratedResume,
  GenerationResume,
  JobApplicationAnalysis,
  JobInterviewFocus,
} from './types';
import { getModelSettingsRecord, saveModelSettingsRecord } from './localStorage';

export interface ModelSettings {
  protocol: ModelProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  contextLength: number;
  outputLength: number;
}

export type ModelProtocol = 'openai' | 'responses' | 'anthropic';

interface ModelProtocolOption {
  value: ModelProtocol;
  label: string;
  shortLabel: string;
  description: string;
  baseUrlPlaceholder: string;
  baseUrlHelp: string;
  authHelp: string;
}

export const MODEL_PROTOCOL_OPTIONS: readonly ModelProtocolOption[] = [
  {
    value: 'openai',
    label: 'OpenAI Chat Completions',
    shortLabel: 'OpenAI',
    description: '适用于 OpenAI、DeepSeek、通义千问等兼容服务',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    baseUrlHelp: '应用会自动追加 /chat/completions',
    authHelp: '使用 Authorization: Bearer API_KEY 鉴权',
  },
  {
    value: 'responses',
    label: 'OpenAI Responses',
    shortLabel: 'Responses',
    description: '适用于 OpenAI 新版 Responses API 与兼容服务',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    baseUrlHelp: '应用会自动追加 /responses',
    authHelp: '使用 Authorization: Bearer API_KEY 鉴权',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Messages',
    shortLabel: 'Anthropic',
    description: '适用于 Claude 与 Anthropic Messages 兼容服务',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    baseUrlHelp: '应用会自动追加 /v1/messages',
    authHelp: '使用 x-api-key 与 anthropic-version 鉴权',
  },
] as const;

const MODEL_PROTOCOL_VALUES = new Set<ModelProtocol>(
  MODEL_PROTOCOL_OPTIONS.map((option) => option.value),
);

export const DEFAULT_MODEL_BASE_URLS: Record<ModelProtocol, string> = {
  openai: 'https://api.openai.com/v1',
  responses: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
};

export const DEFAULT_MODEL_CONTEXT_LENGTH = 131_072;
export const DEFAULT_MODEL_OUTPUT_LENGTH = 12_000;

interface AnalyzeInterviewRequest {
  settings: ModelSettings;
  rawContent: string;
  preferredTitle: string;
  generationId: number;
  resume?: GenerationResume;
}

export const EMPTY_MODEL_SETTINGS: ModelSettings = {
  protocol: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  contextLength: DEFAULT_MODEL_CONTEXT_LENGTH,
  outputLength: DEFAULT_MODEL_OUTPUT_LENGTH,
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type PersistedModelSettings = Partial<ModelSettings> & { endpoint?: unknown };

function normalizeInteger(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeBaseUrl(protocol: ModelProtocol, value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const suffix = protocol === 'openai'
      ? '/chat/completions'
      : protocol === 'responses' ? '/responses' : '/v1/messages';
    if (url.pathname.endsWith(suffix)) {
      url.pathname = url.pathname.slice(0, -suffix.length) || '/';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

export function normalizeModelSettings(
  value: PersistedModelSettings | null | undefined,
): ModelSettings {
  const protocol = MODEL_PROTOCOL_VALUES.has(value?.protocol as ModelProtocol)
    ? value?.protocol as ModelProtocol
    : 'openai';
  const storedBaseUrl = value?.baseUrl ?? value?.endpoint;
  return {
    protocol,
    baseUrl: normalizeBaseUrl(protocol, storedBaseUrl),
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey.trim() : '',
    model: typeof value?.model === 'string' ? value.model.trim() : '',
    contextLength: normalizeInteger(value?.contextLength, DEFAULT_MODEL_CONTEXT_LENGTH),
    outputLength: normalizeInteger(value?.outputLength, DEFAULT_MODEL_OUTPUT_LENGTH),
  };
}

export function modelProtocolOption(protocol: ModelProtocol): ModelProtocolOption {
  return MODEL_PROTOCOL_OPTIONS.find((option) => option.value === protocol)
    ?? MODEL_PROTOCOL_OPTIONS[0];
}

export function switchModelProtocol(
  settings: ModelSettings,
  protocol: ModelProtocol,
): ModelSettings {
  const normalized = normalizeModelSettings(settings);
  const knownDefault = Object.values(DEFAULT_MODEL_BASE_URLS).includes(normalized.baseUrl);
  const staysInOpenAiFamily = normalized.protocol !== 'anthropic' && protocol !== 'anthropic';
  return {
    ...normalized,
    protocol,
    baseUrl: !normalized.baseUrl || knownDefault
      ? DEFAULT_MODEL_BASE_URLS[protocol]
      : staysInOpenAiFamily ? normalized.baseUrl : '',
  };
}

export function validateModelSettings(settings: ModelSettings): string[] {
  const normalized = normalizeModelSettings(settings);
  const errors: string[] = [];

  if (!normalized.baseUrl) {
    errors.push('请输入 Base URL');
  } else {
    try {
      const url = new URL(normalized.baseUrl);
      if (url.protocol !== 'https:') errors.push('Base URL 必须使用 HTTPS');
      if (url.username || url.password) errors.push('Base URL 不能包含用户名或密码');
      if (url.port) errors.push('Base URL 不能使用自定义端口');
      if (url.hash) errors.push('Base URL 不能包含锚点');
    } catch {
      errors.push('Base URL 格式不正确');
    }
  }

  if (!normalized.apiKey) errors.push('请输入 API Key');
  if (normalized.apiKey.length > 4096) errors.push('API Key 长度异常');
  if (/\p{Cc}/u.test(normalized.apiKey)) errors.push('API Key 包含无效控制字符');
  if (!normalized.model) errors.push('请输入模型名称');
  if (normalized.model.length > 200) errors.push('模型名称过长');
  if (!Number.isSafeInteger(normalized.contextLength) || normalized.contextLength <= 0) {
    errors.push('上下文长度必须是正整数');
  }
  if (!Number.isSafeInteger(normalized.outputLength) || normalized.outputLength <= 0) {
    errors.push('输出长度必须是正整数');
  }
  if (normalized.outputLength >= normalized.contextLength) {
    errors.push('上下文长度必须大于输出长度');
  }

  return [...new Set(errors)];
}

export async function loadModelSettings(): Promise<ModelSettings> {
  const stored = await getModelSettingsRecord();
  if (!stored) return { ...EMPTY_MODEL_SETTINGS };
  return normalizeModelSettings({
    protocol: stored.protocol as ModelProtocol,
    baseUrl: stored.base_url,
    apiKey: stored.api_key,
    model: stored.model,
    contextLength: stored.context_length,
    outputLength: stored.output_length,
  });
}

export async function saveModelSettings(settings: ModelSettings): Promise<ModelSettings> {
  const normalized = normalizeModelSettings(settings);
  const errors = validateModelSettings(normalized);
  if (errors.length > 0) throw new Error(errors[0]);

  await saveModelSettingsRecord({
    protocol: normalized.protocol,
    base_url: normalized.baseUrl,
    api_key: normalized.apiKey,
    model: normalized.model,
    context_length: normalized.contextLength,
    output_length: normalized.outputLength,
  });
  return normalized;
}

function assertNativeRuntime(): void {
  if (!isTauriRuntime()) {
    throw new Error('AI 解析仅支持桌面端或 Android App');
  }
}

export async function testModelConnection(settings: ModelSettings): Promise<string> {
  assertNativeRuntime();
  return invoke<string>('test_model_connection', { settings: normalizeModelSettings(settings) });
}

export async function generateResume(
  settings: ModelSettings,
  description: string,
): Promise<GeneratedResume> {
  assertNativeRuntime();
  const normalizedDescription = description.trim();
  const descriptionLength = Array.from(normalizedDescription).length;
  if (descriptionLength < 5) throw new Error('请至少用 5 个字符描述你的简历');
  if (descriptionLength > 2_000) throw new Error('简历描述不能超过 2000 个字符');

  return invoke<GeneratedResume>('generate_resume', {
    request: {
      settings: normalizeModelSettings(settings),
      description: normalizedDescription,
    },
  });
}

export async function analyzeJobApplication(
  settings: ModelSettings,
  resumeText: string,
  jobDescription: string,
): Promise<JobApplicationAnalysis> {
  assertNativeRuntime();
  const normalizedResume = resumeText.trim();
  const normalizedJobDescription = jobDescription.trim();
  const resumeLength = Array.from(normalizedResume).length;
  const jobDescriptionLength = Array.from(normalizedJobDescription).length;
  if (resumeLength < 20) throw new Error('简历内容至少需要 20 个字符');
  if (resumeLength > 50_000) throw new Error('简历内容不能超过 50000 个字符');
  if (jobDescriptionLength < 20) throw new Error('招聘 JD 至少需要 20 个字符');
  if (jobDescriptionLength > 30_000) throw new Error('招聘 JD 不能超过 30000 个字符');

  return invoke<JobApplicationAnalysis>('analyze_job_application', {
    request: {
      settings: normalizeModelSettings(settings),
      resumeText: normalizedResume,
      jobDescription: normalizedJobDescription,
    },
  });
}

export async function analyzeJobInterviewFocus(
  settings: ModelSettings,
  jobDescription: string,
): Promise<JobInterviewFocus> {
  assertNativeRuntime();
  const normalizedJobDescription = jobDescription.trim();
  const jobDescriptionLength = Array.from(normalizedJobDescription).length;
  if (jobDescriptionLength < 20) throw new Error('招聘 JD 至少需要 20 个字符');
  if (jobDescriptionLength > 30_000) throw new Error('招聘 JD 不能超过 30000 个字符');

  return invoke<JobInterviewFocus>('analyze_job_interview_focus', {
    request: {
      settings: normalizeModelSettings(settings),
      jobDescription: normalizedJobDescription,
    },
  });
}

export async function analyzeInterviewExperience(
  request: AnalyzeInterviewRequest,
): Promise<GeneratedInterviewExperience> {
  assertNativeRuntime();
  const rawContent = request.rawContent.trim();
  if (rawContent.length < 20) throw new Error('面经内容至少需要 20 个字符');
  if (rawContent.length > 100000) throw new Error('面经内容不能超过 100000 个字符');

  return invoke<GeneratedInterviewExperience>('analyze_interview_experience', {
    request: {
      settings: normalizeModelSettings(request.settings),
      rawContent,
      preferredTitle: request.preferredTitle.trim(),
      generationId: request.generationId,
      resume: request.resume ?? null,
    },
  });
}

export async function cancelInterviewGeneration(generationId: number): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('cancel_interview_generation', { generationId });
}

export function modelSettingsSummary(settings: ModelSettings): string {
  const normalized = normalizeModelSettings(settings);
  if (!normalized.baseUrl || !normalized.model) return '尚未配置';
  return `${modelProtocolOption(normalized.protocol).shortLabel} · ${normalized.model}`;
}
