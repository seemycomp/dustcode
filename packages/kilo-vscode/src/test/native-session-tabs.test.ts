import * as assert from "assert"
import * as vscode from "vscode"

const chats = () =>
  vscode.window.tabGroups.all.flatMap((group) =>
    group.tabs.filter(
      (tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith("dustcode.TabPanel"),
    ),
  )

async function changed(action: () => Thenable<unknown>, check: () => boolean) {
  const ready = Promise.withResolvers<void>()
  const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
    if (check()) ready.resolve()
  })
  try {
    await action()
    if (check()) ready.resolve()
    await ready.promise
  } finally {
    subscription.dispose()
  }
}

suite("Native chat editor tabs", () => {
  test("keeps blank tabs independent while moving and closing editor groups", async function () {
    this.timeout(60_000)
    const baseline = new Set(vscode.window.tabGroups.all.flatMap((group) => group.tabs))
    const count = chats().length
    try {
      await changed(
        () => vscode.commands.executeCommand("dustcode.openInTab"),
        () => chats().length === count + 1,
      )
      await changed(
        () => vscode.commands.executeCommand("dustcode.openInTab"),
        () => chats().length === count + 2,
      )
      assert.strictEqual(chats().length, count + 2)

      // Create a native neighboring group without splitting or cloning the webview itself.
      const document = await vscode.workspace.openTextDocument({ language: "plaintext" })
      await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside)
      await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup")
      await changed(
        () => vscode.commands.executeCommand("workbench.action.moveEditorToNextGroup"),
        () =>
          new Set(
            chats()
              .filter((tab) => !baseline.has(tab))
              .map((tab) => tab.group),
          ).size === 2,
      )
      assert.strictEqual(chats().length, count + 2)

      const target = vscode.window.tabGroups.activeTabGroup.activeTab
      assert.ok(target?.input instanceof vscode.TabInputWebview)
      await changed(
        () => vscode.window.tabGroups.close(target),
        () => chats().length === count + 1,
      )
      assert.strictEqual(chats().length, count + 1)
    } finally {
      const created = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => !baseline.has(tab))
      await vscode.window.tabGroups.close(created)
    }
  })
})
