import { isTauri } from '@tauri-apps/api/core';
import fontUrl from '../assets/fonts/NotoSansSC-Regular.subset.ttf?url';
import { buildExperiencePdf } from './pdfDocument';
import type { InterviewExperience, InterviewExperienceQuestion } from './types';

let fontBytesPromise: Promise<Uint8Array> | null = null;

function loadFontBytes(): Promise<Uint8Array> {
  if (!fontBytesPromise) {
    fontBytesPromise = fetch(fontUrl).then(async (response) => {
      if (!response.ok) throw new Error('PDF 中文字体加载失败');
      return new Uint8Array(await response.arrayBuffer());
    });
  }
  return fontBytesPromise;
}

export function createPdfFilename(title: string): string {
  const normalizedTitle = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  const safeTitle = Array.from(normalizedTitle).slice(0, 60).join('') || '面经';
  return `${safeTitle}-面经题单.pdf`;
}

function saveInBrowser(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportExperiencePdf(
  experience: InterviewExperience,
  questions: InterviewExperienceQuestion[],
): Promise<'saved' | 'cancelled'> {
  const fontBytes = await loadFontBytes();
  const bytes = await buildExperiencePdf(experience, questions, fontBytes);
  const filename = createPdfFilename(experience.title);

  if (isTauri()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    if (!path) return 'cancelled';
    await writeFile(path, bytes);
    return 'saved';
  }

  saveInBrowser(bytes, filename);
  return 'saved';
}
