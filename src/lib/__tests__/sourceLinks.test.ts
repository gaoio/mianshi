import { afterEach, describe, expect, it } from 'vitest';
import {
  parseReferenceSources,
  supportsInAppSourceViewer,
} from '../sourceLinks';

describe('source links', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'isTauri');
  });

  it('parses unique titled references and drops unsafe objects', () => {
    expect(parseReferenceSources(JSON.stringify([
      { title: 'Go Documentation', url: 'https://go.dev/doc/' },
      { title: '重复项', url: 'https://go.dev/doc/' },
      { title: '', url: 'https://redis.io/docs/latest/' },
      { title: '未知站点', url: 'https://example.com/docs' },
      'https://go.dev/doc/',
    ]))).toEqual([
      { title: 'Go Documentation', url: 'https://go.dev/doc/' },
    ]);
  });

  it('returns no references for malformed persisted metadata', () => {
    expect(parseReferenceSources('{')).toEqual([]);
    expect(parseReferenceSources(JSON.stringify({ title: 'not an array' }))).toEqual([]);
  });

  it('detects whether the app runtime can open an in-app source viewer', () => {
    expect(supportsInAppSourceViewer()).toBe(false);
    Object.defineProperty(globalThis, 'isTauri', { value: true, configurable: true });
    expect(supportsInAppSourceViewer()).toBe(true);
  });
});
