import type { GeneratedResume, ResumeTemplate } from './types';

export const RESUME_DRAFT_STORAGE_KEY = 'mianshi-resume-draft-v1';

export interface ResumeDraft {
  description: string;
  template: ResumeTemplate;
  resume: GeneratedResume;
  updatedAt: string;
}

const RESUME_TEMPLATES = new Set<ResumeTemplate>(['classic', 'modern', 'minimal']);

function storage(): Storage {
  if (typeof localStorage === 'undefined') {
    throw new Error('当前环境不支持本地存储');
  }
  return localStorage;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => typeof value[field] === 'string');
}

function isGeneratedResume(value: unknown): value is GeneratedResume {
  if (!value || typeof value !== 'object') return false;
  const resume = value as Partial<GeneratedResume>;
  const personal = resume.personal;
  return isRecord(personal)
    && hasStringFields(personal, ['name', 'headline', 'phone', 'email', 'location', 'website'])
    && typeof resume.summary === 'string'
    && Array.isArray(resume.skills)
    && resume.skills.every((group) => (
      isRecord(group)
      && typeof group.category === 'string'
      && isStringArray(group.items)
    ))
    && Array.isArray(resume.experience)
    && resume.experience.every((entry) => (
      isRecord(entry)
      && hasStringFields(entry, ['company', 'role', 'startDate', 'endDate'])
      && isStringArray(entry.highlights)
    ))
    && Array.isArray(resume.projects)
    && resume.projects.every((project) => (
      isRecord(project)
      && hasStringFields(project, ['name', 'role', 'startDate', 'endDate', 'summary'])
      && isStringArray(project.highlights)
      && isStringArray(project.technologies)
    ))
    && Array.isArray(resume.education)
    && resume.education.every((education) => (
      isRecord(education)
      && hasStringFields(education, ['school', 'degree', 'major', 'startDate', 'endDate'])
      && isStringArray(education.highlights)
    ));
}

function isResumeDraft(value: unknown): value is ResumeDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ResumeDraft>;
  return typeof draft.description === 'string'
    && typeof draft.template === 'string'
    && RESUME_TEMPLATES.has(draft.template as ResumeTemplate)
    && typeof draft.updatedAt === 'string'
    && isGeneratedResume(draft.resume);
}

export async function loadResumeDraft(): Promise<ResumeDraft | null> {
  const raw = storage().getItem(RESUME_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isResumeDraft(parsed)) throw new Error('数据结构无效');
    return structuredClone(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`简历草稿损坏：${reason}`);
  }
}

export async function saveResumeDraft(
  description: string,
  template: ResumeTemplate,
  resume: GeneratedResume,
): Promise<ResumeDraft> {
  const draft: ResumeDraft = {
    description: description.trim().slice(0, 2_000),
    template,
    resume: structuredClone(resume),
    updatedAt: new Date().toISOString(),
  };
  if (!isResumeDraft(draft)) throw new Error('简历草稿结构无效');
  try {
    storage().setItem(RESUME_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    throw new Error(`无法保存简历草稿：${error instanceof Error ? error.message : String(error)}`);
  }
  return draft;
}

export async function deleteResumeDraft(): Promise<void> {
  storage().removeItem(RESUME_DRAFT_STORAGE_KEY);
}
