import * as vscode from "vscode"

export class KiloCodeActionProvider implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorRewrite],
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (range.isEmpty) return []

    const actions: vscode.CodeAction[] = []

    const add = new vscode.CodeAction("Add to Dustcode", vscode.CodeActionKind.RefactorRewrite)
    add.command = { command: "dustcode.addToContext", title: "Add to Dustcode" }
    actions.push(add)

    const hasDiagnostics = context.diagnostics.length > 0

    if (hasDiagnostics) {
      const fix = new vscode.CodeAction("Fix with Dustcode", vscode.CodeActionKind.QuickFix)
      fix.command = { command: "dustcode.fixCode", title: "Fix with Dustcode" }
      fix.isPreferred = true
      actions.push(fix)
    }

    if (!hasDiagnostics) {
      const explain = new vscode.CodeAction("Explain with Dustcode", vscode.CodeActionKind.RefactorRewrite)
      explain.command = { command: "dustcode.explainCode", title: "Explain with Dustcode" }
      actions.push(explain)

      const improve = new vscode.CodeAction("Improve with Dustcode", vscode.CodeActionKind.RefactorRewrite)
      improve.command = { command: "dustcode.improveCode", title: "Improve with Dustcode" }
      actions.push(improve)
    }

    return actions
  }
}
