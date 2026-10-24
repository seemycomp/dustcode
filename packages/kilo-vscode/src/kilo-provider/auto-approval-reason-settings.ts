import * as vscode from "vscode"

type Post = (msg: unknown) => void

export function buildAutoApprovalReasonSettingMessage() {
  const config = vscode.workspace.getConfiguration("dustcode")
  return {
    type: "autoApprovalReasonSettingLoaded" as const,
    visible: config.get<boolean>("showAutoApprovalReason", true),
  }
}

export function watchAutoApprovalReasonConfig(post: Post): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("dustcode.showAutoApprovalReason")) {
      post(buildAutoApprovalReasonSettingMessage())
    }
  })
}
