import { describe, it, expect } from 'vitest';
import { parseAnswerSections } from '../answerFormat';

describe('parseAnswerSections', () => {
  it('把多个章节切分为标题和正文', () => {
    const answer = '【结论】\n一句话。\n【要点】\n1) 第一点\n2) 第二点';
    expect(parseAnswerSections(answer)).toEqual([
      { heading: '结论', body: '一句话。' },
      { heading: '要点', body: '1) 第一点\n2) 第二点' },
    ]);
  });

  it('正文保留内部换行', () => {
    const answer = '【结论】\n第一行\n第二行';
    expect(parseAnswerSections(answer)).toEqual([
      { heading: '结论', body: '第一行\n第二行' },
    ]);
  });

  it('无章节标记时整体作为「答案」章节返回', () => {
    expect(parseAnswerSections('这是一段普通答案')).toEqual([
      { heading: '答案', body: '这是一段普通答案' },
    ]);
  });

  it('空字符串返回空数组', () => {
    expect(parseAnswerSections('')).toEqual([]);
    expect(parseAnswerSections('   ')).toEqual([]);
  });

  it('标题之前的内容不会丢失，作为空标题章节', () => {
    const answer = '开头说明\n【结论】\n正文';
    expect(parseAnswerSections(answer)).toEqual([
      { heading: '', body: '开头说明' },
      { heading: '结论', body: '正文' },
    ]);
  });
});
