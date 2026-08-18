export interface InterviewExperience {
  id: number;
  title: string;
  raw_content: string;
  summary: string;
  model_name: string;
  question_count: number;
  created_at: string;
  updated_at: string;
}

export interface InterviewExperienceQuestion {
  id: number;
  experience_id: number;
  position: number;
  title: string;
  answer: string;
  code: string;
  code_language: string;
  difficulty: 1 | 2 | 3;
  tags: string;
  sources_json: string;
  created_at: string;
}

export interface ReferenceSource {
  title: string;
  url: string;
}

export interface GeneratedInterviewQuestion {
  title: string;
  answer: string;
  code: string;
  codeLanguage: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
  sources: ReferenceSource[];
}

export interface GeneratedInterviewExperience {
  title: string;
  summary: string;
  questions: GeneratedInterviewQuestion[];
}

interface GeneratedInterviewQuestionOutline {
  title: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
}

export interface GeneratedInterviewOutline {
  title: string;
  summary: string;
  questions: GeneratedInterviewQuestionOutline[];
}

export interface GenerationResume {
  outline: GeneratedInterviewOutline;
  questions: GeneratedInterviewQuestion[];
}
