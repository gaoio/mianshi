import { useEffect, useRef, useState } from 'react';
import { GearSix, MagicWand, Sparkle } from '@phosphor-icons/react';
import { listen } from '@tauri-apps/api/event';
import {
  createInterviewExperience,
  deleteGenerationDraft,
  loadGenerationDraft,
  saveGenerationDraft,
  type GenerationDraft,
} from '../lib/localStorage';
import {
  EMPTY_MODEL_SETTINGS,
  analyzeInterviewExperience,
  cancelInterviewGeneration,
  loadModelSettings,
  modelSettingsSummary,
  validateModelSettings,
  type ModelSettings,
} from '../lib/modelSettings';
import { TopBar } from '../components/TopBar';
import type { GeneratedInterviewOutline, GeneratedInterviewQuestion } from '../lib/types';

interface CreateInterviewExperiencePageProps {
  onBack: () => void;
  onOpenSettings: () => void;
  onCreated: (experienceId: number, title: string) => void;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '解析失败，请稍后重试';
}

interface GenerationProgress {
  generationId: number;
  stage: 'extracting' | 'generating';
  completed: number;
  total: number;
}

interface GenerationCheckpoint {
  generationId: number;
  outline: GeneratedInterviewOutline;
  questions: GeneratedInterviewQuestion[];
}

export function CreateInterviewExperiencePage({
  onBack,
  onOpenSettings,
  onCreated,
}: CreateInterviewExperiencePageProps) {
  const [settings, setSettings] = useState<ModelSettings>({ ...EMPTY_MODEL_SETTINGS });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [progressText, setProgressText] = useState('正在提取并整理题目…');
  const [resumeDraft, setResumeDraft] = useState<GenerationDraft | null>(null);
  const mountedRef = useRef(true);
  const runIdRef = useRef(Date.now() * 1000);
  const checkpointInputRef = useRef({ rawContent: '', preferredTitle: '', modelName: '' });
  const checkpointWriteRef = useRef<Promise<void>>(Promise.resolve());
  const checkpointEnabledRef = useRef(false);
  const editedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadGenerationDraft()
      .then((draft) => {
        if (!mounted || !draft || editedRef.current) return;
        setResumeDraft(draft);
        setTitle(draft.preferredTitle);
        setRawContent(draft.rawContent);
        setProgressText(`可继续上次进度：${draft.questions.length} / ${draft.outline.questions.length}`);
      })
      .catch((draftError) => {
        if (mounted) setError(errorText(draftError));
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<GenerationCheckpoint>('generation-checkpoint', ({ payload }) => {
      if (
        disposed
        || !checkpointEnabledRef.current
        || payload.generationId !== runIdRef.current
      ) return;
      const input = checkpointInputRef.current;
      const draft: GenerationDraft = {
        ...input,
        outline: payload.outline,
        questions: payload.questions,
      };
      setResumeDraft(draft);
      checkpointWriteRef.current = checkpointWriteRef.current
        .catch(() => {})
        .then(() => saveGenerationDraft(draft));
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<GenerationProgress>('generation-progress', ({ payload }) => {
      if (disposed || payload.generationId !== runIdRef.current) return;
      if (payload.stage === 'extracting') {
        setProgressText('正在提取并整理题目…');
      } else {
        setProgressText(`正在分批生成答案：${payload.completed} / ${payload.total}`);
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadModelSettings()
      .then((stored) => {
        if (mounted) setSettings(stored);
      })
      .catch((loadError) => {
        if (mounted) setError(errorText(loadError));
      })
      .finally(() => {
        if (mounted) setSettingsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const settingsReady = validateModelSettings(settings).length === 0;
  const rawLength = rawContent.length;
  const canSubmit = settingsReady && rawLength >= 20 && rawLength <= 100000 && !busy;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!settingsReady) {
      setError('请先完成大模型配置');
      return;
    }
    if (rawLength < 20) {
      setError('面经内容至少需要 20 个字符');
      return;
    }
    if (rawLength > 100000) {
      setError('面经内容不能超过 100000 个字符');
      return;
    }

    setBusy(true);
    setError('');
    const runId = ++runIdRef.current;
    checkpointEnabledRef.current = true;
    setProgressText(resumeDraft
      ? `正在从断点继续：${resumeDraft.questions.length} / ${resumeDraft.outline.questions.length}`
      : '正在提取并整理题目…');
    checkpointInputRef.current = {
      rawContent,
      preferredTitle: title,
      modelName: settings.model,
    };
    try {
      const generated = await analyzeInterviewExperience({
        settings,
        rawContent,
        preferredTitle: title,
        generationId: runId,
        resume: resumeDraft ? {
          outline: resumeDraft.outline,
          questions: resumeDraft.questions,
        } : undefined,
      });
      if (!mountedRef.current || runId !== runIdRef.current) return;
      checkpointEnabledRef.current = false;
      await checkpointWriteRef.current.catch(() => {});
      const experienceId = await createInterviewExperience({
        rawContent,
        modelName: settings.model,
        generated,
      });
      await deleteGenerationDraft();
      setResumeDraft(null);
      if (!mountedRef.current || runId !== runIdRef.current) return;
      onCreated(experienceId, generated.title);
    } catch (submitError) {
      checkpointEnabledRef.current = false;
      console.error('AI 解析面经失败:', submitError);
      if (mountedRef.current && runId === runIdRef.current) {
        setError(errorText(submitError));
      }
    } finally {
      if (mountedRef.current && runId === runIdRef.current) {
        setBusy(false);
        setCancelling(false);
      }
    }
  }

  function handleCancel() {
    const generationId = runIdRef.current;
    setCancelling(true);
    setProgressText('正在停止，当前批次返回后即终止…');
    void cancelInterviewGeneration(generationId).catch((cancelError) => {
      setCancelling(false);
      setError(errorText(cancelError));
    });
  }

  return (
    <div className="page">
      <TopBar title="导入面经" onBack={onBack} />
      <div className="page-content experience-create-page">
        <button className="model-config-card" onClick={onOpenSettings} disabled={busy}>
          <span className="model-config-icon">
            <Sparkle size={21} weight="fill" aria-hidden="true" />
          </span>
          <span className="model-config-copy">
            <span>解析模型</span>
            <strong>{settingsLoading ? '正在读取配置…' : modelSettingsSummary(settings)}</strong>
          </span>
          <GearSix size={20} weight="bold" aria-hidden="true" />
        </button>

        <form className="experience-create-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">面经标题（可选）</span>
            <input
              className="form-input"
              type="text"
              value={title}
              onChange={(event) => {
                editedRef.current = true;
                setTitle(event.target.value.slice(0, 120));
              }}
              placeholder="例如：某厂 Go 后端一面复盘"
              disabled={busy}
            />
          </label>

          <label className="form-field experience-content-field">
            <span className="form-label-row">
              <span className="form-label">面经原文</span>
              <span className={rawLength > 100000 ? 'character-count character-count-error' : 'character-count'}>
                {rawLength.toLocaleString('zh-CN')} / 100,000
              </span>
            </span>
            <textarea
              className="form-textarea experience-textarea"
              value={rawContent}
              onChange={(event) => {
                editedRef.current = true;
                setRawContent(event.target.value);
                setError('');
                if (resumeDraft) {
                  setResumeDraft(null);
                  void deleteGenerationDraft().catch(() => {});
                }
              }}
              placeholder={'粘贴面试记录，例如：\n1. 自我介绍和项目难点\n2. Go 的 GMP 调度模型\n3. Redis 缓存一致性怎么做\n4. 手写 LRU…'}
              disabled={busy}
              autoFocus
            />
          </label>

          <div className="ai-generate-note">
            <MagicWand size={21} weight="duotone" aria-hidden="true" />
            <p>
              {resumeDraft
                ? `已保存生成断点 ${resumeDraft.questions.length} / ${resumeDraft.outline.questions.length}，提交后从这里继续。`
                : 'AI 会去重并改写题目，生成结构化答案；结果仍建议结合实际业务复核。'}
            </p>
          </div>

          {!settingsLoading && !settingsReady && (
            <button type="button" className="model-required-button" onClick={onOpenSettings}>
              先配置第三方大模型
            </button>
          )}
          {error && <p className="form-message form-message-error">{error}</p>}

          <button className="primary-button experience-generate-button" type="submit" disabled={!canSubmit}>
            <Sparkle size={19} weight="fill" aria-hidden="true" />
            {busy
              ? '正在提取题目并生成答案…'
              : resumeDraft ? '从断点继续生成' : 'AI 解析并生成题单'}
          </button>
        </form>
      </div>
      {busy && (
        <div className="experience-processing" role="status" aria-live="polite">
          <span className="processing-orbit" aria-hidden="true" />
          <strong>正在整理面经</strong>
          <span>{progressText}</span>
          <button
            type="button"
            className="secondary-action-button"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? '正在停止…' : '停止生成'}
          </button>
        </div>
      )}
    </div>
  );
}
