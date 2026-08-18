import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import type { GeneratedResume, ResumeTemplate } from './types';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const FOOTER_HEIGHT = 34;

interface ResumePdfBuildOptions {
  generatedAt?: Date;
}

interface TemplateStyle {
  accent: ReturnType<typeof rgb>;
  accentDark: ReturnType<typeof rgb>;
  accentSoft: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  border: ReturnType<typeof rgb>;
  marginLeft: number;
  marginRight: number;
  bodySize: number;
  lineHeight: number;
  sectionGap: number;
}

const TEMPLATE_STYLES: Record<ResumeTemplate, TemplateStyle> = {
  classic: {
    accent: rgb(0.08, 0.31, 0.28),
    accentDark: rgb(0.055, 0.22, 0.2),
    accentSoft: rgb(0.91, 0.96, 0.95),
    ink: rgb(0.075, 0.13, 0.12),
    muted: rgb(0.34, 0.42, 0.4),
    border: rgb(0.82, 0.87, 0.86),
    marginLeft: 48,
    marginRight: 48,
    bodySize: 9.2,
    lineHeight: 14,
    sectionGap: 8,
  },
  modern: {
    accent: rgb(0.05, 0.36, 0.32),
    accentDark: rgb(0.03, 0.25, 0.22),
    accentSoft: rgb(0.9, 0.96, 0.94),
    ink: rgb(0.07, 0.13, 0.12),
    muted: rgb(0.34, 0.42, 0.4),
    border: rgb(0.8, 0.87, 0.85),
    marginLeft: 46,
    marginRight: 46,
    bodySize: 9.2,
    lineHeight: 14,
    sectionGap: 8,
  },
  minimal: {
    accent: rgb(0.63, 0.42, 0.21),
    accentDark: rgb(0.43, 0.28, 0.14),
    accentSoft: rgb(0.97, 0.94, 0.9),
    ink: rgb(0.1, 0.12, 0.115),
    muted: rgb(0.38, 0.4, 0.38),
    border: rgb(0.88, 0.84, 0.79),
    marginLeft: 58,
    marginRight: 42,
    bodySize: 9.2,
    lineHeight: 13.8,
    sectionGap: 8,
  },
};

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
      } else {
        wrapped.push(line);
        line = character;
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped;
}

function dateRange(startDate: string, endDate: string): string {
  return [startDate, endDate].map((value) => value.trim()).filter(Boolean).join(' - ');
}

function templateLabel(template: ResumeTemplate): string {
  if (template === 'modern') return '现代模板';
  if (template === 'minimal') return '极简模板';
  return '经典模板';
}

export async function buildResumePdf(
  resume: GeneratedResume,
  template: ResumeTemplate,
  fontBytes: Uint8Array,
  options: ResumePdfBuildOptions = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const sanitize = createSanitizer(font);
  const style = TEMPLATE_STYLES[template];
  const generatedAt = options.generatedAt ?? new Date();
  const contentWidth = A4_WIDTH - style.marginLeft - style.marginRight;

  pdf.setTitle(sanitize(`${resume.personal.name} - 个人简历`));
  pdf.setAuthor(sanitize(resume.personal.name));
  pdf.setCreator('Mianshi 简历生成器');
  pdf.setProducer('Mianshi 本地 PDF 导出');
  pdf.setSubject(sanitize(`${resume.personal.headline} · ${templateLabel(template)}`));
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  const pages: PDFPage[] = [];
  let page: PDFPage;
  let cursorY = 0;

  function addPage(first = false): PDFPage {
    page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    pages.push(page);
    if (template === 'minimal') {
      page.drawRectangle({ x: 0, y: 0, width: 9, height: A4_HEIGHT, color: style.accent });
    }
    if (first) {
      cursorY = drawIdentityHeader(page);
    } else {
      const label = sanitize(`${resume.personal.name}  /  ${resume.personal.headline}`);
      page.drawText(label, {
        x: style.marginLeft,
        y: A4_HEIGHT - 35,
        size: 8.3,
        font,
        color: style.accentDark,
      });
      page.drawLine({
        start: { x: style.marginLeft, y: A4_HEIGHT - 45 },
        end: { x: A4_WIDTH - style.marginRight, y: A4_HEIGHT - 45 },
        thickness: 0.65,
        color: style.border,
      });
      cursorY = A4_HEIGHT - 67;
    }
    return page;
  }

  function drawIdentityHeader(target: PDFPage): number {
    const personal = resume.personal;
    const contacts = [personal.phone, personal.email, personal.location, personal.website]
      .map((value) => value.trim())
      .filter(Boolean);
    const contactText = sanitize(contacts.join('  |  '));

    if (template === 'modern') {
      const headerHeight = 142;
      target.drawRectangle({
        x: 0,
        y: A4_HEIGHT - headerHeight,
        width: A4_WIDTH,
        height: headerHeight,
        color: style.accent,
      });
      target.drawText(sanitize('RESUME'), {
        x: style.marginLeft,
        y: A4_HEIGHT - 38,
        size: 8,
        font,
        color: rgb(0.72, 0.88, 0.84),
      });
      target.drawText(sanitize(personal.name), {
        x: style.marginLeft,
        y: A4_HEIGHT - 75,
        size: 25,
        font,
        color: rgb(1, 1, 1),
      });
      target.drawText(sanitize(personal.headline), {
        x: style.marginLeft,
        y: A4_HEIGHT - 99,
        size: 11.5,
        font,
        color: rgb(0.83, 0.93, 0.91),
      });
      if (contactText) {
        const lines = wrapText(font, contactText, 8.3, contentWidth);
        lines.slice(0, 2).forEach((line, index) => {
          target.drawText(line, {
            x: style.marginLeft,
            y: A4_HEIGHT - 121 - index * 12,
            size: 8.3,
            font,
            color: rgb(0.83, 0.93, 0.91),
          });
        });
      }
      return A4_HEIGHT - headerHeight - 14;
    }

    const centered = template === 'classic';
    const name = sanitize(personal.name);
    const headline = sanitize(personal.headline);
    const nameSize = template === 'minimal' ? 23 : 25;
    const nameX = centered
      ? (A4_WIDTH - font.widthOfTextAtSize(name, nameSize)) / 2
      : style.marginLeft;
    target.drawText(sanitize('RESUME'), {
      x: centered ? (A4_WIDTH - font.widthOfTextAtSize('RESUME', 8)) / 2 : style.marginLeft,
      y: A4_HEIGHT - 42,
      size: 8,
      font,
      color: style.accent,
    });
    target.drawText(name, {
      x: nameX,
      y: A4_HEIGHT - 76,
      size: nameSize,
      font,
      color: style.ink,
    });
    target.drawText(headline, {
      x: centered ? (A4_WIDTH - font.widthOfTextAtSize(headline, 11)) / 2 : style.marginLeft,
      y: A4_HEIGHT - 99,
      size: 11,
      font,
      color: style.accentDark,
    });
    if (contactText) {
      const lines = wrapText(font, contactText, 8.2, contentWidth);
      lines.slice(0, 2).forEach((line, index) => {
        const x = centered ? (A4_WIDTH - font.widthOfTextAtSize(line, 8.2)) / 2 : style.marginLeft;
        target.drawText(line, {
          x,
          y: A4_HEIGHT - 120 - index * 12,
          size: 8.2,
          font,
          color: style.muted,
        });
      });
    }
    const ruleY = A4_HEIGHT - (contactText ? 141 : 122);
    target.drawLine({
      start: { x: style.marginLeft, y: ruleY },
      end: { x: A4_WIDTH - style.marginRight, y: ruleY },
      thickness: template === 'classic' ? 1.3 : 0.8,
      color: style.accent,
    });
    return ruleY - 12;
  }

  function ensureSpace(height: number) {
    if (cursorY - height >= FOOTER_HEIGHT) return;
    addPage(false);
  }

  function drawLines(
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
    const x = config.x ?? style.marginLeft;
    const size = config.size ?? style.bodySize;
    const lineHeight = config.lineHeight ?? style.lineHeight;
    const width = config.width ?? contentWidth;
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
          color: config.color ?? style.ink,
        });
      }
      cursorY -= line ? lineHeight : lineHeight * 0.55;
    }
    cursorY -= config.gapAfter ?? 4;
  }

  function drawSectionHeading(title: string) {
    // Keep the section title with the first entry instead of orphaning it at a page bottom.
    ensureSpace(80);
    if (template === 'modern') {
      const titleText = sanitize(title);
      const width = font.widthOfTextAtSize(titleText, 11) + 20;
      page.drawRectangle({
        x: style.marginLeft,
        y: cursorY - 18,
        width,
        height: 22,
        color: style.accentSoft,
      });
      page.drawText(titleText, {
        x: style.marginLeft + 10,
        y: cursorY - 13,
        size: 11,
        font,
        color: style.accentDark,
      });
    } else {
      page.drawText(sanitize(title), {
        x: style.marginLeft,
        y: cursorY - 13,
        size: 11,
        font,
        color: style.accentDark,
      });
      page.drawLine({
        start: { x: style.marginLeft + 72, y: cursorY - 9 },
        end: { x: A4_WIDTH - style.marginRight, y: cursorY - 9 },
        thickness: 0.7,
        color: style.border,
      });
    }
    cursorY -= 26;
  }

  function drawEntryHeading(primary: string, secondary: string, dates: string) {
    ensureSpace(45 + style.lineHeight);
    const dateText = sanitize(dates);
    const dateWidth = dateText ? font.widthOfTextAtSize(dateText, 8.3) : 0;
    const headingWidth = Math.max(170, contentWidth - dateWidth - 18);
    const primaryLines = wrapText(font, sanitize(primary), 10.5, headingWidth);
    for (const line of primaryLines) {
      page.drawText(line, {
        x: style.marginLeft,
        y: cursorY - 10.5,
        size: 10.5,
        font,
        color: style.ink,
      });
      cursorY -= 14.5;
    }
    if (dateText) {
      page.drawText(dateText, {
        x: A4_WIDTH - style.marginRight - dateWidth,
        y: cursorY + (primaryLines.length - 1) * 14.5 + 2,
        size: 8.3,
        font,
        color: style.muted,
      });
    }
    if (secondary.trim()) {
      drawLines(secondary, { size: 8.8, lineHeight: 13, color: style.accentDark, gapAfter: 3 });
    } else {
      cursorY -= 2;
    }
  }

  function drawBullets(items: string[]) {
    for (const item of items.map((value) => value.trim()).filter(Boolean)) {
      const bulletX = style.marginLeft + 2;
      const textX = style.marginLeft + 13;
      const width = contentWidth - 13;
      const lines = wrapText(font, sanitize(item), style.bodySize, width);
      ensureSpace(Math.min(2, Math.max(1, lines.length)) * style.lineHeight);
      page.drawText('-', {
        x: bulletX,
        y: cursorY - style.bodySize,
        size: style.bodySize,
        font,
        color: style.accent,
      });
      for (const line of lines) {
        ensureSpace(style.lineHeight);
        page.drawText(line, {
          x: textX,
          y: cursorY - style.bodySize,
          size: style.bodySize,
          font,
          color: style.ink,
        });
        cursorY -= style.lineHeight;
      }
      cursorY -= 2;
    }
  }

  function finishEntry() {
    cursorY -= style.sectionGap;
  }

  addPage(true);

  drawSectionHeading('个人优势');
  drawLines(resume.summary, { gapAfter: style.sectionGap });

  drawSectionHeading('专业技能');
  for (const group of resume.skills) {
    const text = `${group.category}：${group.items.filter(Boolean).join(' · ')}`;
    drawLines(text, { gapAfter: 3 });
  }
  cursorY -= style.sectionGap - 3;

  if (resume.experience.length > 0) {
    drawSectionHeading('工作经历');
    for (const entry of resume.experience) {
      drawEntryHeading(entry.role, entry.company, dateRange(entry.startDate, entry.endDate));
      drawBullets(entry.highlights);
      finishEntry();
    }
  }

  if (resume.projects.length > 0) {
    drawSectionHeading('项目经历');
    for (const project of resume.projects) {
      drawEntryHeading(project.name, project.role, dateRange(project.startDate, project.endDate));
      drawLines(project.summary, { gapAfter: 4 });
      drawBullets(project.highlights);
      if (project.technologies.length > 0) {
        drawLines(`技术栈：${project.technologies.join(' · ')}`, {
          size: 8.7,
          lineHeight: 13,
          color: style.muted,
          gapAfter: 2,
        });
      }
      finishEntry();
    }
  }

  if (resume.education.length > 0) {
    drawSectionHeading('教育经历');
    for (const education of resume.education) {
      const secondary = [education.degree, education.major].filter(Boolean).join(' · ');
      drawEntryHeading(
        education.school,
        secondary,
        dateRange(education.startDate, education.endDate),
      );
      drawBullets(education.highlights);
      finishEntry();
    }
  }

  pages.forEach((currentPage, index) => {
    const pageNumber = sanitize(`${index + 1} / ${pages.length}`);
    currentPage.drawText(pageNumber, {
      x: A4_WIDTH - style.marginRight - font.widthOfTextAtSize(pageNumber, 7.8),
      y: 19,
      size: 7.8,
      font,
      color: style.muted,
    });
    currentPage.drawText(sanitize('由 Mianshi 简历生成器创建'), {
      x: style.marginLeft,
      y: 19,
      size: 7.2,
      font,
      color: style.muted,
    });
  });

  return pdf.save();
}
