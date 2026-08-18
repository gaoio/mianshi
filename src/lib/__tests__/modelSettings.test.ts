import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_CONTEXT_LENGTH,
  DEFAULT_MODEL_BASE_URLS,
  DEFAULT_MODEL_OUTPUT_LENGTH,
  MODEL_PROTOCOL_OPTIONS,
  modelSettingsSummary,
  normalizeModelSettings,
  switchModelProtocol,
  validateModelSettings,
} from '../modelSettings';

const tokenSettings = {
  contextLength: DEFAULT_MODEL_CONTEXT_LENGTH,
  outputLength: DEFAULT_MODEL_OUTPUT_LENGTH,
};

describe('model settings', () => {
  it('normalizes persisted values and renders a safe summary', () => {
    const settings = normalizeModelSettings({
      baseUrl: '  https://api.example.com/v1  ',
      apiKey: '  secret-key  ',
      model: '  example-chat  ',
    });

    expect(settings).toEqual({
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-key',
      model: 'example-chat',
      ...tokenSettings,
    });
    expect(modelSettingsSummary(settings)).toBe('OpenAI · example-chat');
    expect(modelSettingsSummary(settings)).not.toContain('secret-key');
  });

  it('accepts a complete HTTPS Chat Completions configuration', () => {
    expect(validateModelSettings({
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-key',
      model: 'example-chat',
      ...tokenSettings,
    })).toEqual([]);
  });

  it.each([
    'http://api.example.com/v1/chat/completions',
    'https://user:pass@api.example.com/v1/chat/completions',
    'https://api.example.com:8443/v1/chat/completions',
    'not a url',
  ])('rejects unsafe Base URL %s', (baseUrl) => {
    expect(validateModelSettings({
      protocol: 'openai', baseUrl, apiKey: 'key', model: 'model', ...tokenSettings,
    }).length).toBeGreaterThan(0);
  });

  it('supports three protocols and only preserves compatible Base URLs when switching', () => {
    expect(MODEL_PROTOCOL_OPTIONS.map((option) => option.value)).toEqual([
      'openai', 'responses', 'anthropic',
    ]);

    const defaults = switchModelProtocol({
      protocol: 'openai',
      baseUrl: DEFAULT_MODEL_BASE_URLS.openai,
      apiKey: 'key',
      model: 'model',
      ...tokenSettings,
    }, 'responses');
    expect(defaults.baseUrl).toBe(DEFAULT_MODEL_BASE_URLS.responses);

    const custom = switchModelProtocol({
      ...defaults,
      baseUrl: 'https://gateway.example.com/custom',
    }, 'anthropic');
    expect(custom.baseUrl).toBe('');

    const sameFamily = switchModelProtocol({
      ...defaults,
      baseUrl: 'https://gateway.example.com/v1',
    }, 'openai');
    expect(sameFamily.baseUrl).toBe('https://gateway.example.com/v1');
  });

  it('normalizes legacy full endpoints to Base URLs without provider-specific rules', () => {
    expect(normalizeModelSettings({
      protocol: 'openai',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
    }).baseUrl).toBe('https://api.deepseek.com/v1');
    expect(normalizeModelSettings({
      protocol: 'responses',
      endpoint: 'https://gateway.example.com/v1/responses',
    }).baseUrl).toBe('https://gateway.example.com/v1');
    expect(normalizeModelSettings({
      protocol: 'anthropic',
      endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    }).baseUrl).toBe('https://api.deepseek.com/anthropic');
  });

  it('preserves explicit protocols and defaults old settings to OpenAI', () => {
    expect(normalizeModelSettings({ protocol: 'anthropic' }).protocol).toBe('anthropic');
    expect(normalizeModelSettings({}).protocol).toBe('openai');
  });

  it('normalizes token limits and validates their relationship', () => {
    const legacy = normalizeModelSettings({});
    expect(legacy.contextLength).toBe(DEFAULT_MODEL_CONTEXT_LENGTH);
    expect(legacy.outputLength).toBe(DEFAULT_MODEL_OUTPUT_LENGTH);

    const configured = normalizeModelSettings({
      contextLength: 262_144,
      outputLength: 32_768,
    });
    expect(configured.contextLength).toBe(262_144);
    expect(configured.outputLength).toBe(32_768);

    expect(validateModelSettings({
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'key',
      model: 'model',
      contextLength: 4_096,
      outputLength: 4_096,
    })).toContain('上下文长度必须大于输出长度');

    expect(validateModelSettings({
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'key',
      model: 'model',
      contextLength: Number.MAX_SAFE_INTEGER,
      outputLength: 1,
    })).toEqual([]);
  });
});
