import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src-tauri/tauri.conf.json',
];
const REQUIRED_SECRETS = [
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];
const REQUIRED_VARIABLES = ['TAURI_UPDATER_PUBKEY'];

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    encoding: 'utf8',
    stdio: options.capture
      ? ['ignore', 'pipe', 'pipe']
      : options.input !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: options.input,
    env: options.env ?? process.env,
  });
  if (result.error) fail(`${options.label ?? command} 无法执行：${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout).trim() : '';
    fail(`${options.label ?? command} 失败${detail ? `：${detail}` : ''}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function succeeds(command, args) {
  return spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
  }).status === 0;
}

function capture(command, args, label = command) {
  return run(command, args, { capture: true, label });
}

function readJson(path) {
  return JSON.parse(readFileSync(join(PROJECT_ROOT, path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(join(PROJECT_ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

function requireCommand(command, hint) {
  if (!succeeds(command, ['--version'])) fail(`缺少 ${command}。${hint}`);
}

function ensureGithubLogin() {
  if (!succeeds('gh', ['auth', 'status'])) {
    run('gh', ['auth', 'login'], { label: '登录 GitHub' });
  }
  run('gh', ['auth', 'status'], { label: '检查 GitHub 登录状态' });
}

function ensureGitIdentity() {
  if (!succeeds('git', ['config', '--get', 'user.name'])) {
    const login = capture('gh', ['api', 'user', '--jq', '.login'], '读取 GitHub 用户名');
    run('git', ['config', 'user.name', login], { label: '设置当前仓库 Git 用户名' });
  }
  if (!succeeds('git', ['config', '--get', 'user.email'])) {
    const login = capture('gh', ['api', 'user', '--jq', '.login'], '读取 GitHub 用户名');
    const id = capture('gh', ['api', 'user', '--jq', '.id'], '读取 GitHub 用户 ID');
    run('git', ['config', 'user.email', `${id}+${login}@users.noreply.github.com`], {
      label: '设置当前仓库 Git 邮箱',
    });
  }
}

function gitHasCommit() {
  return succeeds('git', ['rev-parse', '--verify', 'HEAD']);
}

function currentBranch() {
  return capture('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], '读取当前 Git 分支');
}

function repositorySlugFromOrigin() {
  const origin = capture('git', ['remote', 'get-url', 'origin'], '读取 origin');
  const match = origin.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) fail('origin 必须指向 GitHub 仓库');
  return `${match[1]}/${match[2]}`;
}

function assertCleanWorktree() {
  const status = capture('git', ['status', '--porcelain'], '检查工作区');
  if (status) fail('工作区存在未提交改动，请先提交或暂存后再发布');
}

function parseVersion(value, label = '版本号') {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value ?? '');
  if (!match) fail(`${label}必须是稳定语义版本，例如 0.2.0`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

async function readSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    fail('需要在交互式终端中运行初始化命令');
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('用户取消'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f') {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on('data', onData);
  });
}

async function readConfirmedSecret(label) {
  const first = await readSecret(`${label}：`);
  if (first.length < 8) fail(`${label}至少需要 8 个字符`);
  const second = await readSecret(`再次输入${label}：`);
  if (first !== second) fail(`${label}两次输入不一致`);
  return first;
}

function setGithubSecret(repo, name, value) {
  run('gh', ['secret', 'set', name, '--repo', repo], {
    input: value,
    label: `设置 GitHub Secret ${name}`,
  });
}

function setGithubVariable(repo, name, value) {
  run('gh', ['variable', 'set', name, '--repo', repo, '--body', value], {
    label: `设置 GitHub Variable ${name}`,
  });
}

function verifyUpdaterKey(path, password) {
  const probeRoot = mkdtempSync(join(tmpdir(), 'mianshi-updater-key-'));
  const probeFile = join(probeRoot, 'probe.txt');
  writeFileSync(probeFile, 'mianshi updater signing check');
  try {
    run('npm', [
      'run', 'tauri', '--', 'signer', 'sign', '-f', path, '-p', password, probeFile,
    ], { label: '验证桌面更新签名密钥' });
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

function assertGithubConfiguration(repo) {
  const secrets = new Set(
    capture('gh', ['secret', 'list', '--repo', repo, '--json', 'name', '--jq', '.[].name'])
      .split('\n')
      .filter(Boolean),
  );
  const variables = new Set(
    capture('gh', ['variable', 'list', '--repo', repo, '--json', 'name', '--jq', '.[].name'])
      .split('\n')
      .filter(Boolean),
  );
  const missing = [
    ...REQUIRED_SECRETS.filter((name) => !secrets.has(name)),
    ...REQUIRED_VARIABLES.filter((name) => !variables.has(name)),
  ];
  if (missing.length) {
    fail(`GitHub 更新配置缺失：${missing.join(', ')}。请先运行 npm run update:setup -- ${repo}`);
  }
}

function ensureRepository(repo) {
  const visibility = succeeds('gh', ['repo', 'view', repo])
    ? capture('gh', ['repo', 'view', repo, '--json', 'visibility', '--jq', '.visibility'])
    : '';

  if (!visibility) {
    run('gh', ['repo', 'create', repo, '--public', '--source', PROJECT_ROOT, '--remote', 'origin'], {
      label: '创建公开 GitHub 仓库',
    });
  } else if (visibility !== 'PUBLIC') {
    fail(`GitHub 仓库 ${repo} 不是公开仓库，客户端无法匿名检查更新`);
  }

  if (!succeeds('git', ['remote', 'get-url', 'origin'])) {
    run('git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`], {
      label: '添加 origin',
    });
  } else if (repositorySlugFromOrigin().toLowerCase() !== repo.toLowerCase()) {
    fail(`现有 origin 指向 ${repositorySlugFromOrigin()}，与参数 ${repo} 不一致`);
  }
}

async function setup(repo) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '')) {
    fail('用法：npm run update:setup -- GitHub用户名/仓库名');
  }
  requireCommand('git', '请先安装 Git');
  requireCommand('gh', '请先安装 GitHub CLI，并运行 gh auth login');
  requireCommand('keytool', '请安装 JDK 17');
  ensureGithubLogin();

  if (!succeeds('git', ['rev-parse', '--is-inside-work-tree'])) {
    run('git', ['init', '-b', 'main'], { label: '初始化 Git 仓库' });
  }
  ensureGitIdentity();

  if (!gitHasCommit()) {
    run('git', ['add', '-A'], { label: '暂存项目文件' });
    run('git', ['commit', '-m', 'chore: initialize project'], { label: '创建初始提交' });
  } else {
    assertCleanWorktree();
  }

  ensureRepository(repo);
  const branch = currentBranch();
  run('git', ['push', '-u', 'origin', branch], { label: '推送初始代码' });

  const keyRoot = join(homedir(), '.tauri');
  const updaterKey = join(keyRoot, 'mianshi-updater.key');
  const androidKey = join(keyRoot, 'mianshi-android.jks');
  mkdirSync(keyRoot, { recursive: true, mode: 0o700 });

  const updaterPassword = await readConfirmedSecret('桌面更新密钥密码');
  if (!existsSync(updaterKey)) {
    run('npm', [
      'run', 'tauri', '--', 'signer', 'generate', '-p', updaterPassword,
      '-w', updaterKey, '--ci',
    ], { label: '生成桌面更新签名密钥' });
  }
  const updaterPublicKey = `${updaterKey}.pub`;
  if (!existsSync(updaterKey) || !existsSync(updaterPublicKey)) {
    fail(`桌面更新密钥不完整：${updaterKey}`);
  }
  verifyUpdaterKey(updaterKey, updaterPassword);

  const androidPassword = await readConfirmedSecret('Android 签名密码');
  if (!existsSync(androidKey)) {
    run('keytool', [
      '-genkeypair', '-v', '-keystore', androidKey, '-alias', 'mianshi',
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
      '-storepass', androidPassword, '-keypass', androidPassword,
      '-dname', 'CN=Mianshi, OU=App, O=Mianshi, L=Unknown, ST=Unknown, C=CN',
    ], { label: '生成 Android 签名密钥' });
  }
  run('keytool', ['-list', '-keystore', androidKey, '-storepass', androidPassword], {
    label: '验证 Android 签名密钥',
  });

  setGithubSecret(repo, 'TAURI_SIGNING_PRIVATE_KEY', readFileSync(updaterKey, 'utf8'));
  setGithubSecret(repo, 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD', updaterPassword);
  setGithubVariable(repo, 'TAURI_UPDATER_PUBKEY', readFileSync(updaterPublicKey, 'utf8').trim());
  setGithubSecret(repo, 'ANDROID_KEYSTORE_BASE64', readFileSync(androidKey).toString('base64'));
  setGithubSecret(repo, 'ANDROID_KEYSTORE_PASSWORD', androidPassword);
  setGithubSecret(repo, 'ANDROID_KEY_ALIAS', 'mianshi');
  setGithubSecret(repo, 'ANDROID_KEY_PASSWORD', androidPassword);
  assertGithubConfiguration(repo);

  console.log(`\n✅ 在线更新初始化完成：${repo}`);
  console.log('以后发布只需：npm run release -- 0.2.0');
}

function updateVersions(version) {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const tauriConfig = readJson('src-tauri/tauri.conf.json');
  const cargoPath = join(PROJECT_ROOT, 'src-tauri/Cargo.toml');
  const cargoToml = readFileSync(cargoPath, 'utf8');

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages[''].version = version;
  tauriConfig.version = version;
  tauriConfig.bundle.android.versionCode += 1;

  const nextCargo = cargoToml.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+("\s*\n)/,
    `$1${version}$2`,
  );
  if (nextCargo === cargoToml) fail('无法更新 src-tauri/Cargo.toml 版本号');

  writeJson('package.json', packageJson);
  writeJson('package-lock.json', packageLock);
  writeJson('src-tauri/tauri.conf.json', tauriConfig);
  writeFileSync(cargoPath, nextCargo);
}

function publish(version) {
  const next = parseVersion(version, '新版本号');
  requireCommand('git', '请先安装 Git');
  requireCommand('gh', '请先安装 GitHub CLI');
  if (!gitHasCommit()) fail('仓库还没有初始提交，请先运行 npm run update:setup -- 用户名/仓库名');
  assertCleanWorktree();

  const repo = repositorySlugFromOrigin();
  ensureGithubLogin();
  assertGithubConfiguration(repo);

  const packageJson = readJson('package.json');
  const current = parseVersion(packageJson.version, '当前版本号');
  if (compareVersions(next, current) <= 0) {
    fail(`新版本 ${version} 必须高于当前版本 ${packageJson.version}`);
  }

  const tag = `v${version}`;
  if (succeeds('git', ['rev-parse', '--verify', `refs/tags/${tag}`])) fail(`本地标签 ${tag} 已存在`);
  if (capture('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) {
    fail(`远程标签 ${tag} 已存在`);
  }

  const originals = new Map(
    VERSION_FILES.map((path) => [path, readFileSync(join(PROJECT_ROOT, path))]),
  );
  try {
    updateVersions(version);
    run('npm', ['test'], { label: '前端测试' });
    run('npm', ['run', 'build'], { label: '前端构建' });
    run('cargo', ['test'], {
      cwd: join(PROJECT_ROOT, 'src-tauri'),
      label: 'Rust 测试',
    });
    run('cargo', ['check'], {
      cwd: join(PROJECT_ROOT, 'src-tauri'),
      label: 'Rust 编译检查',
    });
  } catch (error) {
    for (const [path, content] of originals) writeFileSync(join(PROJECT_ROOT, path), content);
    throw error;
  }

  const branch = currentBranch();
  run('git', ['add', ...VERSION_FILES], { label: '暂存版本文件' });
  run('git', ['commit', '-m', `release: ${tag}`], { label: '创建发布提交' });
  run('git', ['tag', '-a', tag, '-m', `Mianshi ${tag}`], { label: '创建版本标签' });
  run('git', [
    'push', '--atomic', 'origin', `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`,
  ], { label: '原子推送代码和标签' });

  console.log(`\n✅ ${tag} 已提交并触发 GitHub Actions`);
  console.log(`查看进度：https://github.com/${repo}/actions`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === 'setup') {
    await setup(argument);
  } else if (command === 'publish') {
    publish(argument);
  } else {
    fail([
      '用法：',
      '  npm run update:setup -- GitHub用户名/仓库名',
      '  npm run release -- 0.2.0',
    ].join('\n'));
  }
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
