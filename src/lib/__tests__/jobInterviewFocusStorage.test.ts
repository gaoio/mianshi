import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteJobInterviewFocusDraft,
  JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY,
  loadJobInterviewFocusDraft,
  saveJobInterviewFocusDraft,
} from '../jobInterviewFocusStorage';
import type { JobInterviewFocus } from '../types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const focus: JobInterviewFocus = {
  targetRole: 'Go 后端工程师',
  overview: '重点考察服务端基础与高并发系统设计。',
  keywords: ['Go', 'MySQL', 'Redis'],
  focusAreas: [{
    title: '高并发系统设计',
    priority: 3,
    reason: 'JD 多次强调高可用与性能治理。',
    keyPoints: ['限流、熔断和降级', '容量评估与压测'],
    likelyQuestions: ['如何设计一个高并发订单服务？'],
  }],
  preparationChecklist: ['准备一个性能优化案例', '复盘核心项目的技术取舍', '整理反问问题'],
};

describe('job interview focus draft storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('stores, loads, and clears a JD focus draft', async () => {
    await saveJobInterviewFocusDraft('完整招聘 JD 内容', focus);
    expect(await loadJobInterviewFocusDraft()).toMatchObject({
      jobDescription: '完整招聘 JD 内容',
      focus: { targetRole: 'Go 后端工程师' },
    });
    await deleteJobInterviewFocusDraft();
    expect(await loadJobInterviewFocusDraft()).toBeNull();
  });

  it('reports corrupted drafts without deleting them', async () => {
    localStorage.setItem(JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY, '{broken');
    await expect(loadJobInterviewFocusDraft()).rejects.toThrow('面试重点草稿损坏');
    expect(localStorage.getItem(JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY)).toBe('{broken');
  });

  it('rejects a focus area with an invalid priority', async () => {
    localStorage.setItem(JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY, JSON.stringify({
      jobDescription: '完整招聘 JD 内容',
      focus: {
        ...focus,
        focusAreas: [{ ...focus.focusAreas[0], priority: 4 }],
      },
      updatedAt: new Date().toISOString(),
    }));
    await expect(loadJobInterviewFocusDraft()).rejects.toThrow('数据结构无效');
  });
});
