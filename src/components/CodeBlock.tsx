import { tokenizeGo } from '../lib/goHighlight';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  c: 'C',
  config: 'Config',
  go: 'Go',
  http: 'HTTP',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  pseudocode: '伪代码',
  protobuf: 'Protocol Buffers',
  python: 'Python',
  shell: 'Shell',
  sql: 'SQL',
  text: '文本',
  yaml: 'YAML',
};

/** 按题目声明的语言展示代码；当前仅对 Go 做词法高亮，其他语言保持原文。 */
export function CodeBlock({ code, language = 'text' }: CodeBlockProps) {
  const normalizedLanguage = language.toLowerCase();
  const lines = normalizedLanguage === 'go'
    ? tokenizeGo(code)
    : code.split('\n').map((line) => [{ text: line, type: 'plain' as const }]);

  return (
    <div className="code-panel">
      <div className="code-panel-header">{LANGUAGE_LABELS[normalizedLanguage] ?? language}</div>
      <pre className="code-block">
        <code>
          {lines.map((tokens, lineIdx) => (
            <span key={lineIdx} className="code-line">
              {tokens.map((token, i) => (
                <span key={i} className={`tok-${token.type}`}>
                  {token.text}
                </span>
              ))}
              {lineIdx < lines.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
