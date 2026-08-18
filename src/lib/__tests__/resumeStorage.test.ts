import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteResumeDraft,
  loadResumeDraft,
  RESUME_DRAFT_STORAGE_KEY,
  saveResumeDraft,
} from '../resumeStorage';
import type { GeneratedResume } from '../types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const resume: GeneratedResume = {
  personal: {
    name: '张三',
    headline: '后端工程师',
    phone: '',
    email: '',
    location: '上海',
    website: '',
  },
  summary: '三年后端开发经验。',
  skills: [{ category: '后端', items: ['Go', 'MySQL'] }],
  experience: [{
    company: '示例科技',
    role: '后端工程师',
    startDate: '2023.06',
    endDate: '至今',
    highlights: ['负责订单服务开发'],
  }],
  projects: [],
  education: [],
};

describe('resume draft storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('stores, loads, and clears an editable resume draft', async () => {
    await saveResumeDraft(' 三年 Go 后端工程师 ', 'modern', resume);
    expect(await loadResumeDraft()).toMatchObject({
      description: '三年 Go 后端工程师',
      template: 'modern',
      resume: { personal: { name: '张三' } },
    });

    await deleteResumeDraft();
    expect(await loadResumeDraft()).toBeNull();
  });

  it('reports corrupted drafts without deleting them', async () => {
    localStorage.setItem(RESUME_DRAFT_STORAGE_KEY, '{broken');
    await expect(loadResumeDraft()).rejects.toThrow('简历草稿损坏');
    expect(localStorage.getItem(RESUME_DRAFT_STORAGE_KEY)).toBe('{broken');
  });
});
