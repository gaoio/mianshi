import { MoonStars, Sun } from '@phosphor-icons/react';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? '切换到亮色主题' : '切换到暗色主题';

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun size={20} weight="bold" aria-hidden="true" />
      ) : (
        <MoonStars size={20} weight="bold" aria-hidden="true" />
      )}
    </button>
  );
}
