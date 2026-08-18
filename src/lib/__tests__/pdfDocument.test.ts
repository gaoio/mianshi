import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildExperiencePdf } from '../pdfDocument';
import { createPdfFilename } from '../pdfExport';
import type { InterviewExperience, InterviewExperienceQuestion } from '../types';

const fontPath = new URL('../../assets/fonts/NotoSansSC-Regular.subset.ttf', import.meta.url);

const experience: InterviewExperience = {
  id: 1,
  title: '后端开发面试复盘',
  raw_content: '',
  summary: '覆盖 Go 并发、数据库索引与缓存一致性，适合在面试前集中复习。',
  model_name: 'test-model',
  question_count: 1,
  created_at: '2026-08-18T08:00:00.000Z',
  updated_at: '2026-08-18T08:00:00.000Z',
};

const question: InterviewExperienceQuestion = {
  id: 1,
  experience_id: 1,
  position: 0,
  title: 'Go 的 goroutine 调度模型是什么？🚀',
  answer: '【结论】\nGo 使用 G-M-P 调度模型。\n【原理】\nG 表示 goroutine，M 表示系统线程，P 持有运行 Go 代码所需的资源。',
  code: 'go func() {\n    fmt.Println("hello")\n}()',
  code_language: 'go',
  difficulty: 2,
  tags: 'Go,并发',
  sources_json: JSON.stringify([{ title: 'Go 调度器设计文档', url: 'https://go.dev/src/runtime/HACKING.md' }]),
  created_at: '2026-08-18T08:00:00.000Z',
};

describe('buildExperiencePdf', () => {
  it('生成包含封面和题目内容的有效多页 PDF', async () => {
    const fontBytes = new Uint8Array(await readFile(fontPath));
    const bytes = await buildExperiencePdf(experience, [question], fontBytes, {
      generatedAt: new Date('2026-08-18T08:00:00.000Z'),
    });
    const parsed = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(parsed.getTitle()).toBe('后端开发面试复盘 - 面经题单');
  });

  it('长答案能够自动分页', async () => {
    const fontBytes = new Uint8Array(await readFile(fontPath));
    const longQuestion = { ...question, answer: `【结论】\n${'这是一段用于验证自动分页的详细答案。'.repeat(500)}` };
    const bytes = await buildExperiencePdf(experience, [longQuestion], fontBytes);
    const parsed = await PDFDocument.load(bytes);

    expect(parsed.getPageCount()).toBeGreaterThan(2);
  });
});

describe('createPdfFilename', () => {
  it('移除文件系统不允许的字符', () => {
    expect(createPdfFilename('Java / Go: 面试?')).toBe('Java Go 面试-面经题单.pdf');
  });
});
