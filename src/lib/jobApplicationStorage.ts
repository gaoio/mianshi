import { isGeneratedResume } from './resumeStorage';
import type {
  GeneratedResume,
  JobApplicationAnalysis,
  ResumeTemplate,
} from './types';

export const JOB_APPLICATION_DRAFT_STORAGE_KEY = 'mianshi-job-application-draft-v1';

export interface JobApplicationDraft {
  resumeText: string;
  jobDescription: string;
  template: ResumeTemplate;
  analysis: JobApplicationAnalysis | null;
  updatedAt: string;
}

const RESUME_TEMPLATES = new Set<ResumeTemplate>(['classic', 'modern', 'minimal']);

function storage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('当前环境不支持本地存储');
  return localStorage;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isJobApplicationAnalysis(value: unknown): value is JobApplicationAnalysis {
  if (!value || typeof value !== 'object') return false;
  const analysis = value as Partial<JobApplicationAnalysis>;
  return typeof analysis.targetRole === 'string'
    && typeof analysis.matchScore === 'number'
    && Number.isInteger(analysis.matchScore)
    && analysis.matchScore >= 0
    && analysis.matchScore <= 100
    && typeof analysis.summary === 'string'
    && isStringArray(analysis.strengths)
    && isStringArray(analysis.gaps)
    && isStringArray(analysis.keywords)
    && isStringArray(analysis.resumeChanges)
    && Array.isArray(analysis.interviewQuestions)
    && analysis.interviewQuestions.every((question) => (
      Boolean(question)
      && typeof question === 'object'
      && typeof question.question === 'string'
      && typeof question.category === 'string'
      && [1, 2, 3].includes(question.difficulty)
      && typeof question.whyAsked === 'string'
      && isStringArray(question.answerGuide)
    ))
    && isGeneratedResume(analysis.optimizedResume);
}

function isJobApplicationDraft(value: unknown): value is JobApplicationDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<JobApplicationDraft>;
  return typeof draft.resumeText === 'string'
    && typeof draft.jobDescription === 'string'
    && typeof draft.template === 'string'
    && RESUME_TEMPLATES.has(draft.template as ResumeTemplate)
    && typeof draft.updatedAt === 'string'
    && (draft.analysis === null || isJobApplicationAnalysis(draft.analysis));
}

function lines(title: string, items: string[]): string[] {
  return items.length > 0 ? [title, ...items.map((item) => `- ${item}`)] : [];
}

export function resumeToAnalysisText(resume: GeneratedResume): string {
  const contact = [
    resume.personal.phone,
    resume.personal.email,
    resume.personal.location,
    resume.personal.website,
  ].filter(Boolean).join(' · ');
  const sections = [
    `姓名：${resume.personal.name}`,
    `职业定位：${resume.personal.headline}`,
    contact ? `联系方式：${contact}` : '',
    '',
    '个人优势',
    resume.summary,
    '',
    ...lines('专业技能', resume.skills.map((group) => `${group.category}：${group.items.join('、')}`)),
    '',
    ...lines('工作经历', resume.experience.flatMap((entry) => [
      `${entry.company}｜${entry.role}｜${[entry.startDate, entry.endDate].filter(Boolean).join(' - ')}`,
      ...entry.highlights,
    ])),
    '',
    ...lines('项目经历', resume.projects.flatMap((project) => [
      `${project.name}｜${project.role}｜${[project.startDate, project.endDate].filter(Boolean).join(' - ')}`,
      project.summary,
      ...project.highlights,
      project.technologies.length > 0 ? `技术栈：${project.technologies.join('、')}` : '',
    ].filter(Boolean))),
    '',
    ...lines('教育经历', resume.education.flatMap((education) => [
      `${education.school}｜${education.degree} ${education.major}｜${[education.startDate, education.endDate].filter(Boolean).join(' - ')}`,
      ...education.highlights,
    ])),
  ];
  return sections.filter((line, index) => line || sections[index - 1] !== '').join('\n').trim();
}

export async function loadJobApplicationDraft(): Promise<JobApplicationDraft | null> {
  const raw = storage().getItem(JOB_APPLICATION_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJobApplicationDraft(parsed)) throw new Error('数据结构无效');
    return structuredClone(parsed);
  } catch (error) {
    throw new Error(`岗位分析草稿损坏：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveJobApplicationDraft(
  resumeText: string,
  jobDescription: string,
  template: ResumeTemplate,
  analysis: JobApplicationAnalysis | null,
): Promise<JobApplicationDraft> {
  const draft: JobApplicationDraft = {
    resumeText: resumeText.slice(0, 50_000),
    jobDescription: jobDescription.slice(0, 30_000),
    template,
    analysis: analysis ? structuredClone(analysis) : null,
    updatedAt: new Date().toISOString(),
  };
  if (!isJobApplicationDraft(draft)) throw new Error('岗位分析草稿结构无效');
  try {
    storage().setItem(JOB_APPLICATION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    throw new Error(`无法保存岗位分析草稿：${error instanceof Error ? error.message : String(error)}`);
  }
  return draft;
}

export async function deleteJobApplicationDraft(): Promise<void> {
  storage().removeItem(JOB_APPLICATION_DRAFT_STORAGE_KEY);
}
