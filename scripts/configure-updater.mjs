import { fileURLToPath } from 'node:url';
import { configureTauriUpdater } from './updater-key.mjs';

const configPath = fileURLToPath(new URL('../src-tauri/tauri.conf.json', import.meta.url));
const requiredEnvironment = [
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'MIANSHI_UPDATER_PUBKEY',
];

try {
  const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`缺少构建环境变量：${missing.join(', ')}`);
  }
  configureTauriUpdater(configPath, process.env.MIANSHI_UPDATER_PUBKEY);
  console.log('Updater 公钥已验证并写入 Tauri 构建配置');
} catch (error) {
  console.error(`Updater 配置失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
