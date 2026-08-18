import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function firstExisting(paths) {
  return paths.find((path) => path && existsSync(path));
}

function compareVersion(left, right) {
  const a = left.split(/\D+/).filter(Boolean).map(Number);
  const b = right.split(/\D+/).filter(Boolean).map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right);
}

function resolveAndroidHome() {
  const configured = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const platformDefaults = {
    darwin: [join(homedir(), 'Library/Android/sdk')],
    linux: [join(homedir(), 'Android/Sdk')],
    win32: [join(process.env.LOCALAPPDATA || '', 'Android/Sdk')],
  };
  return firstExisting([configured, ...(platformDefaults[process.platform] || [])]);
}

function resolveNdkHome(androidHome) {
  const configured = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME;
  if (configured && existsSync(configured)) return configured;

  const ndkRoot = join(androidHome, 'ndk');
  if (!existsSync(ndkRoot)) return undefined;
  const versions = readdirSync(ndkRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(ndkRoot, entry.name, 'source.properties'))
    )
    .map((entry) => entry.name)
    .sort(compareVersion);
  return versions.length > 0 ? join(ndkRoot, versions.at(-1)) : undefined;
}

function resolveJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const platformDefaults = {
    darwin: ['/Applications/Android Studio.app/Contents/jbr/Contents/Home'],
    linux: ['/opt/android-studio/jbr', '/usr/local/android-studio/jbr'],
    win32: [join(process.env.ProgramFiles || '', 'Android/Android Studio/jbr')],
  };
  return firstExisting(platformDefaults[process.platform] || []);
}

const androidHome = resolveAndroidHome();
if (!androidHome) {
  console.error('未找到 Android SDK，请先设置 ANDROID_HOME。');
  process.exit(1);
}

const ndkHome = resolveNdkHome(androidHome);
if (!ndkHome) {
  console.error(`未在 ${join(androidHome, 'ndk')} 找到 Android NDK。`);
  process.exit(1);
}

const javaHome = resolveJavaHome();
if (!javaHome) {
  console.error('未找到 Android Studio JBR，请先设置 JAVA_HOME。');
  process.exit(1);
}

const executable = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const tauri = join(process.cwd(), 'node_modules', '.bin', executable);
if (!existsSync(tauri)) {
  console.error('未找到本地 Tauri CLI，请先执行 npm install。');
  process.exit(1);
}

console.log(`[android] SDK: ${androidHome}`);
console.log(`[android] NDK: ${ndkHome}`);
console.log(`[android] JDK: ${javaHome}`);

const forwardedArguments = process.argv.slice(2);
const isRelease = forwardedArguments.includes('--release');
const buildArguments = forwardedArguments.filter((argument) => argument !== '--release');
const informationalOnly = forwardedArguments.some((argument) =>
  ['--help', '-h', '--version', '-V'].includes(argument)
);
const apkOutputDirectory = join(
  process.cwd(),
  'src-tauri/gen/android/app/build/outputs/apk'
);

// Gradle's incremental APK signer can retain a large obsolete signing block
// after the native library shrinks. Always package debug APKs from a clean,
// generated output directory; source files and Cargo artifacts are untouched.
if (!informationalOnly) rmSync(apkOutputDirectory, { recursive: true, force: true });

const result = spawnSync(
  tauri,
  ['android', 'build', ...(isRelease ? [] : ['--debug']), '--apk', ...buildArguments],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ANDROID_HOME: androidHome,
      ANDROID_SDK_ROOT: androidHome,
      NDK_HOME: ndkHome,
      ANDROID_NDK_HOME: ndkHome,
      JAVA_HOME: javaHome,
      // Keep the APK debuggable while omitting Rust DWARF data. Without this,
      // a dev-profile native library can add hundreds of megabytes to the APK.
      CARGO_PROFILE_DEV_DEBUG: process.env.CARGO_PROFILE_DEV_DEBUG || '0',
    },
  }
);

if (result.error) {
  console.error(`启动 Tauri Android 构建失败：${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);

if (!informationalOnly) {
  console.log(`[android] ${isRelease ? 'Release' : 'Debug'} APK 已输出到 ${apkOutputDirectory}`);
}
