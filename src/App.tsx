import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { onBackButtonPress } from '@tauri-apps/api/app';
import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
import type { Screen } from './lib/navigation';
import type {
  InterviewExperience,
  InterviewExperienceQuestion,
} from './lib/types';
import './App.css';

const InterviewExperiencesPage = lazy(() =>
  import('./pages/InterviewExperiencesPage').then((module) => ({ default: module.InterviewExperiencesPage })),
);
const CreateInterviewExperiencePage = lazy(() =>
  import('./pages/CreateInterviewExperiencePage').then((module) => ({ default: module.CreateInterviewExperiencePage })),
);
const ModelSettingsPage = lazy(() =>
  import('./pages/ModelSettingsPage').then((module) => ({ default: module.ModelSettingsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const AppUpdatePage = lazy(() =>
  import('./pages/AppUpdatePage').then((module) => ({ default: module.AppUpdatePage })),
);
const ExperienceQuestionsPage = lazy(() =>
  import('./pages/ExperienceQuestionsPage').then((module) => ({ default: module.ExperienceQuestionsPage })),
);
const ExperienceQuestionDetailPage = lazy(() =>
  import('./pages/ExperienceQuestionDetailPage').then((module) => ({ default: module.ExperienceQuestionDetailPage })),
);

// 单一屏幕栈，返回键/返回按钮按栈弹出；回到根页面时触发系统退出逻辑。
type Stack = Screen[];

function App() {
  const [stack, setStack] = useState<Stack>([{ name: 'experiences' }]);

  const currentScreen = stack[stack.length - 1];

  // 返回键处理：用 ref 保存最新状态，避免监听器闭包捕获到旧值
  const stackRef = useRef(stack);
  stackRef.current = stack;

  // 桌面端记忆窗口尺寸，重启后恢复（Android 为全屏窗口，跳过）
  useEffect(() => {
    if (navigator.userAgent.includes('Android')) return;
    // 非 Tauri 运行环境（浏览器预览等）没有 IPC 注入，直接跳过
    if (!('__TAURI_INTERNALS__' in window)) return;

    const STORAGE_KEY = 'mianshi-window-size';
    let disposed = false;
    let unregisterResized: (() => void) | undefined;

    function readSavedSize(): PhysicalSize | null {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as { width?: unknown; height?: unknown };
        const width = typeof parsed.width === 'number' ? parsed.width : NaN;
        const height = typeof parsed.height === 'number' ? parsed.height : NaN;
        if (width >= 640 && height >= 480) return new PhysicalSize(width, height);
      } catch {
        // 损坏的缓存值直接忽略，使用默认窗口尺寸
      }
      return null;
    }

    function saveWindowSize(width: number, height: number) {
      if (width < 640 || height < 480) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, height }));
      } catch {
        // 隐私模式等无法持久化时静默跳过
      }
    }

    let windowHandle: ReturnType<typeof getCurrentWindow>;
    try {
      windowHandle = getCurrentWindow();
    } catch {
      // IPC 尚未就绪时静默降级，不阻塞页面渲染
      return;
    }
    const savedSize = readSavedSize();
    if (savedSize) {
      windowHandle.setSize(savedSize).catch(() => {});
    }

    windowHandle
      .onResized(({ payload }) => {
        saveWindowSize(payload.width, payload.height);
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unregisterResized = unlisten;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unregisterResized?.();
    };
  }, []);

  useEffect(() => {
    // 仅在 Android 上处理系统返回键（桌面端无此事件）
    if (!navigator.userAgent.includes('Android')) return;

    let unregister: (() => void) | undefined;
    let disposed = false;

    onBackButtonPress(() => {
      const current = stackRef.current;
      if (current.length > 1) {
        setStack((prev) => prev.slice(0, -1));
      } else {
        // 已在根页面，退出应用
        getCurrentWindow().close().catch(() => {});
      }
    }).then((listener) => {
      if (disposed) {
        listener.unregister();
      } else {
        unregister = () => listener.unregister();
      }
    });

    return () => {
      disposed = true;
      unregister?.();
    };
  }, []);

  function push(screen: Screen) {
    setStack((prev) => [...prev, screen]);
  }

  function pop() {
    setStack((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  }

  function replaceTop(screen: Screen) {
    setStack((prev) => [...prev.slice(0, -1), screen]);
  }

  function openExperience(experience: InterviewExperience) {
    push({
      name: 'experienceQuestions',
      experienceId: experience.id,
      experienceTitle: experience.title,
    });
  }

  function openExperienceQuestionDetail(list: InterviewExperienceQuestion[], index: number) {
    push({
      name: 'experienceQuestionDetail',
      listIds: list.map((question) => question.id),
      listIndex: index,
    });
  }

  function renderScreen(screen: Screen) {
    switch (screen.name) {
      case 'experiences':
        return (
          <InterviewExperiencesPage
            onCreate={() => push({ name: 'experienceCreate' })}
            onSettings={() => push({ name: 'settings' })}
            onSelect={openExperience}
          />
        );
      case 'experienceCreate':
        return (
          <CreateInterviewExperiencePage
            onBack={pop}
            onOpenSettings={() => push({ name: 'modelSettings' })}
            onCreated={(experienceId, experienceTitle) =>
              replaceTop({ name: 'experienceQuestions', experienceId, experienceTitle })
            }
          />
        );
      case 'modelSettings':
        return <ModelSettingsPage onBack={pop} />;
      case 'settings':
        return (
          <SettingsPage
            onBack={pop}
            onModelSettings={() => push({ name: 'modelSettings' })}
            onAppUpdate={() => push({ name: 'appUpdate' })}
          />
        );
      case 'appUpdate':
        return <AppUpdatePage onBack={pop} />;
      case 'experienceQuestions':
        return (
          <ExperienceQuestionsPage
            experienceId={screen.experienceId}
            experienceTitle={screen.experienceTitle}
            onBack={pop}
            onDeleted={pop}
            onSelectQuestion={openExperienceQuestionDetail}
          />
        );
      case 'experienceQuestionDetail':
        return (
          <ExperienceQuestionDetailPage
            questionIds={screen.listIds}
            index={screen.listIndex}
            onBack={pop}
            onNavigateIndex={(index) => replaceTop({ ...screen, listIndex: index })}
          />
        );
    }
  }

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="page-content" />}>{renderScreen(currentScreen)}</Suspense>
    </div>
  );
}

export default App;
