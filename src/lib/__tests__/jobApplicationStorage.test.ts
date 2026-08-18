import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteJobApplicationDraft,
  JOB_APPLICATION_DRAFT_STORAGE_KEY,
  loadJobApplicationDraft,
  resumeToAnalysisText,
  saveJobApplicationDraft,
} from '../jobApplicationStorage';
import type { GeneratedResume, JobApplicationAnalysis } from '../types';

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
    name: '张三', headline: 'Go 后端工程师', phone: '', email: '', location: '上海', website: '',
  },
  summary: '三年后端开发经验。',
  skills: [{ category: '后端', items: ['Go', 'MySQL'] }],
  experience: [{
    company: '示例科技', role: '后端工程师', startDate: '2023.06', endDate: '至今',
    highlights: ['负责订单服务开发'],
  }],
  projects: [],
  education: [],
};

const analysis: JobApplicationAnalysis = {
  targetRole: 'Go 后端工程师',
  matchScore: 82,
  summary: '岗位基础匹配。',
  strengths: ['Go 开发经验'],
  gaps: ['容量经验待验证'],
  keywords: ['Go', 'MySQL'],
  resumeChanges: ['岗位技能前置'],
  interviewQuestions: Array.from({ length: 6 }, (_, index) => ({
    question: `问题 ${index + 1}`,
    category: '项目深挖',
    difficulty: 2 as const,
    whyAsked: '验证实际经验',
    answerGuide: ['说明背景', '说明取舍'],
  })),
  optimizedResume: resume,
};

describe('job application draft storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('stores, loads, and clears the local analysis draft', async () => {
    await saveJobApplicationDraft('我的完整简历内容', '完整招聘 JD 内容', 'modern', analysis);
    expect(await loadJobApplicationDraft()).toMatchObject({
      template: 'modern',
      analysis: { targetRole: 'Go 后端工程师', matchScore: 82 },
    });
    await deleteJobApplicationDraft();
    expect(await loadJobApplicationDraft()).toBeNull();
  });

  it('converts an existing structured resume into editable analysis text', () => {
    const text = resumeToAnalysisText(resume);
    expect(text).toContain('姓名：张三');
    expect(text).toContain('后端：Go、MySQL');
    expect(text).toContain('示例科技｜后端工程师｜2023.06 - 至今');
  });

  it('reports corrupted drafts without deleting them', async () => {
    localStorage.setItem(JOB_APPLICATION_DRAFT_STORAGE_KEY, '{broken');
    await expect(loadJobApplicationDraft()).rejects.toThrow('岗位分析草稿损坏');
    expect(localStorage.getItem(JOB_APPLICATION_DRAFT_STORAGE_KEY)).toBe('{broken');
  });
});
