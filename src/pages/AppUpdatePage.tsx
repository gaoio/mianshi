import { AppUpdater } from '../components/AppUpdater';
import { TopBar } from '../components/TopBar';

interface AppUpdatePageProps {
  onBack: () => void;
}

export function AppUpdatePage({ onBack }: AppUpdatePageProps) {
  return (
    <div className="page">
      <TopBar title="应用更新" onBack={onBack} />
      <div className="page-content app-update-page">
        <AppUpdater />
      </div>
    </div>
  );
}
