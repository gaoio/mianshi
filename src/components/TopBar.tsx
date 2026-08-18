import { ArrowLeft } from '@phosphor-icons/react';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export function TopBar({ title, onBack, rightSlot }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-start">
        {onBack ? (
          <button className="top-bar-back" onClick={onBack} aria-label="返回">
            <ArrowLeft size={21} weight="bold" aria-hidden="true" />
          </button>
        ) : (
          <ThemeToggle />
        )}
      </div>
      <h1 className="top-bar-title">{title}</h1>
      <div className="top-bar-right">
        {onBack && <ThemeToggle />}
        {rightSlot}
      </div>
    </header>
  );
}
