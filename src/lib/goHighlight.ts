// 轻量 Go 代码语法高亮：不引入第三方高亮库，仅针对 Go 词法做简单着色。
// 返回按顺序切分好的 token 列表，由组件渲染为 <span>。

interface Token {
  text: string;
  type: 'keyword' | 'string' | 'comment' | 'number' | 'builtin' | 'plain';
}

const KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var',
]);

const BUILTINS = new Set([
  'nil', 'true', 'false', 'append', 'make', 'len', 'cap', 'new', 'copy',
  'delete', 'panic', 'recover', 'close', 'print', 'println', 'iota',
]);

/** 对单行 Go 代码做词法切分（逐字符扫描，优先匹配注释、字符串、标识符、数字） */
function tokenizeGoLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;

  function push(text: string, type: Token['type']) {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      tokens.push({ text, type });
    }
  }

  while (i < n) {
    const ch = line[i];

    // 行注释
    if (ch === '/' && line[i + 1] === '/') {
      push(line.slice(i), 'comment');
      break;
    }

    // 字符串字面量（双引号、反引号、单引号 rune）
    if (ch === '"' || ch === '`' || ch === "'") {
      let j = i + 1;
      while (j < n && line[j] !== ch) {
        if (ch !== '`' && line[j] === '\\') j++; // 跳过转义字符
        j++;
      }
      if (j < n) j++;
      push(line.slice(i, j), 'string');
      i = j;
      continue;
    }

    // 数字字面量
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObB_.]/.test(line[j])) j++;
      push(line.slice(i, j), 'number');
      i = j;
      continue;
    }

    // 标识符 / 关键字
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        push(word, 'keyword');
      } else if (BUILTINS.has(word)) {
        push(word, 'builtin');
      } else {
        push(word, 'plain');
      }
      i = j;
      continue;
    }

    // 其他字符（符号、空格等）
    push(ch, 'plain');
    i++;
  }

  return tokens;
}

/** 高亮整段代码（按行切分） */
export function tokenizeGo(code: string): Token[][] {
  return code.split('\n').map((line) => tokenizeGoLine(line));
}
