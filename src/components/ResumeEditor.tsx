import { Plus, Trash } from '@phosphor-icons/react';
import type { GeneratedResume, ResumePersonal } from '../lib/types';

interface ResumeEditorProps {
  resume: GeneratedResume;
  onChange: (resume: GeneratedResume) => void;
}

function splitItems(value: string): string[] {
  return value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function ResumeEditor({ resume, onChange }: ResumeEditorProps) {
  function mutate(change: (draft: GeneratedResume) => void) {
    const draft = structuredClone(resume);
    change(draft);
    onChange(draft);
  }

  function updatePersonal(field: keyof ResumePersonal, value: string) {
    mutate((draft) => {
      draft.personal[field] = value;
    });
  }

  return (
    <div className="resume-editor">
      <section className="resume-editor-section">
        <div className="resume-editor-section-heading">
          <div><span>01</span><h2>基本信息</h2></div>
        </div>
        <div className="resume-editor-grid">
          {([
            ['name', '姓名'],
            ['headline', '职业定位'],
            ['phone', '电话'],
            ['email', '邮箱'],
            ['location', '所在地'],
            ['website', '个人主页'],
          ] as const).map(([field, label]) => (
            <label className="form-field" key={field}>
              <span className="form-label">{label}</span>
              <input
                className="form-input"
                value={resume.personal[field]}
                onChange={(event) => updatePersonal(field, event.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="form-field">
          <span className="form-label">个人优势</span>
          <textarea
            className="form-textarea resume-editor-textarea"
            value={resume.summary}
            onChange={(event) => mutate((draft) => { draft.summary = event.target.value; })}
          />
        </label>
      </section>

      <section className="resume-editor-section">
        <div className="resume-editor-section-heading">
          <div><span>02</span><h2>专业技能</h2></div>
          <button
            type="button"
            onClick={() => mutate((draft) => draft.skills.push({ category: '技能分类', items: ['待补充'] }))}
          >
            <Plus size={15} weight="bold" /> 添加
          </button>
        </div>
        <div className="resume-editor-card-list">
          {resume.skills.map((group, index) => (
            <div className="resume-editor-card" key={`skill-${index}`}>
              <button
                className="resume-editor-remove"
                type="button"
                aria-label={`删除第 ${index + 1} 组技能`}
                onClick={() => mutate((draft) => { draft.skills.splice(index, 1); })}
              >
                <Trash size={16} />
              </button>
              <label className="form-field">
                <span className="form-label">分类</span>
                <input
                  className="form-input"
                  value={group.category}
                  onChange={(event) => mutate((draft) => { draft.skills[index].category = event.target.value; })}
                />
              </label>
              <label className="form-field">
                <span className="form-label">技能（用逗号分隔）</span>
                <input
                  className="form-input"
                  value={group.items.join('，')}
                  onChange={(event) => mutate((draft) => { draft.skills[index].items = splitItems(event.target.value); })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="resume-editor-section">
        <div className="resume-editor-section-heading">
          <div><span>03</span><h2>工作经历</h2></div>
          <button
            type="button"
            onClick={() => mutate((draft) => draft.experience.push({
              company: '待补充', role: '职位', startDate: '', endDate: '', highlights: ['待补充'],
            }))}
          >
            <Plus size={15} weight="bold" /> 添加
          </button>
        </div>
        <div className="resume-editor-card-list">
          {resume.experience.map((entry, index) => (
            <div className="resume-editor-card" key={`experience-${index}`}>
              <button
                className="resume-editor-remove"
                type="button"
                aria-label={`删除第 ${index + 1} 段工作经历`}
                onClick={() => mutate((draft) => { draft.experience.splice(index, 1); })}
              >
                <Trash size={16} />
              </button>
              <div className="resume-editor-grid">
                {([
                  ['company', '公司'], ['role', '职位'], ['startDate', '开始时间'], ['endDate', '结束时间'],
                ] as const).map(([field, label]) => (
                  <label className="form-field" key={field}>
                    <span className="form-label">{label}</span>
                    <input
                      className="form-input"
                      value={entry[field]}
                      onChange={(event) => mutate((draft) => { draft.experience[index][field] = event.target.value; })}
                    />
                  </label>
                ))}
              </div>
              <label className="form-field">
                <span className="form-label">成果描述（每行一条）</span>
                <textarea
                  className="form-textarea resume-editor-textarea"
                  value={entry.highlights.join('\n')}
                  onChange={(event) => mutate((draft) => { draft.experience[index].highlights = splitLines(event.target.value); })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="resume-editor-section">
        <div className="resume-editor-section-heading">
          <div><span>04</span><h2>项目经历</h2></div>
          <button
            type="button"
            onClick={() => mutate((draft) => draft.projects.push({
              name: '项目名称', role: '', startDate: '', endDate: '', summary: '项目简介',
              highlights: [], technologies: [],
            }))}
          >
            <Plus size={15} weight="bold" /> 添加
          </button>
        </div>
        <div className="resume-editor-card-list">
          {resume.projects.map((entry, index) => (
            <div className="resume-editor-card" key={`project-${index}`}>
              <button
                className="resume-editor-remove"
                type="button"
                aria-label={`删除第 ${index + 1} 个项目`}
                onClick={() => mutate((draft) => { draft.projects.splice(index, 1); })}
              >
                <Trash size={16} />
              </button>
              <div className="resume-editor-grid">
                {([
                  ['name', '项目名称'], ['role', '角色'], ['startDate', '开始时间'], ['endDate', '结束时间'],
                ] as const).map(([field, label]) => (
                  <label className="form-field" key={field}>
                    <span className="form-label">{label}</span>
                    <input
                      className="form-input"
                      value={entry[field]}
                      onChange={(event) => mutate((draft) => { draft.projects[index][field] = event.target.value; })}
                    />
                  </label>
                ))}
              </div>
              <label className="form-field">
                <span className="form-label">项目简介</span>
                <textarea
                  className="form-textarea resume-editor-textarea"
                  value={entry.summary}
                  onChange={(event) => mutate((draft) => { draft.projects[index].summary = event.target.value; })}
                />
              </label>
              <label className="form-field">
                <span className="form-label">项目成果（每行一条）</span>
                <textarea
                  className="form-textarea resume-editor-textarea"
                  value={entry.highlights.join('\n')}
                  onChange={(event) => mutate((draft) => { draft.projects[index].highlights = splitLines(event.target.value); })}
                />
              </label>
              <label className="form-field">
                <span className="form-label">技术栈（用逗号分隔）</span>
                <input
                  className="form-input"
                  value={entry.technologies.join('，')}
                  onChange={(event) => mutate((draft) => { draft.projects[index].technologies = splitItems(event.target.value); })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="resume-editor-section">
        <div className="resume-editor-section-heading">
          <div><span>05</span><h2>教育经历</h2></div>
          <button
            type="button"
            onClick={() => mutate((draft) => draft.education.push({
              school: '待补充', degree: '学历', major: '', startDate: '', endDate: '', highlights: [],
            }))}
          >
            <Plus size={15} weight="bold" /> 添加
          </button>
        </div>
        <div className="resume-editor-card-list">
          {resume.education.map((entry, index) => (
            <div className="resume-editor-card" key={`education-${index}`}>
              <button
                className="resume-editor-remove"
                type="button"
                aria-label={`删除第 ${index + 1} 段教育经历`}
                onClick={() => mutate((draft) => { draft.education.splice(index, 1); })}
              >
                <Trash size={16} />
              </button>
              <div className="resume-editor-grid">
                {([
                  ['school', '学校'], ['degree', '学历'], ['major', '专业'],
                  ['startDate', '开始时间'], ['endDate', '结束时间'],
                ] as const).map(([field, label]) => (
                  <label className="form-field" key={field}>
                    <span className="form-label">{label}</span>
                    <input
                      className="form-input"
                      value={entry[field]}
                      onChange={(event) => mutate((draft) => { draft.education[index][field] = event.target.value; })}
                    />
                  </label>
                ))}
              </div>
              <label className="form-field">
                <span className="form-label">补充信息（每行一条）</span>
                <textarea
                  className="form-textarea resume-editor-textarea"
                  value={entry.highlights.join('\n')}
                  onChange={(event) => mutate((draft) => { draft.education[index].highlights = splitLines(event.target.value); })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
