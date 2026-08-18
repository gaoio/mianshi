import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configureTauriUpdater, normalizeUpdaterPublicKey } from './updater-key.mjs';

const decodedKey = [
  'untrusted comment: minisign public key: 0123456789ABCDEF',
  Buffer.alloc(42, 7).toString('base64'),
  '',
].join('\n');
const encodedKey = Buffer.from(decodedKey).toString('base64');
const temporaryDirectories = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('normalizeUpdaterPublicKey', () => {
  it('accepts and canonicalizes a complete minisign public key', () => {
    const wrapped = `${encodedKey.slice(0, 40)}\n${encodedKey.slice(40)}`;
    expect(normalizeUpdaterPublicKey(wrapped)).toBe(encodedKey);
  });

  it('rejects a key without the minisign comment line', () => {
    const bodyOnly = Buffer.from(`${Buffer.alloc(42, 7).toString('base64')}\n`).toString('base64');
    expect(() => normalizeUpdaterPublicKey(bodyOnly)).toThrow('缺少 minisign comment 行');
  });

  it('rejects malformed key material', () => {
    const malformed = Buffer.from(
      'untrusted comment: minisign public key: 0123456789ABCDEF\nYWJj\n',
    ).toString('base64');
    expect(() => normalizeUpdaterPublicKey(malformed)).toThrow('主体长度无效');
  });
});

describe('configureTauriUpdater', () => {
  it('injects the validated key into tauri.conf.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'mianshi-updater-config-'));
    temporaryDirectories.push(root);
    const configPath = join(root, 'tauri.conf.json');
    writeFileSync(configPath, '{"plugins":{"updater":{"pubkey":""}}}\n');

    configureTauriUpdater(configPath, encodedKey);

    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.plugins.updater.pubkey).toBe(encodedKey);
  });
});
