# Dustcode

Dustcode 是专为 **VS Code** 提供的开源 AI 编程助手。本分支仅维护扩展及其内置后端，不发布独立 CLI、JetBrains 插件或云产品。

## 安装

1. 在仓库根目录运行 `bun run build:vscode`，或从本仓库 GitHub Actions 中成功的 **VS Code** 运行下载对应平台的构建产物。
2. 如有需要先解压，然后在 VS Code 中运行 **Extensions: Install from VSIX...**，选择 `dustcode-<target>.vsix`。
3. 打开 Dustcode，单独配置模型提供商。

扩展 ID 为 `dustcode.dustcode`，设置使用 `dustcode.*`，项目状态存放在 `.dustcode/`。不会导入 Kilo Code 的凭据或会话。本分支未配置自动发布，也未提供已确认的 Dustcode Marketplace 页面。Kilo Gateway 是外部服务，并非 Dustcode 运营的服务。

配置和开发以[根 README](../README.md)为准；VSIX 构建与 CI 产物详情见 [RELEASING.md](../RELEASING.md)。

## 上游与许可证

Dustcode 派生自 [Kilo Code](https://github.com/Kilo-Org/kilocode)，其后端源自 [OpenCode](https://github.com/anomalyco/opencode)。

MIT。你可以使用、修改和分发此代码，包括商业用途，只要保留署名和许可证声明。参见 [License](../LICENSE)。请保留第三方组件的版权和许可证声明。
