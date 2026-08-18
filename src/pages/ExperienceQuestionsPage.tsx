import { useEffect, useMemo, useState } from 'react';
import { CaretRight, MagnifyingGlass, Sparkle, Trash } from '@phosphor-icons/react';
import {
  deleteInterviewExperience,
  getInterviewExperience,
  listInterviewExperienceQuestions,
} from '../lib/localStorage';
import type { InterviewExperience, InterviewExperienceQuestion } from '../lib/types';
import { TopBar } from '../components/TopBar';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: '简单',
  2: '中等',
  3: '困难',
};

const DIFFICULTY_FILTERS: { value: number; label: string }[] = [
  { value: 0, label: '全部' },
  { value: 1, label: '简单' },
  { value: 2, label: '中等' },
  { value: 3, label: '困难' },
];

interface ExperienceQuestionsPageProps {
  experienceId: number;
  experienceTitle: string;
  onBack: () => void;
  onDeleted: () => void;
  onSelectQuestion: (list: InterviewExperienceQuestion[], index: number) => void;
}

export function ExperienceQuestionsPage({
  experienceId,
  experienceTitle,
  onBack,
  onDeleted,
  onSelectQuestion,
}: ExperienceQuestionsPageProps) {
  const [experience, setExperience] = useState<InterviewExperience | null>(null);
  const [questions, setQuestions] = useState<InterviewExperienceQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState(0);

  const filteredQuestions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return questions.filter((question) => {
      if (difficultyFilter !== 0 && question.difficulty !== difficultyFilter) return false;
      if (keyword && !question.title.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [questions, search, difficultyFilter]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getInterviewExperience(experienceId),
      listInterviewExperienceQuestions(experienceId),
    ])
      .then(([experienceData, questionData]) => {
        if (!mounted) return;
        setExperience(experienceData);
        setQuestions(questionData);
      })
      .catch((loadError) => {
        console.error('加载面经题单失败:', loadError);
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : '面经题单加载失败');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [experienceId]);

  async function handleDelete() {
    if (deleting || !window.confirm('确定删除这篇面经及其全部题目吗？')) return;
    setDeleting(true);
    setError('');
    try {
      await deleteInterviewExperience(experienceId);
      onDeleted();
    } catch (deleteError) {
      console.error('删除面经失败:', deleteError);
      setError(deleteError instanceof Error ? deleteError.message : '删除失败，请稍后重试');
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <TopBar
        title="面经题单"
        onBack={onBack}
        rightSlot={
          <button
            className="icon-button danger-icon-button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            aria-label="删除面经"
          >
            <Trash size={21} weight="bold" aria-hidden="true" />
          </button>
        }
      />
      <div className="page-content experience-questions-page">
        <header className="experience-detail-header">
          <span className="experience-detail-kicker">
            <Sparkle size={15} weight="fill" aria-hidden="true" />
            AI 已整理
          </span>
          <h2>{experience?.title || experienceTitle}</h2>
          {experience?.summary && <p>{experience.summary}</p>}
          <span className="experience-question-count">
            {questions.length > 0 && filteredQuestions.length !== questions.length
              ? `${filteredQuestions.length} / ${questions.length} 道面试题`
              : `${questions.length} 道面试题`}
          </span>
        </header>

        {!loading && !error && questions.length > 0 && (
          <div className="question-filter-bar">
            <label className="question-search-field">
              <MagnifyingGlass size={17} weight="bold" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索题目…"
                aria-label="搜索题目"
              />
            </label>
            <div className="difficulty-filter-group" role="group" aria-label="按难度筛选">
              {DIFFICULTY_FILTERS.map((option) => (
                <button
                  key={option.value}
                  className={`difficulty-filter-chip${
                    difficultyFilter === option.value
                      ? ` difficulty-filter-chip-active difficulty-filter-chip-active-${option.value}`
                      : ''
                  }`}
                  onClick={() => setDifficultyFilter(option.value)}
                  aria-pressed={difficultyFilter === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && <p className="hint-text">正在加载题单…</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && questions.length === 0 && (
          <p className="hint-text">这篇面经还没有题目</p>
        )}
        {!loading && !error && questions.length > 0 && filteredQuestions.length === 0 && (
          <p className="hint-text">没有匹配的题目</p>
        )}

        <div className="experience-question-list">
          {filteredQuestions.map((question, index) => {
            const tags = question.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 3);
            return (
              <button
                key={question.id}
                className="experience-question-row"
                onClick={() => onSelectQuestion(filteredQuestions, index)}
              >
                <span className="experience-question-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="experience-question-copy">
                  <span className="experience-question-title">{question.title}</span>
                  <span className="experience-question-meta">
                    <span className={`difficulty-badge difficulty-${question.difficulty}`}>
                      {DIFFICULTY_LABEL[question.difficulty]}
                    </span>
                    {tags.map((tag) => (
                      <span key={tag} className="experience-tag">{tag}</span>
                    ))}
                  </span>
                </span>
                <CaretRight size={18} weight="bold" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
