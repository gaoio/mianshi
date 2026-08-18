import { BriefcaseMetal, FileText, GearSix, House, Notebook, ShieldCheck } from '@phosphor-icons/react';
import type { Screen } from '../lib/navigation';

interface AppNavProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

function activeKey(screen: Screen): string {
  switch (screen.name) {
    case 'home':
      return 'home';
    case 'resumeGenerator':
      return 'resume';
    case 'settings':
    case 'modelSettings':
    case 'appUpdate':
      return 'settings';
    default:
      return 'experiences';
  }
}

const NAV_ITEMS: readonly {
  key: string;
  label: string;
  screen: Screen;
  Icon: typeof House;
}[] = [
  { key: 'home', label: '求职工具', screen: { name: 'home' }, Icon: House },
  { key: 'experiences', label: '我的面经', screen: { name: 'experiences' }, Icon: Notebook },
  { key: 'resume', label: '简历生成器', screen: { name: 'resumeGenerator' }, Icon: FileText },
  { key: 'settings', label: '设置', screen: { name: 'settings' }, Icon: GearSix },
] as const;

export function AppNav({ currentScreen, onNavigate }: AppNavProps) {
  const active = activeKey(currentScreen);

  return (
    <nav className="app-sidebar" aria-label="主导航">
      <div className="app-sidebar-brand">
        <span className="app-sidebar-logo" aria-hidden="true">
          <BriefcaseMetal size={22} weight="fill" />
        </span>
        <span className="app-sidebar-brand-copy">
          <strong>求职工具</strong>
          <small>面试 · 简历</small>
        </span>
      </div>

      <ul className="app-sidebar-nav">
        {NAV_ITEMS.map(({ key, label, screen, Icon }) => {
          const selected = active === key;
          return (
            <li key={key}>
              <button
                className={`app-sidebar-item${selected ? ' app-sidebar-item-active' : ''}`}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onNavigate(screen)}
              >
                <Icon size={20} weight={selected ? 'fill' : 'duotone'} aria-hidden="true" />
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="app-sidebar-footer">
        <ShieldCheck size={14} weight="duotone" aria-hidden="true" />
        <span>内容仅保存在当前设备</span>
      </p>
    </nav>
  );
}