import { readFileSync, writeFileSync } from 'node:fs';

function decodeBase64(value, label) {
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error(`${label}不是有效的 Base64 内容`);
  }

  const decoded = Buffer.from(compact, 'base64');
  const canonicalInput = compact.replace(/=+$/, '');
  const canonicalOutput = decoded.toString('base64').replace(/=+$/, '');
  if (canonicalInput !== canonicalOutput) {
    throw new Error(`${label}不是有效的 Base64 内容`);
  }
  return decoded;
}

export function normalizeUpdaterPublicKey(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('更新签名公钥为空');
  }

  const decoded = decodeBase64(value.trim(), '更新签名公钥').toString('utf8');
  const lines = decoded.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (
    lines.length !== 2
    || !/^untrusted comment: minisign public key: [0-9A-F]{16}$/i.test(lines[0])
  ) {
    throw new Error('更新签名公钥缺少 minisign comment 行');
  }

  const keyBytes = decodeBase64(lines[1], 'minisign 公钥主体');
  if (keyBytes.length !== 42) {
    throw new Error('minisign 公钥主体长度无效');
  }

  return Buffer.from(`${lines[0]}\n${lines[1]}\n`, 'utf8').toString('base64');
}

export function configureTauriUpdater(configPath, publicKey) {
  const normalized = normalizeUpdaterPublicKey(publicKey);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.plugins ??= {};
  config.plugins.updater ??= {};
  config.plugins.updater.pubkey = normalized;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return normalized;
}
