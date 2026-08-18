import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type {
  GeneratedResume,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeTemplate,
} from '../lib/types';

export const RESUME_TEMPLATE_OPTIONS: readonly {
  value: ResumeTemplate;
  label: string;
  description: string;
}[] = [
  { value: 'classic', label: '经典', description: '清晰稳重，适合通用岗位' },
  { value: 'modern', label: '现代', description: '强调个人定位与技能' },
  { value: 'minimal', label: '极简', description: '高信息密度，适合技术岗' },
] as const;

interface ResumePreviewProps {
  resume: GeneratedResume;
  template: ResumeTemplate;
}

const RESUME_PAGE_WIDTH = 794;

export function ResponsiveResumePreview(props: ResumePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const scaler = scalerRef.current;
    const sheet = scaler?.querySelector<HTMLElement>('.resume-sheet');
    if (!frame || !scaler || !sheet) return;

    const updateScale = () => {
      const availableWidth = frame.clientWidth;
      if (availableWidth <= 0) return;
      const scale = Math.min(1, availableWidth / RESUME_PAGE_WIDTH);
      scaler.style.setProperty('--resume-preview-scale', String(scale));
      frame.style.height = `${Math.ceil(sheet.scrollHeight * scale)}px`;
    };

    updateScale();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [props.resume, props.template]);

  return (
    <div className="resume-preview-frame" ref={frameRef}>
      <div className="resume-preview-scaler" ref={scalerRef}>
        <ResumePreview {...props} />
      </div>
    </div>
  );
}

function dateRange(startDate: string, endDate: string): string {
  return [startDate, endDate].map((value) => value.trim()).filter(Boolean).join(' - ');
}

function contactItems(resume: GeneratedResume): string[] {
  const { phone, email, location, website } = resume.personal;
  return [phone, email, location, website].map((value) => value.trim()).filter(Boolean);
}

function Highlights({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="resume-preview-highlights">
      {items.filter(Boolean).map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function ExperienceEntry({ entry }: { entry: ResumeExperience }) {
  return (
    <div className="resume-preview-entry">
      <div className="resume-preview-entry-heading">
        <div>
          <strong>{entry.role}</strong>
          <span>{entry.company}</span>
        </div>
        {dateRange(entry.startDate, entry.endDate) && (
          <time>{dateRange(entry.startDate, entry.endDate)}</time>
        )}
      </div>
      <Highlights items={entry.highlights} />
    </div>
  );
}

function ProjectEntry({ entry }: { entry: ResumeProject }) {
  return (
    <div className="resume-preview-entry">
      <div className="resume-preview-entry-heading">
        <div>
          <strong>{entry.name}</strong>
          {entry.role && <span>{entry.role}</span>}
        </div>
        {dateRange(entry.startDate, entry.endDate) && (
          <time>{dateRange(entry.startDate, entry.endDate)}</time>
        )}
      </div>
      {entry.summary && <p className="resume-preview-entry-summary">{entry.summary}</p>}
      <Highlights items={entry.highlights} />
      {entry.technologies.length > 0 && (
        <p className="resume-preview-technologies">
          <b>技术栈</b>
          {entry.technologies.join(' · ')}
        </p>
      )}
    </div>
  );
}

function EducationEntry({ entry }: { entry: ResumeEducation }) {
  return (
    <div className="resume-preview-entry">
      <div className="resume-preview-entry-heading">
        <div>
          <strong>{entry.school}</strong>
          <span>{[entry.degree, entry.major].filter(Boolean).join(' · ')}</span>
        </div>
        {dateRange(entry.startDate, entry.endDate) && (
          <time>{dateRange(entry.startDate, entry.endDate)}</time>
        )}
      </div>
      <Highlights items={entry.highlights} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="resume-preview-section">
      <h2>{title}</h2>
      <div className="resume-preview-section-content">{children}</div>
    </section>
  );
}

export function ResumePreview({ resume, template }: ResumePreviewProps) {
  const contacts = contactItems(resume);
  return (
    <article className={`resume-sheet resume-sheet-${template}`} aria-label={`${resume.personal.name}的简历预览`}>
      <header className="resume-preview-header">
        <p className="resume-preview-label">RESUME</p>
        <h1>{resume.personal.name}</h1>
        <p className="resume-preview-headline">{resume.personal.headline}</p>
        {contacts.length > 0 && (
          <div className="resume-preview-contact">
            {contacts.map((item) => <span key={item}>{item}</span>)}
          </div>
        )}
      </header>

      <div className="resume-preview-body">
        <Section title="个人优势">
          <p className="resume-preview-summary">{resume.summary}</p>
        </Section>

        <Section title="专业技能">
          <div className="resume-preview-skills">
            {resume.skills.map((group, index) => (
              <div key={`${group.category}-${index}`}>
                <strong>{group.category}</strong>
                <span>{group.items.join(' · ')}</span>
              </div>
            ))}
          </div>
        </Section>

        {resume.experience.length > 0 && (
          <Section title="工作经历">
            {resume.experience.map((entry, index) => (
              <ExperienceEntry key={`${entry.company}-${entry.role}-${index}`} entry={entry} />
            ))}
          </Section>
        )}

        {resume.projects.length > 0 && (
          <Section title="项目经历">
            {resume.projects.map((entry, index) => (
              <ProjectEntry key={`${entry.name}-${index}`} entry={entry} />
            ))}
          </Section>
        )}

        {resume.education.length > 0 && (
          <Section title="教育经历">
            {resume.education.map((entry, index) => (
              <EducationEntry key={`${entry.school}-${index}`} entry={entry} />
            ))}
          </Section>
        )}
      </div>
    </article>
  );
}
