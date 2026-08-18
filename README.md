# Mianshi：AI 面经解析 App

基于 Tauri、React 与 TypeScript 的桌面 / Android 面经解析工具。粘贴一份面试记录原文，配置第三方大模型（OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages 兼容服务）后，自动提取面试问题、去重改写、生成结构化详细答案（【结论】【原理】【实践】【边界】）并附带官方参考文档，保存为本机可复习的面经题单。

- 模型配置、API Key、生成草稿和面经题单统一保存在当前设备的应用 `localStorage` 中
- 模型请求由 Rust 原生端发出，前端只传入配置
- 面经按批次生成并保存断点，应用重启后可从上一个完成批次继续
- AI 生成的参考文档 URL 经过受信官方域名白名单校验，App 内置安全来源查看窗口
- 面经题单可一键导出为本地 PDF，包含摘要、全部题目、结构化答案、代码和参考资料；生成过程不上传数据

## macOS 提示“Apple 无法验证 mianshi”

当前 GitHub Release 中的 macOS 安装包尚未使用 Apple Developer ID 签名和公证，因此首次启动时可能被 Gatekeeper 阻止。这不代表系统检测到了恶意软件，但 macOS 无法通过 Apple 公证确认该 App。

仅在确认安装包来自[本项目 GitHub Releases](https://github.com/gaoio/mianshi/releases/latest)时，按以下方式打开：

1. 尝试打开一次 `mianshi.app`，看到提示后关闭对话框。
2. 打开“系统设置”→“隐私与安全性”，向下滚动到“安全性”。
3. 在被阻止的 `mianshi` 提示旁点击“仍要打开”。
4. 输入 Mac 登录密码或使用 Touch ID，再次点击“打开”。

“仍要打开”通常只会在首次尝试启动后约一小时内显示。完成一次后，macOS 会将该 App 保存为例外。具体流程可参考 [Apple 官方说明](https://support.apple.com/guide/mac-help/mchleab3a043/mac)。

如果系统设置中仍无法放行，并且已经核实下载来源，可以在终端中移除该 App 的隔离标记：

```bash
xattr -dr com.apple.quarantine "/Applications/mianshi.app"
open "/Applications/mianshi.app"
```

不要使用 `spctl --master-disable` 全局关闭 Gatekeeper。如果提示内容是“将损坏您的电脑”或系统检测到恶意软件，请立即停止运行并重新下载安装包。

若要从发布端彻底消除此提示，需要加入 Apple Developer Program，使用 Developer ID Application 证书签名，并在 GitHub Actions 中完成 Apple notarization；Tauri updater 签名不能代替 Apple 公证。

## 本地开发

```bash
# 前端依赖
npm install

# 桌面端开发
npm run tauri dev

# Android 调试包（需 Android SDK/NDK）
npm run android:debug
npm run android:debug:arm64
```

## 质量门禁

```bash
npm test                 # 前端单测（纯函数 + 来源校验）
npm run build            # tsc 类型检查 + 前端构建
cd src-tauri && cargo test && cargo check
```

## 一键发布更新

首次配置 GitHub 仓库与签名密钥：

```bash
npm run update:setup -- GitHub用户名/仓库名
```

以后发布新版本只需一个命令，脚本会同步版本号、递增 Android `versionCode`、完成测试与构建、提交、打标签并推送：

```bash
npm run release -- 0.2.0
```

发布脚本要求工作区干净，任何检查失败都会在提交前恢复版本文件。详细机制见 `docs/online-updates.md`。

## 本地数据

业务数据统一由 `src/lib/localStorage.ts` 管理，使用单一版本化 JSON 对象写入 `mianshi-app-data-v1`。页面层保留异步数据接口，桌面端、Android 和浏览器开发环境使用相同实现。

API Key 不再写入 SQLite 或系统凭据库，会以明文形式存在应用本地存储中。请勿在共享设备上保存生产环境密钥；清除应用站点数据会同时删除模型配置、草稿和全部面经。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://rust-lang.github.io/rust-analyzer/)
