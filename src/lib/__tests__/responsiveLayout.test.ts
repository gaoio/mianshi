import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8');

describe('responsive layout guardrails', () => {
  it('keeps the desktop content row bounded and independently scrollable', () => {
    expect(appCss).toMatch(/\.app-shell\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s);
    expect(appCss).toMatch(/\.page\s*\{[^}]*min-height:\s*0[^}]*container:\s*app-page\s*\/\s*inline-size/s);
  });

  it('uses page width rather than viewport width for sidebar layouts', () => {
    expect(appCss).toContain('@container app-page (min-width: 820px)');
    expect(appCss).toContain('@container app-page (min-width: 900px)');
    expect(appCss).toContain('@container app-page (min-width: 1100px)');
  });

  it('preserves an A4-sized resume and scales it as one unit', () => {
    expect(appCss).toMatch(/\.resume-preview-scaler\s*\{[^}]*transform:\s*scale\(var\(--resume-preview-scale\)\)/s);
    expect(appCss).toMatch(/\.resume-sheet\s*\{[^}]*width:\s*794px[^}]*min-height:\s*1123px/s);
  });

  it('provides coarse-pointer touch targets and long-content wrapping', () => {
    expect(appCss).toContain('@media (pointer: coarse)');
    expect(appCss).toMatch(/@media \(pointer: coarse\)[\s\S]*?button\s*\{[^}]*min-height:\s*48px/);
    expect(appCss).toContain('overflow-wrap: anywhere');
  });
});
