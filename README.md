# Mianshi：AI 面经解析 App

基于 Tauri、React 与 TypeScript 的桌面 / Android 面经解析工具。粘贴一份面试记录原文，配置第三方大模型（OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages 兼容服务）后，自动提取面试问题、去重改写、生成结构化详细答案（【结论】【原理】【实践】【边界】）并附带官方参考文档，保存为本机可复习的面经题单。

- 模型配置、API Key、生成草稿和面经题单统一保存在当前设备的应用 `localStorage` 中
- 模型请求由 Rust 原生端发出，前端只传入配置
- 面经按批次生成并保存断点，应用重启后可从上一个完成批次继续
- AI 生成的参考文档 URL 经过受信官方域名白名单校验，App 内置安全来源查看窗口

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
