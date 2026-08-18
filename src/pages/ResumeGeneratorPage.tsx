import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  CheckCircle,
  Eye,
  FilePdf,
  GearSix,
  MagicWand,
  PencilSimple,
  Sparkle,
  Trash,
} from '@phosphor-icons/react';
import { ResumeEditor } from '../components/ResumeEditor';
import { RESUME_TEMPLATE_OPTIONS, ResumePreview } from '../components/ResumePreview';
import { TopBar } from '../components/TopBar';
import {
  EMPTY_MODEL_SETTINGS,
  generateResume,
  loadModelSettings,
  modelSettingsSummary,
  validateModelSettings,
  type ModelSettings,
} from '../lib/modelSettings';
import {
  deleteResumeDraft,
  loadResumeDraft,
  saveResumeDraft,
} from '../lib/resumeStorage';
import type { GeneratedResume, ResumeTemplate } from '../lib/types';

interface ResumeGeneratorPageProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '操作失败，请稍后重试';
}

function validateForExport(resume: GeneratedResume): string | null {
  if (!resume.personal.name.trim()) return '请先填写姓名';
  if (!resume.personal.headline.trim()) return '请先填写职业定位';
  if (!resume.summary.trim()) return '请先填写个人优势';
  if (resume.skills.length === 0) return '请至少保留一组专业技能';
  return null;
}

export function ResumeGeneratorPage({ onBack, onOpenSettings }: ResumeGeneratorPageProps) {
  const [settings, setSettings] = useState<ModelSettings>({ ...EMPTY_MODEL_SETTINGS });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [resume, setResume] = useState<GeneratedResume | null>(null);
  const [template, setTemplate] = useState<ResumeTemplate>('classic');
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([loadModelSettings(), loadResumeDraft()])
      .then(([settingsResult, draftResult]) => {
        if (!mounted) return;
        if (settingsResult.status === 'fulfilled') {
          setSettings(settingsResult.value);
        } else {
          setError(errorText(settingsResult.reason));
        }
        if (draftResult.status === 'fulfilled' && draftResult.value) {
          setDescription(draftResult.value.description);
          setResume(draftResult.value.resume);
          setTemplate(draftResult.value.template);
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
    if (!hydratedRef.current || !resume) return;
    const timer = window.setTimeout(() => {
      void saveResumeDraft(description, template, resume).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [description, resume, template]);

  const settingsReady = validateModelSettings(settings).length === 0;
  const descriptionLength = Array.from(description).length;
  const canGenerate = settingsReady
    && descriptionLength >= 5
    && descriptionLength <= 2_000
    && !generating;

  async function handleGenerate() {
    if (!settingsReady) {
      setError('请先完成大模型配置');
      return;
    }
    if (descriptionLength < 5) {
      setError('请至少用 5 个字符描述你的简历');
      return;
    }
    if (descriptionLength > 2_000) {
      setError('简历描述不能超过 2000 个字符');
      return;
    }

    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const generated = await generateResume(settings, description);
      setResume(generated);
      setMode('preview');
      await saveResumeDraft(description, template, generated);
      setMessage('简历已生成，可切换模板或编辑内容');
    } catch (generateError) {
      console.error('AI 生成简历失败:', generateError);
      setError(errorText(generateError));
    } finally {
      setGenerating(false);
    }
  }

  async function handleExport() {
    if (!resume || exporting) return;
    const validationError = validateForExport(resume);
    if (validationError) {
      setError(validationError);
      return;
    }
    setExporting(true);
    setError('');
    setMessage('');
    try {
      const { exportResumePdf } = await import('../lib/resumePdfExport');
      const result = await exportResumePdf(resume, template);
      if (result === 'saved') setMessage('PDF 已导出');
    } catch (exportFailure) {
      console.error('导出简历 PDF 失败:', exportFailure);
      setError(`PDF 导出失败：${errorText(exportFailure)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleClear() {
    if (resume && !window.confirm('确定清空当前简历草稿吗？')) return;
    await deleteResumeDraft();
    setDescription('');
    setResume(null);
    setTemplate('classic');
    setMode('preview');
    setError('');
    setMessage('');
  }

  return (
    <div className="page">
      <TopBar
        title="简历生成器"
        onBack={onBack}
        rightSlot={
          <button className="icon-button" onClick={onOpenSettings} aria-label="打开模型设置">
            <GearSix size={21} weight="bold" aria-hidden="true" />
          </button>
        }
      />
      <div className="page-content resume-generator-page">
        {!resume ? (
          <div className="resume-generator-start">
            <header className="resume-generator-hero">
              <span className="resume-generator-hero-icon" aria-hidden="true">
                <MagicWand size={27} weight="duotone" />
              </span>
              <p className="page-eyebrow">AI RESUME BUILDER</p>
              <h1>一句话，生成一份好简历</h1>
              <p>描述目标岗位、经验与技能，AI 会整理为专业结构；生成后可以修改内容、切换模板并导出 PDF。</p>
            </header>

            <button className="model-config-card" onClick={onOpenSettings} disabled={generating}>
              <span className="model-config-icon">
                <Sparkle size={21} weight="fill" aria-hidden="true" />
              </span>
              <span className="model-config-copy">
                <span>生成模型</span>
                <strong>{settingsLoading ? '正在读取配置…' : modelSettingsSummary(settings)}</strong>
              </span>
              <GearSix size={20} weight="bold" aria-hidden="true" />
            </button>

            <label className="form-field resume-brief-field">
              <span className="form-label-row">
                <span className="form-label">用一句话描述你自己</span>
                <span className={descriptionLength > 2_000 ? 'character-count character-count-error' : 'character-count'}>
                  {descriptionLength.toLocaleString('zh-CN')} / 2,000
                </span>
              </span>
              <textarea
                className="form-textarea resume-brief-textarea"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError('');
                }}
                placeholder="例如：我叫张三，3 年 Go 后端经验，做过电商订单和支付系统，熟悉 MySQL、Redis、Kafka，想应聘高级后端工程师…"
                disabled={generating}
                autoFocus
              />
            </label>

            <div className="ai-generate-note">
              <Sparkle size={19} weight="duotone" aria-hidden="true" />
              <p>AI 不会编造公司、学校、时间和业绩数字；描述中未提供的信息会留空或标记为“待补充”。</p>
            </div>
            {!settingsLoading && !settingsReady && (
              <button type="button" className="model-required-button" onClick={onOpenSettings}>
                先配置第三方大模型
              </button>
            )}
            {error && <p className="form-message form-message-error" role="alert">{error}</p>}
            <button
              className="primary-button resume-generate-button"
              type="button"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
            >
              <MagicWand size={20} weight="fill" aria-hidden="true" />
              {generating ? 'AI 正在撰写简历…' : 'AI 生成简历'}
            </button>
          </div>
        ) : (
          <div className="resume-workspace">
            <section className="resume-workspace-toolbar">
              <div className="resume-workspace-heading">
                <div>
                  <span className="page-eyebrow">已生成 · 自动保存</span>
                  <h1>{resume.personal.name}的简历</h1>
                </div>
                <button className="resume-clear-button" type="button" onClick={() => void handleClear()}>
                  <Trash size={16} aria-hidden="true" />
                  新建
                </button>
              </div>

              <div className="resume-regenerate-row">
                <textarea
                  className="form-textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-label="简历描述"
                />
                <button
                  className="secondary-action-button"
                  type="button"
                  disabled={!canGenerate}
                  onClick={() => void handleGenerate()}
                >
                  <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
                  重新生成
                </button>
              </div>

              <div className="resume-template-heading">
                <span>选择模板</span>
                <small>导出的 PDF 将使用当前模板</small>
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

              <div className="resume-view-actions">
                <div className="resume-view-switch" role="group" aria-label="编辑或预览简历">
                  <button
                    type="button"
                    className={mode === 'preview' ? 'active' : ''}
                    aria-pressed={mode === 'preview'}
                    onClick={() => setMode('preview')}
                  >
                    <Eye size={16} /> 预览
                  </button>
                  <button
                    type="button"
                    className={mode === 'edit' ? 'active' : ''}
                    aria-pressed={mode === 'edit'}
                    onClick={() => setMode('edit')}
                  >
                    <PencilSimple size={16} /> 编辑
                  </button>
                </div>
                <button
                  className="primary-button resume-export-button"
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExport()}
                >
                  <FilePdf size={18} weight="bold" aria-hidden="true" />
                  {exporting ? '正在生成…' : '导出 PDF'}
                </button>
              </div>
              {message && (
                <p className="form-message form-message-success" role="status">
                  <CheckCircle size={17} weight="fill" /> {message}
                </p>
              )}
              {error && <p className="form-message form-message-error" role="alert">{error}</p>}
            </section>

            {mode === 'preview' ? (
              <div className="resume-preview-stage">
                <ResumePreview resume={resume} template={template} />
              </div>
            ) : (
              <ResumeEditor resume={resume} onChange={setResume} />
            )}
          </div>
        )}
      </div>
      {generating && (
        <div className="experience-processing" role="status" aria-live="polite">
          <span className="processing-orbit" aria-hidden="true" />
          <strong>正在生成简历</strong>
          <span>AI 正在提炼岗位定位、技能和经历，通常需要几十秒。</span>
        </div>
      )}
    </div>
  );
}
