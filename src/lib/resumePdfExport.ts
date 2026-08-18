import { isTauri } from '@tauri-apps/api/core';
import fontUrl from '../assets/fonts/NotoSansSC-Regular.subset.ttf?url';
import { buildResumePdf } from './resumePdfDocument';
import type { GeneratedResume, ResumeTemplate } from './types';

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

export function createResumePdfFilename(name: string): string {
  const normalizedName = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  const safeName = Array.from(normalizedName).slice(0, 50).join('') || '候选人';
  return `${safeName}-个人简历.pdf`;
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

export async function exportResumePdf(
  resume: GeneratedResume,
  template: ResumeTemplate,
): Promise<'saved' | 'cancelled'> {
  const fontBytes = await loadFontBytes();
  const bytes = await buildResumePdf(resume, template, fontBytes);
  const filename = createResumePdfFilename(resume.personal.name);

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
