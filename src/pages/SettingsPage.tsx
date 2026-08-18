import { Brain, CaretRight, RocketLaunch, SlidersHorizontal } from '@phosphor-icons/react';
import { TopBar } from '../components/TopBar';

interface SettingsPageProps {
  onBack?: () => void;
  onModelSettings: () => void;
  onAppUpdate: () => void;
}

export function SettingsPage({ onBack, onModelSettings, onAppUpdate }: SettingsPageProps) {
  return (
    <div className="page">
      <TopBar title="设置" onBack={onBack} />
      <div className="page-content settings-hub-page">
        <header className="settings-hub-intro">
          <span className="settings-hub-kicker">
            <SlidersHorizontal size={15} weight="bold" aria-hidden="true" />
            偏好与维护
          </span>
          <h1>选择要调整的内容</h1>
          <p>模型能力与应用版本分别管理，修改时互不影响。</p>
        </header>

        <div className="settings-entry-list">
          <button className="settings-entry settings-entry-model" type="button" onClick={onModelSettings}>
            <span className="settings-entry-icon" aria-hidden="true">
              <Brain size={28} weight="duotone" />
            </span>
            <span className="settings-entry-copy">
              <strong>大模型配置</strong>
              <small>接口协议、模型、Token 预算与 API Key</small>
            </span>
            <CaretRight className="settings-entry-arrow" size={20} weight="bold" aria-hidden="true" />
          </button>

          <button className="settings-entry settings-entry-update" type="button" onClick={onAppUpdate}>
            <span className="settings-entry-icon" aria-hidden="true">
              <RocketLaunch size={28} weight="duotone" />
            </span>
            <span className="settings-entry-copy">
              <strong>应用更新</strong>
              <small>查看当前版本、检查并安装新版</small>
            </span>
            <CaretRight className="settings-entry-arrow" size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
