import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_STORAGE_KEY,
  createInterviewExperience,
  deleteGenerationDraft,
  deleteInterviewExperience,
  getInterviewExperience,
  getInterviewExperienceQuestion,
  getModelSettingsRecord,
  listInterviewExperienceQuestions,
  listInterviewExperiences,
  loadGenerationDraft,
  saveGenerationDraft,
  saveModelSettingsRecord,
} from '../localStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const generated = {
  title: 'Go 后端一面',
  summary: '并发与缓存',
  questions: [{
    title: 'GMP 如何调度？',
    answer: '【结论】GMP 负责调度。',
    code: '',
    codeLanguage: 'text',
    difficulty: 2 as const,
    tags: ['Golang', '并发'],
    sources: [{ title: 'Go Documentation', url: 'https://go.dev/doc/' }],
  }],
};

describe('app local storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('stores the complete model configuration locally', async () => {
    await saveModelSettingsRecord({
      protocol: 'openai',
      base_url: 'https://api.example.com/v1',
      api_key: 'local-api-key',
      model: 'example-chat',
      context_length: 131072,
      output_length: 12000,
    });

    expect(await getModelSettingsRecord()).toMatchObject({
      api_key: 'local-api-key',
      model: 'example-chat',
    });
  });

  it('stores and clears generation drafts', async () => {
    await saveGenerationDraft({
      rawContent: '这是一段长度已经足够的待解析面经原文内容。',
      preferredTitle: '后端面试',
      modelName: 'example-chat',
      outline: {
        title: generated.title,
        summary: generated.summary,
        questions: generated.questions.map(({ title, difficulty, tags }) => ({
          title, difficulty, tags,
        })),
      },
      questions: generated.questions,
    });

    expect((await loadGenerationDraft())?.preferredTitle).toBe('后端面试');
    await deleteGenerationDraft();
    expect(await loadGenerationDraft()).toBeNull();
  });

  it('creates, queries, and cascades deletion of an experience', async () => {
    const id = await createInterviewExperience({
      rawContent: '这是一段用于测试的完整面经原文。',
      modelName: 'example-chat',
      generated,
    });

    expect(id).toBe(1);
    expect(await listInterviewExperiences()).toMatchObject([{
      id: 1,
      title: generated.title,
      question_count: 1,
    }]);
    expect((await getInterviewExperience(id))?.question_count).toBe(1);
    const questions = await listInterviewExperienceQuestions(id);
    expect(questions).toHaveLength(1);
    expect((await getInterviewExperienceQuestion(questions[0].id))?.title).toBe('GMP 如何调度？');

    await deleteInterviewExperience(id);
    expect(await listInterviewExperiences()).toEqual([]);
    expect(await listInterviewExperienceQuestions(id)).toEqual([]);
  });

  it('reports corrupted local data instead of silently deleting it', async () => {
    localStorage.setItem(APP_STORAGE_KEY, '{broken');
    await expect(listInterviewExperiences()).rejects.toThrow('本地存储数据损坏');
    expect(localStorage.getItem(APP_STORAGE_KEY)).toBe('{broken');
  });
});
