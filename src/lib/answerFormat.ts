// 结构化答案解析：不依赖 React，纯函数方便单测。
// 题库答案采用固定的章节标记格式，例如：
//   【结论】
//   一句话直接回答。
//   【要点】
//   1) ... 2) ...
//   【延伸】
//   ...
// 本模块把纯文本按「【...】」章节标记切分为段落，供 UI 分段渲染。

interface AnswerSection {
  /** 章节标题，不含方括号，如「结论」「要点」；无标题的前置内容为空字符串 */
  heading: string;
  /** 该章节下的正文（保留换行，由 UI 用 pre-wrap 渲染） */
  body: string;
}

/** 匹配形如「【结论】」的整行章节标记（行首尾为全角方括号） */
const HEADING_RE = /^【(.+?)】\s*$/;

function trimTrailingBlankLines(text: string): string {
  return text.replace(/\n+$/, '');
}

/**
 * 把结构化答案文本解析为章节数组。
 * 以「【...】」开头的行视为章节标题，其后的内容（直到下一个标题）为该章节正文。
 * - 有章节标记时：标题之前的内容作为标题为空字符串的首个章节（通常不存在）。
 * - 无任何章节标记时：整体作为单个「答案」章节返回。
 */
export function parseAnswerSections(answer: string): AnswerSection[] {
  const lines = answer.replace(/\r\n/g, '\n').split('\n');

  const sections: AnswerSection[] = [];
  let current: AnswerSection | null = null;
  let preamble = '';
  let hasHeading = false;

  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      hasHeading = true;
      if (current) {
        sections.push({ heading: current.heading, body: trimTrailingBlankLines(current.body) });
      }
      current = { heading: match[1], body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    } else {
      preamble += (preamble ? '\n' : '') + line;
    }
  }

  if (current) {
    sections.push({ heading: current.heading, body: trimTrailingBlankLines(current.body) });
  }

  // 标题之前若有内容，作为空标题章节插入到最前（保证内容不丢失）
  if (hasHeading && preamble.trim() !== '') {
    sections.unshift({ heading: '', body: trimTrailingBlankLines(preamble) });
  }

  // 无任何章节标记时整体作为「答案」章节
  if (sections.length === 0) {
    const body = trimTrailingBlankLines(answer.replace(/\r\n/g, '\n'));
    if (body.trim() !== '') {
      sections.push({ heading: '答案', body });
    }
  }

  return sections.map((s) => ({ heading: s.heading, body: s.body.replace(/^\n+/, '') }));
}
