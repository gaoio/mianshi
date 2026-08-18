// 应用内的页面导航类型定义。求职工具 App 使用单一屏幕栈，
// 不引入 react-router，规模小、逻辑简单，手写状态栈更直观可控。

export type Screen =
  | { name: 'home' }
  | { name: 'experiences' }
  | { name: 'experienceCreate' }
  | { name: 'resumeGenerator' }
  | { name: 'jobApplication' }
  | { name: 'settings' }
  | { name: 'modelSettings' }
  | { name: 'appUpdate' }
  | { name: 'experienceQuestions'; experienceId: number; experienceTitle: string }
  | { name: 'experienceQuestionDetail'; listIds: number[]; listIndex: number };
