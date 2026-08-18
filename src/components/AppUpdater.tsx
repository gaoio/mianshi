import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  DownloadSimple,
  RocketLaunch,
  WarningCircle,
} from '@phosphor-icons/react';

interface AppUpdateInfo {
  configured: boolean;
  currentVersion: string;
  platform: string;
  canInstallInApp: boolean;
  available: boolean;
  latestVersion: string | null;
  notes: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
}

interface AppUpdateProgress {
  phase: 'downloading' | 'installing';
  downloaded: number;
  total: number | null;
  percent: number | null;
}

type BusyState = 'checking' | 'installing' | 'opening' | null;

function messageFrom(error: unknown, fallback: string) {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    android: 'Android',
    linux: 'Linux',
    macos: 'macOS',
    windows: 'Windows',
  };
  return labels[platform] ?? platform;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AppUpdater() {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const [busy, setBusy] = useState<BusyState>('checking');
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const status = await invoke<AppUpdateInfo>('get_app_update_status');
        if (!active) return;
        setInfo(status);
        if (status.configured && (status.canInstallInApp || status.platform === 'android')) {
          const result = await invoke<AppUpdateInfo>('check_app_update');
          if (active) {
            setInfo(result);
            setHasChecked(true);
          }
        }
      } catch (loadError) {
        if (active) setError(messageFrom(loadError, '读取更新状态失败'));
      } finally {
        if (active) setBusy(null);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  async function handleCheck() {
    setBusy('checking');
    setError('');
    try {
      setInfo(await invoke<AppUpdateInfo>('check_app_update'));
      setHasChecked(true);
    } catch (checkError) {
      setError(messageFrom(checkError, '检查更新失败'));
    } finally {
      setBusy(null);
    }
  }

  async function handleInstall() {
    if (!info?.available) return;
    setError('');

    if (!info.canInstallInApp) {
      if (!info.downloadUrl) {
        setError('更新清单缺少 Android 安装包地址');
        return;
      }
      setBusy('opening');
      try {
        await invoke('open_android_update', { url: info.downloadUrl });
      } catch (openError) {
        setError(messageFrom(openError, '打开安装包失败'));
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy('installing');
    setProgress({ phase: 'downloading', downloaded: 0, total: null, percent: null });
    const unlisten = await listen<AppUpdateProgress>('app-update-progress', (event) => {
      setProgress(event.payload);
    });
    try {
      await invoke('install_app_update');
    } catch (installError) {
      setError(messageFrom(installError, '安装更新失败'));
      setBusy(null);
      setProgress(null);
    } finally {
      unlisten();
    }
  }

  async function handleOpenRelease() {
    setBusy('opening');
    setError('');
    try {
      await invoke('open_app_release_page');
    } catch (openError) {
      setError(messageFrom(openError, '打开发布页失败'));
    } finally {
      setBusy(null);
    }
  }

  const statusText = !info
    ? '正在读取版本信息…'
    : !info.configured
      ? '此版本暂不支持在线更新'
      : info.available
        ? `发现新版本 v${info.latestVersion}`
        : hasChecked
          ? '已是最新版本'
          : '点击“检查更新”获取最新版本信息';

  return (
    <section className="app-updater" aria-labelledby="app-updater-title">
      <div className="app-updater-heading">
        <span className="app-updater-icon" aria-hidden="true">
          <RocketLaunch size={22} weight="duotone" />
        </span>
        <span>
          <h2 id="app-updater-title">版本状态</h2>
          <small>
            {info ? `${platformLabel(info.platform)} · 当前 v${info.currentVersion}` : '正在加载版本'}
          </small>
        </span>
      </div>

      <div className={`app-updater-status ${info?.available ? 'app-updater-status-new' : ''}`}>
        {info?.available
          ? <DownloadSimple size={20} weight="bold" aria-hidden="true" />
          : info?.configured && hasChecked
            ? <CheckCircle size={20} weight="fill" aria-hidden="true" />
            : <WarningCircle size={20} weight="duotone" aria-hidden="true" />}
        <span>{busy === 'checking' ? '正在检查更新…' : statusText}</span>
      </div>

      {info?.notes && info.available && <p className="app-updater-notes">{info.notes}</p>}

      {busy === 'installing' && progress && (
        <div className="app-update-progress">
          <div>
            <span>{progress.phase === 'installing' ? '正在安装并准备重启…' : '正在下载更新…'}</span>
            <small>
              {progress.percent !== null
                ? `${progress.percent}%`
                : progress.downloaded > 0
                  ? formatBytes(progress.downloaded)
                  : '准备中'}
            </small>
          </div>
          <progress max={100} value={progress.percent ?? undefined} />
        </div>
      )}

      {error && <p className="app-updater-error">{error}</p>}

      {info?.platform === 'android' && (
        <p className="app-updater-help">安装包下载完成后由 Android 系统确认安装，应用不会绕过系统安全校验。</p>
      )}

      <div className="app-updater-actions">
        <button
          className="secondary-action-button"
          type="button"
          onClick={() => void handleCheck()}
          disabled={!info?.configured || busy !== null}
        >
          <ArrowsClockwise size={18} weight="bold" aria-hidden="true" />
          {busy === 'checking' ? '检查中…' : '检查更新'}
        </button>
        {info?.available && (
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleInstall()}
            disabled={busy !== null}
          >
            <DownloadSimple size={18} weight="bold" aria-hidden="true" />
            {busy === 'installing'
              ? '更新中…'
              : busy === 'opening'
                ? '正在打开…'
                : info.canInstallInApp
                  ? '下载并安装'
                  : '下载 Android 安装包'}
          </button>
        )}
        {info?.releaseUrl && !info.available && (
          <button
            className="app-updater-link"
            type="button"
            onClick={() => void handleOpenRelease()}
            disabled={busy !== null}
          >
            查看发布记录 <ArrowSquareOut size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
