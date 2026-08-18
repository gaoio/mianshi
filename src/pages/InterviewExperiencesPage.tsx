import { useEffect, useState } from 'react';
import {
  CaretRight,
  GearSix,
  Notebook,
  Plus,
  Sparkle,
} from '@phosphor-icons/react';
import { listInterviewExperiences } from '../lib/localStorage';
import type { InterviewExperience } from '../lib/types';
import { TopBar } from '../components/TopBar';

interface InterviewExperiencesPageProps {
  onBack?: () => void;
  onCreate: () => void;
  onSettings: () => void;
  onSelect: (experience: InterviewExperience) => void;
}

function formatDate(value: string): string {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getLoadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('本地存储')) return message;
  return '面经加载失败，请稍后重试';
}

export function InterviewExperiencesPage({
  onBack,
  onCreate,
  onSettings,
  onSelect,
}: InterviewExperiencesPageProps) {
  const [experiences, setExperiences] = useState<InterviewExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    listInterviewExperiences()
      .then((items) => {
        if (mounted) setExperiences(items);
      })
      .catch((loadError) => {
        console.error('加载面经失败:', loadError);
        if (mounted) setError(getLoadErrorMessage(loadError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="page">
      <TopBar
        title="我的面经"
        onBack={onBack}
        rightSlot={
          <button className="icon-button" onClick={onSettings} aria-label="打开设置">
            <GearSix size={22} weight="bold" aria-hidden="true" />
          </button>
        }
      />
      <div className="page-content experience-list-page">
        <section className="experience-intro">
          <div className="experience-intro-icon" aria-hidden="true">
            <Sparkle size={22} weight="fill" />
          </div>
          <div>
            <p className="page-eyebrow">AI 面经整理</p>
            <h2 className="experience-intro-title">粘贴原文，自动整理成可复习题单</h2>
          </div>
        </section>

        <button className="primary-button experience-create-button" onClick={onCreate}>
          <Plus size={19} weight="bold" aria-hidden="true" />
          导入一篇面经
        </button>

        {loading && <p className="hint-text">正在加载面经…</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && experiences.length === 0 && (
          <div className="experience-empty">
            <span className="experience-empty-icon">
              <Notebook size={34} weight="duotone" aria-hidden="true" />
            </span>
            <h3>还没有整理过面经</h3>
            <p>先配置兼容的大模型，再粘贴一段面试记录试试。</p>
          </div>
        )}

        <div className="experience-list">
          {experiences.map((experience) => (
            <button
              key={experience.id}
              className="experience-card"
              onClick={() => onSelect(experience)}
            >
              <span className="experience-card-index" aria-hidden="true">
                <Notebook size={23} weight="duotone" />
              </span>
              <span className="experience-card-copy">
                <span className="experience-card-title">{experience.title}</span>
                {experience.summary && (
                  <span className="experience-card-summary">{experience.summary}</span>
                )}
                <span className="experience-card-meta">
                  <strong>{experience.question_count} 道题</strong>
                  <span>{experience.model_name || 'AI 整理'}</span>
                  <span>{formatDate(experience.created_at)}</span>
                </span>
              </span>
              <CaretRight size={18} weight="bold" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
