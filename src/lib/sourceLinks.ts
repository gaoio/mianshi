import { invoke, isTauri } from '@tauri-apps/api/core';
import trustedSourceHosts from './trustedSourceHosts.json';
import type { ReferenceSource } from './types';

const TRUSTED_SOURCE_HOSTS = new Set<string>(trustedSourceHosts);
const TRUSTED_GITHUB_PATHS = ['/pgvector/pgvector', '/standard-webhooks/standard-webhooks'];

function isTrustedSourceUrl(url: URL): boolean {
  if (!TRUSTED_SOURCE_HOSTS.has(url.hostname)) return false;
  if (url.hostname !== 'github.com') return true;
  return TRUSTED_GITHUB_PATHS.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
  );
}

function normalizeTrustedSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      !isTrustedSourceUrl(url) ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Parse the persisted JSON defensively. Only HTTPS links are rendered so a
 * malformed or tampered local storage cannot expose executable URL schemes.
 */
/** Parse title/URL pairs generated for interview answers without trusting local storage. */
export function parseReferenceSources(value: string): ReferenceSource[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value || '[]');
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const sources: ReferenceSource[] = [];
  const urls = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const url = typeof candidate.url === 'string'
      ? normalizeTrustedSourceUrl(candidate.url)
      : null;
    if (!title || title.length > 180 || !url || urls.has(url)) continue;
    urls.add(url);
    sources.push({ title, url });
  }
  return sources;
}

export function supportsInAppSourceViewer(): boolean {
  return isTauri();
}

export function openSourceInApp(url: string): Promise<void> {
  return invoke('open_source_window', { url });
}
