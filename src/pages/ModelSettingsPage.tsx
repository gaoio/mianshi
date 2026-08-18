import { useEffect, useState } from 'react';
import { CheckCircle, Eye, EyeSlash, PlugsConnected, ShieldCheck } from '@phosphor-icons/react';
import {
  EMPTY_MODEL_SETTINGS,
  MODEL_PROTOCOL_OPTIONS,
  loadModelSettings,
  modelProtocolOption,
  saveModelSettings,
  switchModelProtocol,
  testModelConnection,
  validateModelSettings,
  type ModelSettings,
  type ModelProtocol,
} from '../lib/modelSettings';
import { TopBar } from '../components/TopBar';

interface ModelSettingsPageProps {
  onBack: () => void;
}

export function ModelSettingsPage({ onBack }: ModelSettingsPageProps) {
  const [settings, setSettings] = useState<ModelSettings>({ ...EMPTY_MODEL_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const protocolOption = modelProtocolOption(settings.protocol);

  useEffect(() => {
    let mounted = true;
    loadModelSettings()
      .then((stored) => {
        if (mounted) setSettings(stored);
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : '读取模型配置失败');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function update<K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setError('');
    setSuccess('');
  }

  function updateProtocol(protocol: ModelProtocol) {
    setSettings((current) => switchModelProtocol(current, protocol));
    setError('');
    setSuccess('');
  }

  function firstValidationError(): string | null {
    return validateModelSettings(settings)[0] ?? null;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const validationError = firstValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy('save');
    setError('');
    try {
      await saveModelSettings(settings);
      onBack();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存配置失败');
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    const validationError = firstValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy('test');
    setError('');
    setSuccess('');
    try {
      const message = await testModelConnection(settings);
      setSuccess(message);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <TopBar title="大模型配置" onBack={onBack} />
      <div className="page-content model-settings-page">
        <div className="settings-notice">
          <ShieldCheck size={24} weight="duotone" aria-hidden="true" />
          <p>
            支持 Chat Completions、Responses 和 Anthropic Messages 三种常用协议。只需填写服务商的 Base URL，
            应用会自动拼接请求路径；API Key 仅保存在本机。
          </p>
        </div>

        <form className="settings-form" onSubmit={handleSave}>
          <fieldset className="protocol-fieldset" disabled={loading || busy !== null}>
            <legend className="form-label">接口协议</legend>
            <div className="protocol-options" role="radiogroup" aria-label="大模型接口协议">
              {MODEL_PROTOCOL_OPTIONS.map((option) => {
                const selected = settings.protocol === option.value;
                return (
                  <button
                    key={option.value}
                    className={`protocol-option ${selected ? 'protocol-option-active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => updateProtocol(option.value)}
                  >
                    <span className="protocol-option-check" aria-hidden="true">
                      {selected && <span />}
                    </span>
                    <span className="protocol-option-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="form-field">
            <span className="form-label">Base URL</span>
            <input
              className="form-input"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={settings.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder={protocolOption.baseUrlPlaceholder}
              disabled={loading || busy !== null}
            />
            <span className="form-help">{protocolOption.baseUrlHelp}</span>
          </label>

          <label className="form-field">
            <span className="form-label">模型名称</span>
            <input
              className="form-input"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={settings.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="例如 deepseek-chat、qwen-plus"
              disabled={loading || busy !== null}
            />
          </label>

          <div className="token-limit-grid">
            <label className="form-field">
              <span className="form-label">上下文长度</span>
              <input
                className="form-input"
                type="number"
                inputMode="numeric"
                step={1}
                value={settings.contextLength || ''}
                onChange={(event) => update(
                  'contextLength',
                  event.currentTarget.value === '' ? 0 : event.currentTarget.valueAsNumber,
                )}
                placeholder="131072"
                disabled={loading || busy !== null}
              />
              <span className="form-help">输入与输出共享的总 token 预算</span>
            </label>

            <label className="form-field">
              <span className="form-label">输出长度</span>
              <input
                className="form-input"
                type="number"
                inputMode="numeric"
                step={1}
                value={settings.outputLength || ''}
                onChange={(event) => update(
                  'outputLength',
                  event.currentTarget.value === '' ? 0 : event.currentTarget.valueAsNumber,
                )}
                placeholder="12000"
                disabled={loading || busy !== null}
              />
              <span className="form-help">作为接口最大生成 token 数发送</span>
            </label>
          </div>

          <label className="form-field">
            <span className="form-label">API Key</span>
            <span className="secret-input-wrap">
              <input
                className="form-input secret-input"
                type={showApiKey ? 'text' : 'password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={settings.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                placeholder="输入第三方模型 API Key"
                disabled={loading || busy !== null}
              />
              <button
                type="button"
                className="secret-toggle"
                onClick={() => setShowApiKey((value) => !value)}
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            </span>
            <span className="form-help">
              {protocolOption.authHelp}。API Key 保存在当前设备的应用本地存储中，请勿在共享设备使用。
            </span>
          </label>

          {error && <p className="form-message form-message-error">{error}</p>}
          {success && (
            <p className="form-message form-message-success">
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              {success}
            </p>
          )}

          <div className="settings-actions">
            <button
              className="secondary-action-button"
              type="button"
              onClick={() => void handleTest()}
              disabled={loading || busy !== null}
            >
              <PlugsConnected size={19} weight="bold" aria-hidden="true" />
              {busy === 'test' ? '正在测试…' : '测试连接'}
            </button>
            <button className="primary-button" type="submit" disabled={loading || busy !== null}>
              {busy === 'save' ? '正在保存…' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
