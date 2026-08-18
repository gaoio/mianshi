import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  FileText,
  GearSix,
  ListDashes,
  Notebook,
  ShieldCheck,
} from '@phosphor-icons/react';
import { TopBar } from '../components/TopBar';

interface HomePageProps {
  onInterviewExperiences: () => void;
  onResumeGenerator: () => void;
  onSettings: () => void;
}

type ToolKey = 'interview' | 'resume';

const TOOL_CONTENT = {
  interview: {
    label: '面经整理',
    description: '把面试记录变成可复习的题单',
    capabilities: ['自动提取问题', '生成结构化答案', '导出 PDF 题单'],
    action: '打开我的面经',
    switchAction: '改为制作简历',
    Icon: ListDashes,
  },
  resume: {
    label: '简历生成器',
    description: '用一句话生成可编辑的专业简历',
    capabilities: ['智能生成内容', '自由编辑模板', '导出 A4 PDF'],
    action: '开始制作简历',
    switchAction: '改为整理面经',
    Icon: FileText,
  },
} as const;

export function HomePage({
  onInterviewExperiences,
  onResumeGenerator,
  onSettings,
}: HomePageProps) {
  const [activeTool, setActiveTool] = useState<ToolKey>('interview');
  const tool = TOOL_CONTENT[activeTool];
  const ToolIcon = tool.Icon;

  function openActiveTool() {
    if (activeTool === 'interview') onInterviewExperiences();
    else onResumeGenerator();
  }

  function selectOtherTool() {
    setActiveTool((current) => (current === 'interview' ? 'resume' : 'interview'));
  }

  return (
    <div className="page">
      <TopBar
        title="求职工具"
        rightSlot={
          <button className="icon-button" onClick={onSettings} aria-label="打开设置">
            <GearSix size={22} weight="bold" aria-hidden="true" />
          </button>
        }
      />

      <main className="page-content feature-home-page" data-tool={activeTool}>
        <div className="feature-tool-tabs" role="tablist" aria-label="选择求职工具">
          <button
            className="feature-tool-tab feature-tool-tab-interview"
            type="button"
            role="tab"
            aria-selected={activeTool === 'interview'}
            aria-controls="feature-tool-panel"
            onClick={() => setActiveTool('interview')}
          >
            <Notebook size={27} weight="duotone" aria-hidden="true" />
            <span>面经整理</span>
          </button>
          <button
            className="feature-tool-tab feature-tool-tab-resume"
            type="button"
            role="tab"
            aria-selected={activeTool === 'resume'}
            aria-controls="feature-tool-panel"
            onClick={() => setActiveTool('resume')}
          >
            <FileText size={27} weight="duotone" aria-hidden="true" />
            <span>简历生成器</span>
          </button>
        </div>

        <section
          id="feature-tool-panel"
          className="feature-tool-panel"
          role="tabpanel"
          aria-label={tool.label}
        >
          <div className="feature-tool-heading">
            <span className="feature-tool-icon" aria-hidden="true">
              <ToolIcon size={32} weight="duotone" />
            </span>
            <h1>{tool.label}</h1>
            <p>{tool.description}</p>
          </div>

          <ul className="feature-tool-capabilities" aria-label={`${tool.label}功能`}>
            {tool.capabilities.map((capability) => (
              <li key={capability}>
                <CheckCircle size={22} weight="bold" aria-hidden="true" />
                <span>{capability}</span>
              </li>
            ))}
          </ul>

          <button className="feature-tool-primary" type="button" onClick={openActiveTool}>
            {tool.action}
          </button>
          <button className="feature-tool-switch" type="button" onClick={selectOtherTool}>
            {tool.switchAction}
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </button>
        </section>

        <aside className="feature-home-privacy">
          <ShieldCheck size={18} weight="duotone" aria-hidden="true" />
          <span>内容与配置仅保存在当前设备</span>
        </aside>
      </main>
    </div>
  );
}
