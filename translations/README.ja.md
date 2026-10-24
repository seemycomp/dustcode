# Dustcode

Dustcode は **VS Code** 専用のオープンソース AI コーディングエージェントです。このフォークは拡張機能と内蔵バックエンドのみを保守し、独立した CLI、JetBrains プラグイン、クラウド製品は配布しません。

## インストール

1. リポジトリのルートで `bun run build:vscode` を実行するか、このリポジトリの GitHub Actions で成功した **VS Code** 実行から対応するプラットフォームの成果物をダウンロードします。
2. 必要に応じて展開し、VS Code の **Extensions: Install from VSIX...** で `dustcode-<target>.vsix` を選択します。
3. Dustcode を開き、モデルプロバイダーを別途設定します。

拡張機能 ID は `dustcode.dustcode`、設定は `dustcode.*`、プロジェクトの状態は `.dustcode/` を使用します。Kilo Code の認証情報やセッションは取り込みません。自動公開や確認済みの Dustcode Marketplace ページは設定されていません。

設定と開発の正式な情報は[ルート README](../README.md)、VSIX ビルドと CI 成果物は [RELEASING.md](../RELEASING.md) を参照してください。

## 出典とライセンス

Dustcode は [Kilo Code](https://github.com/Kilo-Org/kilocode) のフォークで、バックエンドは [OpenCode](https://github.com/anomalyco/opencode) に由来します。

MIT。帰属表示とライセンス通知を保持する限り、商用利用を含め、このコードを使用、変更、配布できます。[License](../LICENSE) を参照してください。第三者の著作権表示とライセンス通知も保持してください。
