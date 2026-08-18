import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  Briefcase,
  CheckCircle,
  ClipboardText,
  GearSix,
  ListChecks,
  MagicWand,
  Sparkle,
  Target,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  deleteJobInterviewFocusDraft,
  loadJobInterviewFocusDraft,
  saveJobInterviewFocusDraft,
} from '../lib/jobInterviewFocusStorage';
import {
  analyzeJobInterviewFocus,
  modelSettingsSummary,
  type ModelSettings,
} from '../lib/modelSettings';
import type { JobInterviewFocus } from '../lib/types';

interface JobInterviewFocusPanelProps {
  settings: ModelSettings;
  settingsLoading: boolean;
  settingsReady: boolean;
  onOpenSettings: () => void;
  onBusyChange: (busy: boolean) => void;
}

const JOB_DESCRIPTION_MAX_LENGTH = 30_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '操作失败，请稍后重试';
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function priorityLabel(priority: 1 | 2 | 3): string {
  if (priority === 3) return '最高优先';
  if (priority === 2) return '重点准备';
  return '了解即可';
}

export function JobInterviewFocusPanel({
  settings,
  settingsLoading,
  settingsReady,
  onOpenSettings,
  onBusyChange,
}: JobInterviewFocusPanelProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [focus, setFocus] = useState<JobInterviewFocus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    loadJobInterviewFocusDraft()
      .then((draft) => {
        if (!mounted || !draft) return;
        setJobDescription(draft.jobDescription);
        setFocus(draft.focus);
      })
      .catch((loadError) => {
        if (mounted) setError(errorText(loadError));
      })
      .finally(() => {
        if (mounted) hydratedRef.current = true;
      });
    return () => {
      mounted = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveJobInterviewFocusDraft(jobDescription, focus).catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [focus, jobDescription]);

  const jobDescriptionLength = charLength(jobDescription);
  const canGenerate = settingsReady
    && jobDescriptionLength >= 20
    && jobDescriptionLength <= JOB_DESCRIPTION_MAX_LENGTH
    && !generating;

  async function handleGenerate() {
    if (!settingsReady) {
      setError('请先完成大模型配置');
      return;
    }
    if (jobDescriptionLength < 20 || jobDescriptionLength > JOB_DESCRIPTION_MAX_LENGTH) {
      setError('招聘 JD 长度需在 20 到 30000 个字符之间');
      return;
    }

    setGenerating(true);
    onBusyChange(true);
    setError('');
    setMessage('');
    try {
      const generated = await analyzeJobInterviewFocus(settings, jobDescription);
      setFocus(generated);
      await saveJobInterviewFocusDraft(jobDescription, generated);
      setMessage('面试重点已生成并保存在本机');
    } catch (generateError) {
      console.error('面试重点生成失败:', generateError);
      setError(errorText(generateError));
    } finally {
      setGenerating(false);
      onBusyChange(false);
    }
  }

  async function handleClear() {
    if ((jobDescription.trim() || focus)
      && !window.confirm('确定清空当前 JD 和面试重点吗？')) return;
    await deleteJobInterviewFocusDraft();
    setJobDescription('');
    setFocus(null);
    setError('');
    setMessage('');
  }

  const sortedAreas = focus
    ? [...focus.focusAreas].sort((left, right) => right.priority - left.priority)
    : [];

  return (
    <>
      {!focus ? (
        <div className="job-application-start job-focus-start">
          <section className="job-application-intro job-focus-intro">
            <span><Target size={25} weight="duotone" aria-hidden="true" /></span>
            <div>
              <p className="page-eyebrow">只需招聘 JD</p>
              <h1>快速锁定这场面试该准备什么</h1>
              <p>AI 会识别岗位职责和任职要求，按优先级整理核心主题、复习要点、可能追问与临场准备清单。</p>
            </div>
          </section>

          <button className="model-config-card" onClick={onOpenSettings} disabled={generating}>
            <span className="model-config-icon"><Sparkle size={21} weight="fill" /></span>
            <span className="model-config-copy">
              <span>分析模型</span>
              <strong>{settingsLoading ? '正在读取配置…' : modelSettingsSummary(settings)}</strong>
            </span>
            <GearSix size={20} weight="bold" aria-hidden="true" />
          </button>

          <label className="form-field job-application-field job-focus-input-card">
            <span className="form-label-row">
              <span className="form-label">工作 JD</span>
              <span className={jobDescriptionLength > JOB_DESCRIPTION_MAX_LENGTH ? 'character-count character-count-error' : 'character-count'}>
                {jobDescriptionLength.toLocaleString('zh-CN')} / 30,000
              </span>
            </span>
            <textarea
              className="form-textarea job-application-textarea job-focus-textarea"
              value={jobDescription}
              onChange={(event) => {
                setJobDescription(event.target.value);
                setError('');
                setMessage('');
              }}
              placeholder="粘贴职位名称、岗位职责、任职要求、加分项等完整招聘信息…"
              disabled={generating}
              autoFocus
            />
            <span className="job-application-field-help">
              <Briefcase size={15} /> 内容越完整，面试重点的优先级越准确
            </span>
          </label>

          <div className="ai-generate-note">
            <WarningCircle size={19} weight="duotone" aria-hidden="true" />
            <p>结果仅根据 JD 归纳，不代表企业真实题库或固定面试流程；模糊要求会被标记为建议准备项。</p>
          </div>
          {!settingsLoading && !settingsReady && (
            <button type="button" className="model-required-button" onClick={onOpenSettings}>
              先配置第三方大模型
            </button>
          )}
          {message && <p className="form-message form-message-success" role="status"><CheckCircle size={17} weight="fill" /> {message}</p>}
          {error && <p className="form-message form-message-error" role="alert">{error}</p>}
          <button
            className="primary-button job-application-generate"
            type="button"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
          >
            <MagicWand size={20} weight="fill" />
            {generating ? '正在提炼面试重点…' : '生成面试重点'}
          </button>
        </div>
      ) : (
        <div className="job-application-result job-focus-result">
          <section className="job-match-hero job-focus-hero">
            <div className="job-focus-hero-icon" aria-hidden="true">
              <Target size={31} weight="duotone" />
            </div>
            <div className="job-match-hero-copy">
              <p className="page-eyebrow">JD 面试重点</p>
              <h1>{focus.targetRole}</h1>
              <p>{focus.overview}</p>
            </div>
            <div className="job-match-hero-actions">
              <button className="secondary-action-button" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                <ArrowClockwise size={17} weight="bold" /> 重新生成
              </button>
              <button className="resume-clear-button" type="button" onClick={() => void handleClear()}>
                <Trash size={16} /> 新建
              </button>
            </div>
          </section>

          {message && <p className="form-message form-message-success" role="status"><CheckCircle size={17} weight="fill" /> {message}</p>}
          {error && <p className="form-message form-message-error" role="alert">{error}</p>}

          <section className="job-focus-keywords" aria-label="JD 核心关键词">
            <strong>JD 核心关键词</strong>
            <div>{focus.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          </section>

          <section className="job-focus-areas">
            <header className="job-section-heading">
              <div><p className="page-eyebrow">按重要程度排序</p><h2>面试重点</h2></div>
              <span>{sortedAreas.length} 项</span>
            </header>
            <div className="job-focus-area-list">
              {sortedAreas.map((area, index) => (
                <article className="job-focus-area-card" key={`${area.title}-${index}`}>
                  <header>
                    <span className="job-focus-area-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <span className="job-focus-priority" data-priority={area.priority}>
                        {priorityLabel(area.priority)}
                      </span>
                      <h3>{area.title}</h3>
                    </div>
                  </header>
                  <p className="job-focus-reason">{area.reason}</p>
                  <div className="job-focus-area-columns">
                    <section>
                      <h4><ClipboardText size={17} weight="duotone" /> 复习要点</h4>
                      <ul>{area.keyPoints.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
                    </section>
                    <section>
                      <h4><Sparkle size={17} weight="duotone" /> 可能追问</h4>
                      <ul>{area.likelyQuestions.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
                    </section>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="job-focus-checklist">
            <header><ListChecks size={22} weight="duotone" /><div><p className="page-eyebrow">面试前完成</p><h2>准备清单</h2></div></header>
            <ol>{focus.preparationChecklist.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>
          </section>
        </div>
      )}

      {generating && (
        <div className="experience-processing" role="status" aria-live="polite">
          <span className="processing-orbit" aria-hidden="true" />
          <strong>正在提炼面试重点</strong>
          <span>AI 正在拆解岗位职责与任职要求，通常需要几十秒。</span>
        </div>
      )}
    </>
  );
}
