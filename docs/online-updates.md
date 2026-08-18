# 在线更新发布

项目使用免费的公开 GitHub Releases 托管更新清单和安装包。桌面端由 Tauri Updater 校验签名后安装；Android 检查独立版本清单，下载 APK 后交给系统安装器确认。

## 一键方式

首次运行一次初始化命令。脚本会创建或连接公开 GitHub 仓库、生成桌面和 Android 签名密钥，并写入所需 GitHub Actions Secrets：

```bash
npm run update:setup -- GitHub用户名/仓库名
```

以后发布只需传入新版本号：

```bash
npm run release -- 0.2.0
```

脚本自动同步 `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock` 和 `tauri.conf.json`，递增 Android `versionCode`，运行前后端检查，创建提交与标签，并原子推送以触发发布工作流。

## 前提

- GitHub 仓库必须公开，否则未登录的客户端无法读取 Release 资源。
- 每次发布前同步修改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 中的版本。
- Android 每次发布都递增 `src-tauri/tauri.conf.json` 的 `bundle.android.versionCode`。
- 私钥和 Android keystore 永远不要提交到仓库。

## 1. 配置桌面更新签名

在本机生成 Tauri 更新签名密钥：

```bash
npm run tauri signer generate -- -w ~/.tauri/mianshi-updater.key
```

将私钥全文保存为 GitHub Actions Secret `TAURI_SIGNING_PRIVATE_KEY`，将密码保存为 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，将生成的 `.pub` 文件原文（单行 Base64，不要解码或截断）保存为 Repository Variable `TAURI_UPDATER_PUBKEY`。

使用 GitHub CLI 时可以执行：

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/mianshi-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
gh variable set TAURI_UPDATER_PUBKEY --body '这里填写生成器输出的公钥'
```

## 2. 配置 Android 固定签名

只生成一次 keystore，后续所有版本必须使用同一份，否则 Android 会拒绝覆盖安装：

```bash
keytool -genkeypair -v \
  -keystore ~/.tauri/mianshi-android.jks \
  -alias mianshi \
  -keyalg RSA -keysize 2048 -validity 10000
```

配置四个 GitHub Actions Secrets：

```bash
base64 < ~/.tauri/mianshi-android.jks | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body 'mianshi'
gh secret set ANDROID_KEY_PASSWORD
```

## 3. 手动发布（备用）

版本号与配置同步后推送标签：

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions 会先创建 Draft Release，并行构建 macOS、Windows、Linux 和签名 Android APK。所有产物成功后才公开 Release；任一平台失败时 Release 保持草稿，客户端不会读取到半成品。

## 安全边界

- 桌面安装包使用 Tauri updater 私钥签名，客户端只内置公钥。
- 更新源、Android 清单和 APK 必须属于编译时绑定的同一 GitHub 仓库。
- Android 安装仍由操作系统确认；首次从浏览器安装时，系统可能要求授权“安装未知应用”。
- Tauri 更新签名不等于 Apple/Windows 商业代码签名。免费发布可运行，但 macOS Gatekeeper 或 Windows SmartScreen 仍可能提示来源未知。
