import type { JobInterviewFocus } from './types';

export const JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY = 'mianshi-job-interview-focus-draft-v1';

export interface JobInterviewFocusDraft {
  jobDescription: string;
  focus: JobInterviewFocus | null;
  updatedAt: string;
}

function storage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('当前环境不支持本地存储');
  return localStorage;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isJobInterviewFocus(value: unknown): value is JobInterviewFocus {
  if (!value || typeof value !== 'object') return false;
  const focus = value as Partial<JobInterviewFocus>;
  return typeof focus.targetRole === 'string'
    && typeof focus.overview === 'string'
    && isStringArray(focus.keywords)
    && isStringArray(focus.preparationChecklist)
    && Array.isArray(focus.focusAreas)
    && focus.focusAreas.every((area) => (
      Boolean(area)
      && typeof area === 'object'
      && typeof area.title === 'string'
      && [1, 2, 3].includes(area.priority)
      && typeof area.reason === 'string'
      && isStringArray(area.keyPoints)
      && isStringArray(area.likelyQuestions)
    ));
}

function isJobInterviewFocusDraft(value: unknown): value is JobInterviewFocusDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<JobInterviewFocusDraft>;
  return typeof draft.jobDescription === 'string'
    && typeof draft.updatedAt === 'string'
    && (draft.focus === null || isJobInterviewFocus(draft.focus));
}

export async function loadJobInterviewFocusDraft(): Promise<JobInterviewFocusDraft | null> {
  const raw = storage().getItem(JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJobInterviewFocusDraft(parsed)) throw new Error('数据结构无效');
    return structuredClone(parsed);
  } catch (error) {
    throw new Error(`面试重点草稿损坏：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveJobInterviewFocusDraft(
  jobDescription: string,
  focus: JobInterviewFocus | null,
): Promise<JobInterviewFocusDraft> {
  const draft: JobInterviewFocusDraft = {
    jobDescription: jobDescription.slice(0, 30_000),
    focus: focus ? structuredClone(focus) : null,
    updatedAt: new Date().toISOString(),
  };
  if (!isJobInterviewFocusDraft(draft)) throw new Error('面试重点草稿结构无效');
  try {
    storage().setItem(JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    throw new Error(`无法保存面试重点草稿：${error instanceof Error ? error.message : String(error)}`);
  }
  return draft;
}

export async function deleteJobInterviewFocusDraft(): Promise<void> {
  storage().removeItem(JOB_INTERVIEW_FOCUS_DRAFT_STORAGE_KEY);
}
