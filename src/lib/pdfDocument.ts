import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { parseAnswerSections } from './answerFormat';
import { parseReferenceSources } from './sourceLinks';
import type { InterviewExperience, InterviewExperienceQuestion } from './types';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2;
const FOOTER_HEIGHT = 42;

const COLOR = {
  ink: rgb(0.055, 0.13, 0.12),
  muted: rgb(0.37, 0.45, 0.43),
  primary: rgb(0.02, 0.43, 0.37),
  primaryDark: rgb(0.015, 0.29, 0.26),
  primarySoft: rgb(0.92, 0.97, 0.96),
  border: rgb(0.82, 0.88, 0.87),
  surface: rgb(0.965, 0.98, 0.978),
  code: rgb(0.075, 0.105, 0.105),
  codeText: rgb(0.89, 0.94, 0.93),
};

const DIFFICULTY_LABEL: Record<number, string> = {
  1: '简单',
  2: '中等',
  3: '困难',
};

export interface PdfBuildOptions {
  generatedAt?: Date;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function createSanitizer(font: PDFFont): (value: string) => string {
  const supportedCodePoints = new Set(font.getCharacterSet());
  const replacement = supportedCodePoints.has('□'.codePointAt(0) ?? 0) ? '□' : '?';

  return (value: string) => Array.from(value.replace(/\r\n?/g, '\n').normalize('NFKC'))
    .map((character) => {
      if (character === '\n') return character;
      if (character === '\t') return '    ';
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && supportedCodePoints.has(codePoint) ? character : replacement;
    })
    .join('');
}

function wrapText(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const wrapped: string[] = [];

  for (const sourceLine of text.split('\n')) {
    if (!sourceLine) {
      wrapped.push('');
      continue;
    }

    let line = '';
    for (const character of Array.from(sourceLine)) {
      const candidate = `${line}${character}`;
      if (!line || font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      wrapped.push(line);
      line = character;
    }
    if (line) wrapped.push(line);
  }

  return wrapped;
}

function truncate(value: string, limit: number): string {
  const characters = Array.from(value.trim());
  return characters.length <= limit ? characters.join('') : `${characters.slice(0, limit).join('')}…`;
}

export async function buildExperiencePdf(
  experience: InterviewExperience,
  questions: InterviewExperienceQuestion[],
  fontBytes: Uint8Array,
  options: PdfBuildOptions = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const sanitize = createSanitizer(font);
  const generatedAt = options.generatedAt ?? new Date();

  pdf.setTitle(sanitize(`${experience.title} - 面经题单`));
  pdf.setAuthor('Mianshi');
  pdf.setCreator('Mianshi');
  pdf.setProducer('Mianshi 本地 PDF 导出');
  pdf.setSubject(sanitize(`共 ${questions.length} 道面试题`));
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  const pages: PDFPage[] = [];
  let page: PDFPage;
  let cursorY = 0;

  function addPage(kind: 'cover' | 'content'): PDFPage {
    const nextPage = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    pages.push(nextPage);
    if (kind === 'content') {
      nextPage.drawText(sanitize('MIANSHI  ·  面经复习题单'), {
        x: PAGE_MARGIN,
        y: A4_HEIGHT - 39,
        size: 8.5,
        font,
        color: COLOR.primary,
      });
      nextPage.drawLine({
        start: { x: PAGE_MARGIN, y: A4_HEIGHT - 50 },
        end: { x: A4_WIDTH - PAGE_MARGIN, y: A4_HEIGHT - 50 },
        thickness: 0.8,
        color: COLOR.border,
      });
      cursorY = A4_HEIGHT - 72;
    }
    page = nextPage;
    return nextPage;
  }

  function ensureSpace(height: number) {
    if (cursorY - height >= FOOTER_HEIGHT) return;
    addPage('content');
  }

  function drawParagraph(
    value: string,
    config: {
      x?: number;
      width?: number;
      size?: number;
      lineHeight?: number;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
    } = {},
  ) {
    const x = config.x ?? PAGE_MARGIN;
    const size = config.size ?? 10.5;
    const lineHeight = config.lineHeight ?? 17;
    const width = config.width ?? CONTENT_WIDTH;
    const lines = wrapText(font, sanitize(value), size, width);
    ensureSpace(Math.min(2, Math.max(1, lines.length)) * lineHeight);

    for (const line of lines) {
      ensureSpace(lineHeight);
      if (line) {
        page.drawText(line, {
          x,
          y: cursorY - size,
          size,
          font,
          color: config.color ?? COLOR.ink,
        });
      }
      cursorY -= line ? lineHeight : lineHeight * 0.55;
    }
    cursorY -= config.gapAfter ?? 5;
  }

  function drawSectionHeading(value: string, followingHeight = 0) {
    ensureSpace(28 + followingHeight);
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: cursorY - 15,
      width: 3,
      height: 14,
      color: COLOR.primary,
    });
    page.drawText(sanitize(value), {
      x: PAGE_MARGIN + 10,
      y: cursorY - 14,
      size: 11,
      font,
      color: COLOR.primaryDark,
    });
    cursorY -= 25;
  }

  function drawQuestionHeader(question: InterviewExperienceQuestion, index: number) {
    const title = sanitize(truncate(question.title, 240));
    const titleLines = wrapText(font, title, 15, CONTENT_WIDTH - 46);
    const headerHeight = Math.max(58, titleLines.length * 21 + 34);
    // Keep a question title together with the opening answer section.
    ensureSpace(headerHeight + 80);

    page.drawCircle({
      x: PAGE_MARGIN + 16,
      y: cursorY - 16,
      size: 16,
      color: COLOR.primarySoft,
      borderColor: COLOR.border,
      borderWidth: 0.8,
    });
    const number = String(index + 1).padStart(2, '0');
    const numberWidth = font.widthOfTextAtSize(number, 9);
    page.drawText(number, {
      x: PAGE_MARGIN + 16 - numberWidth / 2,
      y: cursorY - 19,
      size: 9,
      font,
      color: COLOR.primary,
    });

    let titleY = cursorY;
    for (const line of titleLines) {
      page.drawText(line, {
        x: PAGE_MARGIN + 46,
        y: titleY - 15,
        size: 15,
        font,
        color: COLOR.ink,
      });
      titleY -= 21;
    }

    const tags = question.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 5);
    const meta = [
      `难度：${DIFFICULTY_LABEL[question.difficulty] ?? '未知'}`,
      tags.length ? `标签：${tags.join(' · ')}` : '',
    ].filter(Boolean).join('    ');
    page.drawText(sanitize(meta), {
      x: PAGE_MARGIN + 46,
      y: titleY - 9,
      size: 8.5,
      font,
      color: COLOR.muted,
    });

    cursorY -= headerHeight;
    page.drawLine({
      start: { x: PAGE_MARGIN, y: cursorY },
      end: { x: A4_WIDTH - PAGE_MARGIN, y: cursorY },
      thickness: 0.7,
      color: COLOR.border,
    });
    cursorY -= 18;
  }

  function drawCodeBlock(code: string, language: string) {
    drawSectionHeading(`代码 · ${language || 'text'}`, 42);
    const codeLines = sanitize(code).split('\n').flatMap((line) => (
      wrapText(font, line || ' ', 8.3, CONTENT_WIDTH - 24)
    ));
    const lineHeight = 13;
    let offset = 0;

    while (offset < codeLines.length) {
      ensureSpace(42);
      const availableHeight = cursorY - FOOTER_HEIGHT;
      const maxLines = Math.max(1, Math.floor((availableHeight - 18) / lineHeight));
      const blockLines = codeLines.slice(offset, offset + maxLines);
      const height = blockLines.length * lineHeight + 18;

      page.drawRectangle({
        x: PAGE_MARGIN,
        y: cursorY - height,
        width: CONTENT_WIDTH,
        height,
        color: COLOR.code,
      });
      let lineY = cursorY - 13;
      for (const line of blockLines) {
        page.drawText(line || ' ', {
          x: PAGE_MARGIN + 12,
          y: lineY,
          size: 8.3,
          font,
          color: COLOR.codeText,
        });
        lineY -= lineHeight;
      }
      cursorY -= height + 10;
      offset += blockLines.length;
      if (offset < codeLines.length) addPage('content');
    }
  }

  function drawSources(question: InterviewExperienceQuestion) {
    const sources = parseReferenceSources(question.sources_json);
    if (!sources.length) return;
    drawSectionHeading('参考资料', 36);
    sources.forEach((source, sourceIndex) => {
      drawParagraph(`${sourceIndex + 1}. ${source.title}`, {
        size: 9.3,
        lineHeight: 14.5,
        color: COLOR.primaryDark,
        gapAfter: 1,
      });
      drawParagraph(source.url, {
        x: PAGE_MARGIN + 13,
        width: CONTENT_WIDTH - 13,
        size: 7.5,
        lineHeight: 11.5,
        color: COLOR.muted,
        gapAfter: 7,
      });
    });
  }

  const cover = addPage('cover');
  cover.drawRectangle({ x: 0, y: A4_HEIGHT - 12, width: A4_WIDTH, height: 12, color: COLOR.primary });
  cover.drawCircle({ x: PAGE_MARGIN + 18, y: A4_HEIGHT - 86, size: 18, color: COLOR.primarySoft });
  cover.drawText(sanitize('M'), {
    x: PAGE_MARGIN + 11.5,
    y: A4_HEIGHT - 93,
    size: 18,
    font,
    color: COLOR.primary,
  });
  cover.drawText(sanitize('MIANSHI · 本地复习资料'), {
    x: PAGE_MARGIN + 48,
    y: A4_HEIGHT - 90,
    size: 9.5,
    font,
    color: COLOR.primary,
  });

  let coverY = A4_HEIGHT - 145;
  cover.drawText(sanitize('面经复习题单'), {
    x: PAGE_MARGIN,
    y: coverY,
    size: 12,
    font,
    color: COLOR.muted,
  });
  coverY -= 36;
  const coverTitleLines = wrapText(font, sanitize(truncate(experience.title, 260)), 25, CONTENT_WIDTH);
  for (const line of coverTitleLines) {
    cover.drawText(line, {
      x: PAGE_MARGIN,
      y: coverY,
      size: 25,
      font,
      color: COLOR.ink,
    });
    coverY -= 36;
  }

  coverY -= 18;
  const summary = sanitize(experience.summary || '这篇面经暂未填写摘要。');
  const summaryLines = wrapText(font, summary, 10.5, CONTENT_WIDTH - 32);
  const summaryHeight = Math.max(74, summaryLines.length * 18 + 34);
  cover.drawRectangle({
    x: PAGE_MARGIN,
    y: coverY - summaryHeight,
    width: CONTENT_WIDTH,
    height: summaryHeight,
    color: COLOR.primarySoft,
    borderColor: COLOR.border,
    borderWidth: 0.8,
  });
  let summaryY = coverY - 24;
  for (const line of summaryLines) {
    cover.drawText(line, {
      x: PAGE_MARGIN + 16,
      y: summaryY,
      size: 10.5,
      font,
      color: COLOR.ink,
    });
    summaryY -= 18;
  }
  coverY -= summaryHeight + 36;

  const metadata = [
    `题目数量  ${questions.length} 道`,
    `生成模型  ${experience.model_name || '未记录'}`,
    `创建日期  ${formatDate(experience.created_at)}`,
  ];
  metadata.forEach((item, index) => {
    cover.drawText(sanitize(item), {
      x: PAGE_MARGIN,
      y: coverY - index * 25,
      size: 9.5,
      font,
      color: index === 0 ? COLOR.primaryDark : COLOR.muted,
    });
  });

  cover.drawLine({
    start: { x: PAGE_MARGIN, y: 83 },
    end: { x: A4_WIDTH - PAGE_MARGIN, y: 83 },
    thickness: 0.8,
    color: COLOR.border,
  });
  cover.drawText(sanitize('内容仅在当前设备生成 · 请妥善保管导出的文件'), {
    x: PAGE_MARGIN,
    y: 61,
    size: 8.5,
    font,
    color: COLOR.muted,
  });

  if (questions.length > 0) {
    addPage('content');
    questions.forEach((question, index) => {
      drawQuestionHeader(question, index);

      const sections = parseAnswerSections(question.answer);
      if (!sections.length) {
        drawSectionHeading('答案');
        drawParagraph('暂未生成答案。', { color: COLOR.muted, gapAfter: 12 });
      } else {
        sections.forEach((section) => {
          if (section.heading) {
            const openingLines = wrapText(font, sanitize(section.body), 10.5, CONTENT_WIDTH).length;
            drawSectionHeading(section.heading, Math.min(2, Math.max(1, openingLines)) * 17);
          }
          drawParagraph(section.body, { gapAfter: 10 });
        });
      }

      if (question.code.trim()) drawCodeBlock(question.code, question.code_language);
      drawSources(question);
      cursorY -= 16;
    });
  }

  pages.forEach((currentPage, index) => {
    const footer = sanitize(`第 ${index + 1} / ${pages.length} 页`);
    currentPage.drawText(footer, {
      x: A4_WIDTH - PAGE_MARGIN - font.widthOfTextAtSize(footer, 8),
      y: 22,
      size: 8,
      font,
      color: COLOR.muted,
    });
  });

  return pdf.save();
}
