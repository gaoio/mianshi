import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { BookOpenText, Check, Copy, Info, Sparkle } from '@phosphor-icons/react';
import { getInterviewExperienceQuestion } from '../lib/localStorage';
import type { InterviewExperienceQuestion } from '../lib/types';
import { parseAnswerSections } from '../lib/answerFormat';
import {
  openSourceInApp,
  parseReferenceSources,
  supportsInAppSourceViewer,
} from '../lib/sourceLinks';
import { TopBar } from '../components/TopBar';
import { CodeBlock } from '../components/CodeBlock';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: '简单',
  2: '中等',
  3: '困难',
};

interface ExperienceQuestionDetailPageProps {
  questionIds: number[];
  index: number;
  onBack: () => void;
  onNavigateIndex: (index: number) => void;
}

export function ExperienceQuestionDetailPage({
  questionIds,
  index,
  onBack,
  onNavigateIndex,
}: ExperienceQuestionDetailPageProps) {
  const questionId = questionIds[index];
  const [question, setQuestion] = useState<InterviewExperienceQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openingSourceUrl, setOpeningSourceUrl] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError('');
    setQuestion(null);
    setOpeningSourceUrl(null);
    setSourceError('');
    getInterviewExperienceQuestion(questionId)
      .then((data) => {
        if (mounted) setQuestion(data);
      })
      .catch((error) => {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : '答案加载失败，请稍后重试');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [questionId]);

  const canPrev = index > 0;
  const canNext = index < questionIds.length - 1;
  const tags = question?.tags.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [];
  const sources = question ? parseReferenceSources(question.sources_json) : [];

  async function handleSourceClick(event: MouseEvent<HTMLAnchorElement>, url: string) {
    if (!supportsInAppSourceViewer()) return;

    event.preventDefault();
    if (openingSourceUrl !== null) return;

    setOpeningSourceUrl(url);
    setSourceError('');
    try {
      await openSourceInApp(url);
    } catch (error) {
      console.error('应用内打开参考文档失败:', error);
      setSourceError('参考文档打开失败，请稍后重试');
    } finally {
      setOpeningSourceUrl(null);
    }
  }

  async function handleCopyAnswer() {
    if (!question) return;
    const text = `${question.title}\n\n${question.answer}`;
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch {
      success = false;
    }
    if (!success) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        success = document.execCommand('copy');
      } catch {
        success = false;
      }
      document.body.removeChild(textarea);
    }
    if (success) {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="page">
      <TopBar title={`第 ${index + 1} / ${questionIds.length} 题`} onBack={onBack} />
      <div className="page-content experience-answer-page">
        {loading && <p className="hint-text">正在加载答案…</p>}
        {!loading && loadError && <p className="error-text">{loadError}</p>}
        {!loading && !loadError && !question && <p className="error-text">题目不存在</p>}
        {!loading && !loadError && question && (
          <article className="experience-answer">
            <div className="experience-answer-meta">
              <span className={`difficulty-badge difficulty-${question.difficulty}`}>
                {DIFFICULTY_LABEL[question.difficulty]}
              </span>
              <span className="ai-answer-badge">
                <Sparkle size={13} weight="fill" aria-hidden="true" />
                AI 生成答案
              </span>
            </div>
            <h2>{question.title}</h2>
            {tags.length > 0 && (
              <div className="experience-answer-tags">
                {tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            )}

            <div className="experience-answer-layout">
              <div className="question-detail-answer experience-answer-body">
                <div className="question-detail-answer-heading">
                  <h3>详细答案</h3>
                  <button
                    className={`copy-answer-button${copied ? ' copy-answer-button-copied' : ''}`}
                    onClick={() => void handleCopyAnswer()}
                    aria-label={copied ? '已复制' : '复制答案'}
                  >
                    {copied ? <Check size={15} weight="bold" aria-hidden="true" /> : <Copy size={15} weight="bold" aria-hidden="true" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                {parseAnswerSections(question.answer).map((section, sectionIndex) => (
                  <section key={`${section.heading}-${sectionIndex}`} className="answer-section">
                    {section.heading && (
                      <h4 className="answer-section-heading">{section.heading}</h4>
                    )}
                    <p className="answer-section-body">{section.body}</p>
                  </section>
                ))}
                {question.code && (
                  <CodeBlock code={question.code} language={question.code_language} />
                )}
              </div>

              <aside className="experience-answer-aside">
                {sources.length > 0 && (
                  <div className="experience-sources" aria-label="参考文档">
                    <div className="experience-sources-heading">
                      <BookOpenText size={19} weight="duotone" aria-hidden="true" />
                      <h3>参考文档</h3>
                    </div>
                    <ol>
                      {sources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-busy={openingSourceUrl === source.url}
                            onClick={(event) => void handleSourceClick(event, source.url)}
                          >
                            <span>{source.title}</span>
                            <small>{new URL(source.url).hostname}</small>
                          </a>
                        </li>
                      ))}
                    </ol>
                    {sourceError && <p className="question-source-error" role="alert">{sourceError}</p>}
                  </div>
                )}

                <div className="ai-answer-notice">
                  <Info size={18} weight="duotone" aria-hidden="true" />
                  <span>答案和参考文档由你配置的第三方模型生成，请打开原文复核关键结论。</span>
                </div>
              </aside>
            </div>
          </article>
        )}
      </div>
      <div className="question-detail-footer">
        <button className="nav-button" disabled={!canPrev} onClick={() => onNavigateIndex(index - 1)}>
          上一题
        </button>
        <button className="nav-button" disabled={!canNext} onClick={() => onNavigateIndex(index + 1)}>
          下一题
        </button>
      </div>
    </div>
  );
}
