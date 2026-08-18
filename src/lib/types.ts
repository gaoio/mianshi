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

export type ResumeTemplate = 'classic' | 'modern' | 'minimal';

export interface ResumePersonal {
  name: string;
  headline: string;
  phone: string;
  email: string;
  location: string;
  website: string;
}

export interface ResumeSkillGroup {
  category: string;
  items: string[];
}

export interface ResumeExperience {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  highlights: string[];
}

export interface ResumeProject {
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  summary: string;
  highlights: string[];
  technologies: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  highlights: string[];
}

export interface GeneratedResume {
  personal: ResumePersonal;
  summary: string;
  skills: ResumeSkillGroup[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
}

export interface JobInterviewQuestion {
  question: string;
  category: string;
  difficulty: 1 | 2 | 3;
  whyAsked: string;
  answerGuide: string[];
}

export interface JobInterviewFocusArea {
  title: string;
  priority: 1 | 2 | 3;
  reason: string;
  keyPoints: string[];
  likelyQuestions: string[];
}

export interface JobInterviewFocus {
  targetRole: string;
  overview: string;
  keywords: string[];
  focusAreas: JobInterviewFocusArea[];
  preparationChecklist: string[];
}

export interface JobApplicationAnalysis {
  targetRole: string;
  matchScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  keywords: string[];
  resumeChanges: string[];
  interviewQuestions: JobInterviewQuestion[];
  optimizedResume: GeneratedResume;
}
