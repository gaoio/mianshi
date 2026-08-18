import type {
  GeneratedInterviewExperience,
  GeneratedInterviewOutline,
  GeneratedInterviewQuestion,
  InterviewExperience,
  InterviewExperienceQuestion,
} from './types';

export const APP_STORAGE_KEY = 'mianshi-app-data-v1';

type StoredExperience = Omit<InterviewExperience, 'question_count'>;

interface ModelSettingsRecord {
  protocol: string;
  base_url: string;
  api_key: string;
  model: string;
  context_length: number;
  output_length: number;
  updated_at?: string;
}

export interface GenerationDraft {
  rawContent: string;
  preferredTitle: string;
  modelName: string;
  outline: GeneratedInterviewOutline;
  questions: GeneratedInterviewQuestion[];
  updatedAt?: string;
}

interface StoredAppData {
  version: 1;
  nextExperienceId: number;
  nextQuestionId: number;
  modelSettings: ModelSettingsRecord | null;
  generationDraft: GenerationDraft | null;
  experiences: StoredExperience[];
  questions: InterviewExperienceQuestion[];
}

interface CreateInterviewExperienceInput {
  rawContent: string;
  modelName: string;
  generated: GeneratedInterviewExperience;
}

function emptyAppData(): StoredAppData {
  return {
    version: 1,
    nextExperienceId: 1,
    nextQuestionId: 1,
    modelSettings: null,
    generationDraft: null,
    experiences: [],
    questions: [],
  };
}

function getLocalStorage(): Storage {
  if (typeof localStorage === 'undefined') {
    throw new Error('当前环境不支持本地存储');
  }
  return localStorage;
}

function isStoredAppData(value: unknown): value is StoredAppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<StoredAppData>;
  return data.version === 1
    && Number.isSafeInteger(data.nextExperienceId)
    && Number.isSafeInteger(data.nextQuestionId)
    && Array.isArray(data.experiences)
    && Array.isArray(data.questions)
    && (data.modelSettings === null || typeof data.modelSettings === 'object')
    && (data.generationDraft === null || typeof data.generationDraft === 'object');
}

function readAppData(): StoredAppData {
  const raw = getLocalStorage().getItem(APP_STORAGE_KEY);
  if (!raw) return emptyAppData();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredAppData(parsed)) throw new Error('数据结构无效');
    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`本地存储数据损坏：${reason}`);
  }
}

function writeAppData(data: StoredAppData): void {
  try {
    getLocalStorage().setItem(APP_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('本地存储空间不足，请删除不再需要的面经后重试');
    }
    throw new Error(`无法写入本地存储：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getModelSettingsRecord(): Promise<ModelSettingsRecord | null> {
  const settings = readAppData().modelSettings;
  return settings ? { ...settings } : null;
}

export async function saveModelSettingsRecord(settings: ModelSettingsRecord): Promise<void> {
  const data = readAppData();
  data.modelSettings = {
    ...settings,
    updated_at: new Date().toISOString(),
  };
  writeAppData(data);
}

export async function loadGenerationDraft(): Promise<GenerationDraft | null> {
  const draft = readAppData().generationDraft;
  return draft ? structuredClone(draft) : null;
}

export async function saveGenerationDraft(draft: GenerationDraft): Promise<void> {
  const rawContent = draft.rawContent.trim();
  if (rawContent.length < 20 || rawContent.length > 100000) {
    throw new Error('草稿原文长度需在 20 到 100000 个字符之间');
  }
  if (!Array.isArray(draft.outline.questions) || !Array.isArray(draft.questions)) {
    throw new Error('草稿结构无效');
  }
  const data = readAppData();
  data.generationDraft = structuredClone({
    ...draft,
    rawContent,
    preferredTitle: draft.preferredTitle.trim(),
    modelName: draft.modelName.trim(),
    updatedAt: new Date().toISOString(),
  });
  writeAppData(data);
}

export async function deleteGenerationDraft(): Promise<void> {
  const data = readAppData();
  data.generationDraft = null;
  writeAppData(data);
}

export async function listInterviewExperiences(): Promise<InterviewExperience[]> {
  const data = readAppData();
  const questionCounts = new Map<number, number>();
  for (const question of data.questions) {
    questionCounts.set(question.experience_id, (questionCounts.get(question.experience_id) ?? 0) + 1);
  }
  return data.experiences
    .map((experience) => ({
      ...experience,
      question_count: questionCounts.get(experience.id) ?? 0,
    }))
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id);
}

export async function getInterviewExperience(id: number): Promise<InterviewExperience | null> {
  const data = readAppData();
  const experience = data.experiences.find((item) => item.id === id);
  if (!experience) return null;
  return {
    ...experience,
    question_count: data.questions.filter((question) => question.experience_id === id).length,
  };
}

export async function listInterviewExperienceQuestions(
  experienceId: number,
): Promise<InterviewExperienceQuestion[]> {
  return readAppData().questions
    .filter((question) => question.experience_id === experienceId)
    .sort((left, right) => left.position - right.position || left.id - right.id);
}

export async function getInterviewExperienceQuestion(
  id: number,
): Promise<InterviewExperienceQuestion | null> {
  return readAppData().questions.find((question) => question.id === id) ?? null;
}

function assertGeneratedExperience(generated: GeneratedInterviewExperience): void {
  const title = generated.title.trim();
  if (!title || title.length > 120) throw new Error('模型生成的面经标题无效');
  if (generated.questions.length < 1) throw new Error('模型没有识别出面试题');
  if (generated.questions.length > 80) throw new Error('单篇面经最多保存 80 道题');
  for (const [index, question] of generated.questions.entries()) {
    if (!question.title.trim() || question.title.trim().length > 300) {
      throw new Error(`第 ${index + 1} 道题标题无效`);
    }
    if (!question.answer.trim() || question.answer.trim().length > 20000) {
      throw new Error(`第 ${index + 1} 道题答案无效`);
    }
    if (![1, 2, 3].includes(question.difficulty)) {
      throw new Error(`第 ${index + 1} 道题难度无效`);
    }
    if (question.sources.length < 1 || question.sources.length > 4) {
      throw new Error(`第 ${index + 1} 道题必须包含 1 到 4 条参考文档`);
    }
    for (const source of question.sources) {
      if (!source.title.trim() || !source.url.trim()) {
        throw new Error(`第 ${index + 1} 道题包含无效参考文档`);
      }
    }
  }
}

export async function createInterviewExperience(
  input: CreateInterviewExperienceInput,
): Promise<number> {
  assertGeneratedExperience(input.generated);
  const rawContent = input.rawContent.trim();
  if (!rawContent || rawContent.length > 100000) throw new Error('面经原文长度无效');

  const data = readAppData();
  const experienceId = data.nextExperienceId;
  const timestamp = new Date().toISOString();
  const questions = input.generated.questions.map((question, position) => ({
    id: data.nextQuestionId + position,
    experience_id: experienceId,
    position,
    title: question.title.trim(),
    answer: question.answer.trim(),
    code: question.code.trim(),
    code_language: question.codeLanguage.trim() || 'text',
    difficulty: question.difficulty,
    tags: question.tags.map((tag) => tag.trim()).filter(Boolean).join(','),
    sources_json: JSON.stringify(question.sources),
    created_at: timestamp,
  } satisfies InterviewExperienceQuestion));

  data.experiences.push({
    id: experienceId,
    title: input.generated.title.trim(),
    raw_content: rawContent,
    summary: input.generated.summary.trim(),
    model_name: input.modelName.trim(),
    created_at: timestamp,
    updated_at: timestamp,
  });
  data.questions.push(...questions);
  data.nextExperienceId += 1;
  data.nextQuestionId += questions.length;
  writeAppData(data);
  return experienceId;
}

export async function deleteInterviewExperience(id: number): Promise<void> {
  const data = readAppData();
  data.experiences = data.experiences.filter((experience) => experience.id !== id);
  data.questions = data.questions.filter((question) => question.experience_id !== id);
  writeAppData(data);
}
