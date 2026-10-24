# Dustcode

Dustcode 是專為 **VS Code** 提供的開源 AI 程式設計助手。本分支僅維護擴充功能及其內建後端，不發行獨立 CLI、JetBrains 外掛或雲端產品。

## 安裝

1. 在儲存庫根目錄執行 `bun run build:vscode`，或從本儲存庫 GitHub Actions 中成功的 **VS Code** 執行下載對應平台的建置產物。
2. 如有需要先解壓縮，再於 VS Code 執行 **Extensions: Install from VSIX...**，選擇 `dustcode-<target>.vsix`。
3. 開啟 Dustcode，另行設定模型供應商。

擴充功能 ID 為 `dustcode.dustcode`，設定使用 `dustcode.*`，專案狀態存放在 `.dustcode/`。不會匯入 Kilo Code 的憑證或工作階段。本分支未設定自動發佈，也未提供已確認的 Dustcode Marketplace 頁面。Kilo Gateway 是外部服務，並非 Dustcode 營運的服務。

設定與開發以[根 README](../README.md)為準；VSIX 建置與 CI 產物詳情見 [RELEASING.md](../RELEASING.md)。

## 上游與授權

Dustcode 衍生自 [Kilo Code](https://github.com/Kilo-Org/kilocode)，其後端源自 [OpenCode](https://github.com/anomalyco/opencode)。

MIT。你可以使用、修改和散布此程式碼，包括商業用途，只要保留署名和授權聲明。請參閱 [License](../LICENSE)。請保留第三方元件的版權與授權聲明。
