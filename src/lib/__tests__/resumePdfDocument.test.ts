import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildResumePdf } from '../resumePdfDocument';
import { createResumePdfFilename } from '../resumePdfExport';
import type { GeneratedResume, ResumeTemplate } from '../types';

const fontPath = new URL('../../assets/fonts/NotoSansSC-Regular.subset.ttf', import.meta.url);

const resume: GeneratedResume = {
  personal: {
    name: '张三',
    headline: '高级 Go 后端工程师',
    phone: '138 0000 0000',
    email: 'zhangsan@example.com',
    location: '上海',
    website: 'github.com/zhangsan',
  },
  summary: '五年后端研发经验，专注高并发交易系统、服务稳定性与工程效率建设。',
  skills: [
    { category: '后端开发', items: ['Go', 'Java', 'RESTful API', '微服务'] },
    { category: '数据与中间件', items: ['MySQL', 'Redis', 'Kafka', 'Elasticsearch'] },
  ],
  experience: [{
    company: '示例科技有限公司',
    role: '高级后端工程师',
    startDate: '2022.06',
    endDate: '至今',
    highlights: [
      '负责核心订单链路设计与交付，建立幂等、重试与补偿机制。',
      '推动服务可观测性建设，完善指标、日志和链路追踪。',
    ],
  }],
  projects: [{
    name: '电商订单平台',
    role: '核心开发',
    startDate: '2023.01',
    endDate: '2025.06',
    summary: '面向多渠道交易场景的订单履约平台。',
    highlights: ['设计状态机与消息驱动架构，降低跨服务耦合。'],
    technologies: ['Go', 'MySQL', 'Redis', 'Kafka'],
  }],
  education: [{
    school: '示例大学',
    degree: '本科',
    major: '计算机科学与技术',
    startDate: '2017.09',
    endDate: '2021.06',
    highlights: [],
  }],
};

describe('buildResumePdf', () => {
  it('generates a valid PDF for every resume template', async () => {
    const fontBytes = new Uint8Array(await readFile(fontPath));
    for (const template of ['classic', 'modern', 'minimal'] satisfies ResumeTemplate[]) {
      const bytes = await buildResumePdf(resume, template, fontBytes, {
        generatedAt: new Date('2026-08-18T08:00:00.000Z'),
      });
      const parsed = await PDFDocument.load(bytes);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
      expect(parsed.getTitle()).toBe('张三 - 个人简历');
      expect(parsed.getSubject()).toContain('模板');
    }
  });

  it('paginates long resume content', async () => {
    const fontBytes = new Uint8Array(await readFile(fontPath));
    const longResume = structuredClone(resume);
    longResume.experience = Array.from({ length: 8 }, (_, index) => ({
      ...resume.experience[0],
      company: `示例科技 ${index + 1}`,
      highlights: Array.from({ length: 6 }, () => '负责复杂业务系统的架构设计、核心功能交付、稳定性治理与跨团队协作。'),
    }));
    const bytes = await buildResumePdf(longResume, 'modern', fontBytes);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(2);
  });
});

describe('createResumePdfFilename', () => {
  it('removes characters that are invalid in filenames', () => {
    expect(createResumePdfFilename('张三 / Go:后端?')).toBe('张三 Go 后端-个人简历.pdf');
  });
});
