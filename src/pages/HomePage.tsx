import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  FileText,
  GearSix,
  Notebook,
  ShieldCheck,
  Sparkle,
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
    key: 'interview' as const,
    label: '面经整理',
    description: '把面试记录变成可复习的题单',
    capabilities: ['自动提取问题', '生成结构化答案', '导出 PDF 题单'],
    action: '打开我的面经',
    Icon: Notebook,
  },
  resume: {
    key: 'resume' as const,
    label: '简历生成器',
    description: '用一句话生成可编辑的专业简历',
    capabilities: ['智能生成内容', '自由编辑模板', '导出 A4 PDF'],
    action: '开始制作简历',
    Icon: FileText,
  },
} as const;

export function HomePage({
  onInterviewExperiences,
  onResumeGenerator,
  onSettings,
}: HomePageProps) {
  const [activeTool, setActiveTool] = useState<ToolKey>('interview');

  function openTool(tool: ToolKey) {
    if (tool === 'interview') onInterviewExperiences();
    else onResumeGenerator();
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

      <main className="page-content feature-home-page">
        <section className="feature-home-hero">
          <div className="feature-home-hero-top">
            <span className="feature-home-badge">
              <Sparkle size={13} weight="fill" aria-hidden="true" />
              AI 求职助手
            </span>
            <div className="feature-home-tabs" role="tablist" aria-label="当前工具">
              {(Object.keys(TOOL_CONTENT) as ToolKey[]).map((key) => (
                <button
                  key={key}
                  className="feature-home-tab"
                  type="button"
                  role="tab"
                  aria-selected={activeTool === key}
                  aria-controls="feature-tool-cards"
                  onClick={() => setActiveTool(key)}
                >
                  {TOOL_CONTENT[key].label}
                </button>
              ))}
            </div>
          </div>
          <h1>面试复盘与简历，一站式搞定</h1>
          <p className="feature-home-hero-sub">
            粘贴面试记录自动整理成题单，或一句话生成专业简历。所有内容与配置仅保存在当前设备。
          </p>
        </section>

        <section id="feature-tool-cards" className="feature-tool-cards" role="tabpanel">
          {(Object.keys(TOOL_CONTENT) as ToolKey[]).map((key) => {
            const tool = TOOL_CONTENT[key];
            const ToolIcon = tool.Icon;
            const selected = activeTool === key;
            return (
              <div
                key={key}
                className="feature-tool-card"
                data-tool={tool.key}
                data-selected={selected}
                onClick={() => setActiveTool(key)}
              >
                <span className="feature-tool-card-icon" aria-hidden="true">
                  <ToolIcon size={27} weight="duotone" />
                </span>
                <h2>{tool.label}</h2>
                <p className="feature-tool-card-desc">{tool.description}</p>
                <ul className="feature-tool-capabilities" aria-label={`${tool.label}功能`}>
                  {tool.capabilities.map((capability) => (
                    <li key={capability}>
                      <CheckCircle size={17} weight="bold" aria-hidden="true" />
                      <span>{capability}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className="feature-tool-card-open"
                  type="button"
                  onClick={() => openTool(key)}
                >
                  {tool.action}
                  <ArrowRight size={17} weight="bold" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </section>

        <aside className="feature-home-privacy">
          <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
          <span>内容与配置仅保存在当前设备</span>
        </aside>
      </main>
    </div>
  );
}