import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  Briefcase,
  CheckCircle,
  Eye,
  FilePdf,
  FileText,
  FloppyDisk,
  GearSix,
  Lightbulb,
  MagicWand,
  PencilSimple,
  Sparkle,
  Target,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { ResumeEditor } from '../components/ResumeEditor';
import { RESUME_TEMPLATE_OPTIONS, ResponsiveResumePreview } from '../components/ResumePreview';
import { JobInterviewFocusPanel } from '../components/JobInterviewFocusPanel';
import { TopBar } from '../components/TopBar';
import {
  deleteJobApplicationDraft,
  loadJobApplicationDraft,
  resumeToAnalysisText,
  saveJobApplicationDraft,
} from '../lib/jobApplicationStorage';
import {
  analyzeJobApplication,
  EMPTY_MODEL_SETTINGS,
  loadModelSettings,
  modelSettingsSummary,
  validateModelSettings,
  type ModelSettings,
} from '../lib/modelSettings';
import { loadResumeDraft, saveResumeDraft } from '../lib/resumeStorage';
import type {
  GeneratedResume,
  JobApplicationAnalysis,
  ResumeTemplate,
} from '../lib/types';

interface JobApplicationPageProps {
  onBack?: () => void;
  onOpenSettings: () => void;
}

type ResultView = 'overview' | 'questions' | 'resume';
type ResumeView = 'preview' | 'edit';
type JobWorkflow = 'focus' | 'match';

const RESUME_MAX_LENGTH = 50_000;
const JOB_DESCRIPTION_MAX_LENGTH = 30_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '操作失败，请稍后重试';
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function difficultyLabel(value: 1 | 2 | 3): string {
  return value === 1 ? '基础' : value === 3 ? '深入' : '进阶';
}

function validateForExport(resume: GeneratedResume): string | null {
  if (!resume.personal.name.trim()) return '请先填写姓名';
  if (!resume.personal.headline.trim()) return '请先填写职业定位';
  if (!resume.summary.trim()) return '请先填写个人优势';
  if (resume.skills.length === 0) return '请至少保留一组专业技能';
  return null;
}

export function JobApplicationPage({ onBack, onOpenSettings }: JobApplicationPageProps) {
  const [workflow, setWorkflow] = useState<JobWorkflow>('focus');
  const [settings, setSettings] = useState<ModelSettings>({ ...EMPTY_MODEL_SETTINGS });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState<JobApplicationAnalysis | null>(null);
  const [template, setTemplate] = useState<ResumeTemplate>('modern');
  const [resultView, setResultView] = useState<ResultView>('overview');
  const [resumeView, setResumeView] = useState<ResumeView>('preview');
  const [generating, setGenerating] = useState(false);
  const [focusGenerating, setFocusGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([loadModelSettings(), loadJobApplicationDraft()])
      .then(([settingsResult, draftResult]) => {
        if (!mounted) return;
        if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value);
        else setError(errorText(settingsResult.reason));
        if (draftResult.status === 'fulfilled' && draftResult.value) {
          setResumeText(draftResult.value.resumeText);
          setJobDescription(draftResult.value.jobDescription);
          setTemplate(draftResult.value.template);
          setAnalysis(draftResult.value.analysis);
        } else if (draftResult.status === 'rejected') {
          setError(errorText(draftResult.reason));
        }
      })
      .finally(() => {
        if (mounted) {
          hydratedRef.current = true;
          setSettingsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveJobApplicationDraft(
        resumeText,
        jobDescription,
        template,
        analysis,
      ).catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [analysis, jobDescription, resumeText, template]);

  const settingsReady = validateModelSettings(settings).length === 0;
  const resumeLength = charLength(resumeText);
  const jobDescriptionLength = charLength(jobDescription);
  const canAnalyze = settingsReady
    && resumeLength >= 20
    && resumeLength <= RESUME_MAX_LENGTH
    && jobDescriptionLength >= 20
    && jobDescriptionLength <= JOB_DESCRIPTION_MAX_LENGTH
    && !generating;

  async function handleImportSavedResume() {
    setError('');
    setMessage('');
    try {
      const draft = await loadResumeDraft();
      if (!draft) {
        setError('简历生成器中还没有可导入的简历');
        return;
      }
      if (resumeText.trim() && !window.confirm('导入会替换当前填写的简历内容，是否继续？')) return;
      setResumeText(resumeToAnalysisText(draft.resume));
      setMessage('已导入简历生成器中的本地简历');
    } catch (importError) {
      setError(errorText(importError));
    }
  }

  async function handleAnalyze() {
    if (!settingsReady) {
      setError('请先完成大模型配置');
      return;
    }
    if (resumeLength < 20 || resumeLength > RESUME_MAX_LENGTH) {
      setError('简历内容长度需在 20 到 50000 个字符之间');
      return;
    }
    if (jobDescriptionLength < 20 || jobDescriptionLength > JOB_DESCRIPTION_MAX_LENGTH) {
      setError('招聘 JD 长度需在 20 到 30000 个字符之间');
      return;
    }

    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const generated = await analyzeJobApplication(settings, resumeText, jobDescription);
      setAnalysis(generated);
      setResultView('overview');
      setResumeView('preview');
      await saveJobApplicationDraft(resumeText, jobDescription, template, generated);
      setMessage('岗位分析已完成，优化简历会自动保存在本机');
    } catch (generateError) {
      console.error('岗位分析失败:', generateError);
      setError(errorText(generateError));
    } finally {
      setGenerating(false);
    }
  }

  async function handleClear() {
    if ((resumeText.trim() || jobDescription.trim() || analysis)
      && !window.confirm('确定清空当前简历、JD 和分析结果吗？')) return;
    await deleteJobApplicationDraft();
    setResumeText('');
    setJobDescription('');
    setAnalysis(null);
    setTemplate('modern');
    setResultView('overview');
    setResumeView('preview');
    setError('');
    setMessage('');
  }

  async function handleExport() {
    if (!analysis || exporting) return;
    const validationError = validateForExport(analysis.optimizedResume);
    if (validationError) {
      setError(validationError);
      return;
    }
    setExporting(true);
    setError('');
    setMessage('');
    try {
      const { exportResumePdf } = await import('../lib/resumePdfExport');
      const result = await exportResumePdf(analysis.optimizedResume, template);
      if (result === 'saved') setMessage('优化简历 PDF 已导出');
    } catch (exportError) {
      setError(`PDF 导出失败：${errorText(exportError)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveToResumeGenerator() {
    if (!analysis) return;
    if (!window.confirm('这会替换“简历生成器”中的当前草稿，是否继续？')) return;
    try {
      await saveResumeDraft(
        `针对“${analysis.targetRole}”优化的简历`,
        template,
        analysis.optimizedResume,
      );
      setError('');
      setMessage('已保存到简历生成器，可继续独立编辑');
    } catch (saveError) {
      setError(errorText(saveError));
    }
  }

  function updateOptimizedResume(resume: GeneratedResume) {
    setAnalysis((current) => current ? { ...current, optimizedResume: resume } : current);
  }

  return (
    <div className="page">
      <TopBar
        title="岗位准备"
        onBack={onBack}
        rightSlot={
          <button className="icon-button" onClick={onOpenSettings} aria-label="打开模型设置">
            <GearSix size={21} weight="bold" aria-hidden="true" />
          </button>
        }
      />

      <main className="page-content job-application-page">
        <nav className="job-workflow-switch" role="tablist" aria-label="选择岗位准备方式">
          <button
            type="button"
            role="tab"
            aria-selected={workflow === 'focus'}
            className={workflow === 'focus' ? 'active' : ''}
            disabled={generating || focusGenerating}
            onClick={() => setWorkflow('focus')}
          >
            <Target size={18} weight={workflow === 'focus' ? 'fill' : 'duotone'} />
            <span><strong>JD 面试重点</strong><small>只需招聘 JD</small></span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workflow === 'match'}
            className={workflow === 'match' ? 'active' : ''}
            disabled={generating || focusGenerating}
            onClick={() => setWorkflow('match')}
          >
            <Briefcase size={18} weight={workflow === 'match' ? 'fill' : 'duotone'} />
            <span><strong>简历岗位匹配</strong><small>简历 + 招聘 JD</small></span>
          </button>
        </nav>

        {workflow === 'focus' ? (
          <JobInterviewFocusPanel
            settings={settings}
            settingsLoading={settingsLoading}
            settingsReady={settingsReady}
            onOpenSettings={onOpenSettings}
            onBusyChange={setFocusGenerating}
          />
        ) : !analysis ? (
          <div className="job-application-start">
            <section className="job-application-intro">
              <span><Target size={25} weight="duotone" aria-hidden="true" /></span>
              <div>
                <p className="page-eyebrow">简历 × 招聘 JD</p>
                <h1>为目标岗位准备一套完整求职材料</h1>
                <p>AI 会对照岗位要求分析简历，生成针对性面试题，并在不虚构经历的前提下优化简历。</p>
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

            <div className="job-application-inputs">
              <label className="form-field job-application-field">
                <span className="form-label-row">
                  <span className="form-label">我的简历</span>
                  <span className={resumeLength > RESUME_MAX_LENGTH ? 'character-count character-count-error' : 'character-count'}>
                    {resumeLength.toLocaleString('zh-CN')} / 50,000
                  </span>
                </span>
                <textarea
                  className="form-textarea job-application-textarea"
                  value={resumeText}
                  onChange={(event) => {
                    setResumeText(event.target.value);
                    setError('');
                  }}
                  placeholder="粘贴完整简历，包括个人优势、技能、工作/项目/教育经历…"
                  disabled={generating}
                  autoFocus
                />
                <button
                  className="job-application-import"
                  type="button"
                  onClick={() => void handleImportSavedResume()}
                  disabled={generating}
                >
                  <FileText size={16} weight="bold" /> 导入简历生成器中的简历
                </button>
              </label>

              <label className="form-field job-application-field">
                <span className="form-label-row">
                  <span className="form-label">企业招聘 JD</span>
                  <span className={jobDescriptionLength > JOB_DESCRIPTION_MAX_LENGTH ? 'character-count character-count-error' : 'character-count'}>
                    {jobDescriptionLength.toLocaleString('zh-CN')} / 30,000
                  </span>
                </span>
                <textarea
                  className="form-textarea job-application-textarea"
                  value={jobDescription}
                  onChange={(event) => {
                    setJobDescription(event.target.value);
                    setError('');
                  }}
                  placeholder="粘贴职位名称、岗位职责、任职要求、加分项等完整招聘信息…"
                  disabled={generating}
                />
                <span className="job-application-field-help">
                  <Briefcase size={15} /> 建议保留岗位职责、硬性要求和加分项
                </span>
              </label>
            </div>

            <div className="ai-generate-note">
              <WarningCircle size={19} weight="duotone" aria-hidden="true" />
              <p>JD 中出现但简历没有证据支持的能力只会标记为差距和面试验证项，不会被写成你的经历。</p>
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
              disabled={!canAnalyze}
              onClick={() => void handleAnalyze()}
            >
              <MagicWand size={20} weight="fill" />
              {generating ? '正在分析岗位与简历…' : '生成面试题和优化简历'}
            </button>
          </div>
        ) : (
          <div className="job-application-result">
            <section className="job-match-hero">
              <div className="job-match-score" aria-label={`岗位匹配度 ${analysis.matchScore} 分`}>
                <strong>{analysis.matchScore}</strong><span>匹配度</span>
              </div>
              <div className="job-match-hero-copy">
                <p className="page-eyebrow">目标岗位</p>
                <h1>{analysis.targetRole}</h1>
                <p>{analysis.summary}</p>
              </div>
              <div className="job-match-hero-actions">
                <button className="secondary-action-button" type="button" onClick={() => void handleAnalyze()} disabled={generating}>
                  <ArrowClockwise size={17} weight="bold" /> 重新分析
                </button>
                <button className="resume-clear-button" type="button" onClick={() => void handleClear()}>
                  <Trash size={16} /> 新建
                </button>
              </div>
            </section>

            <nav className="job-result-tabs" aria-label="岗位分析结果">
              {([
                ['overview', '匹配分析'],
                ['questions', `面试题 ${analysis.interviewQuestions.length}`],
                ['resume', '优化简历'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={resultView === key ? 'active' : ''}
                  aria-current={resultView === key ? 'page' : undefined}
                  onClick={() => setResultView(key)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {message && <p className="form-message form-message-success" role="status"><CheckCircle size={17} weight="fill" /> {message}</p>}
            {error && <p className="form-message form-message-error" role="alert">{error}</p>}

            {resultView === 'overview' && (
              <div className="job-overview">
                <section className="job-overview-card job-overview-strengths">
                  <header><CheckCircle size={20} weight="fill" /><h2>匹配优势</h2></header>
                  <ul>{analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section className="job-overview-card job-overview-gaps">
                  <header><WarningCircle size={20} weight="fill" /><h2>能力差距与验证项</h2></header>
                  <ul>{analysis.gaps.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section className="job-overview-card job-overview-keywords">
                  <header><Target size={20} weight="duotone" /><h2>JD 核心关键词</h2></header>
                  <div>{analysis.keywords.map((item) => <span key={item}>{item}</span>)}</div>
                </section>
                <section className="job-overview-card job-overview-changes">
                  <header><Lightbulb size={20} weight="fill" /><h2>简历优化记录</h2></header>
                  <ol>{analysis.resumeChanges.map((item) => <li key={item}>{item}</li>)}</ol>
                </section>
              </div>
            )}

            {resultView === 'questions' && (
              <section className="job-interview-questions">
                <header className="job-section-heading">
                  <div><p className="page-eyebrow">针对简历与 JD 生成</p><h2>面试准备清单</h2></div>
                  <span>{analysis.interviewQuestions.length} 道</span>
                </header>
                <div className="job-question-list">
                  {analysis.interviewQuestions.map((question, index) => (
                    <article className="job-question-card" key={`${question.question}-${index}`}>
                      <div className="job-question-meta">
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <b>{question.category}</b>
                        <i data-difficulty={question.difficulty}>{difficultyLabel(question.difficulty)}</i>
                      </div>
                      <h3>{question.question}</h3>
                      <p className="job-question-why"><strong>为什么会问：</strong>{question.whyAsked}</p>
                      <div className="job-question-guide">
                        <strong>回答提纲</strong>
                        <ul>{question.answerGuide.map((item) => <li key={item}>{item}</li>)}</ul>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {resultView === 'resume' && (
              <div className="job-resume-workspace">
                <section className="job-resume-toolbar">
                  <div className="job-section-heading">
                    <div><p className="page-eyebrow">针对 {analysis.targetRole}</p><h2>优化后的简历</h2></div>
                  </div>
                  <div className="resume-template-options" role="radiogroup" aria-label="简历模板">
                    {RESUME_TEMPLATE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className={`resume-template-option resume-template-option-${option.value}${template === option.value ? ' resume-template-option-active' : ''}`}
                        type="button"
                        role="radio"
                        aria-checked={template === option.value}
                        onClick={() => setTemplate(option.value)}
                      >
                        <span className="resume-template-swatch" aria-hidden="true"><i /><i /><i /></span>
                        <span><strong>{option.label}</strong><small>{option.description}</small></span>
                      </button>
                    ))}
                  </div>
                  <div className="job-resume-actions">
                    <div className="resume-view-switch" role="group" aria-label="编辑或预览优化简历">
                      <button type="button" className={resumeView === 'preview' ? 'active' : ''} onClick={() => setResumeView('preview')}>
                        <Eye size={16} /> 预览
                      </button>
                      <button type="button" className={resumeView === 'edit' ? 'active' : ''} onClick={() => setResumeView('edit')}>
                        <PencilSimple size={16} /> 编辑
                      </button>
                    </div>
                    <button className="secondary-action-button" type="button" onClick={() => void handleSaveToResumeGenerator()}>
                      <FloppyDisk size={17} weight="bold" /> 保存到简历生成器
                    </button>
                    <button className="primary-button" type="button" disabled={exporting} onClick={() => void handleExport()}>
                      <FilePdf size={18} weight="bold" /> {exporting ? '正在生成…' : '导出 PDF'}
                    </button>
                  </div>
                </section>
                {resumeView === 'preview' ? (
                  <div className="resume-preview-stage">
                    <ResponsiveResumePreview resume={analysis.optimizedResume} template={template} />
                  </div>
                ) : (
                  <ResumeEditor resume={analysis.optimizedResume} onChange={updateOptimizedResume} />
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {workflow === 'match' && generating && (
        <div className="experience-processing" role="status" aria-live="polite">
          <span className="processing-orbit" aria-hidden="true" />
          <strong>正在分析岗位匹配</strong>
          <span>AI 正在对照简历与 JD，生成面试题和优化简历，通常需要几十秒。</span>
        </div>
      )}
    </div>
  );
}
