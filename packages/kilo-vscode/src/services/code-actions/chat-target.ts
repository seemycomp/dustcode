import * as vscode from "vscode"

export interface ChatTarget {
  waitForReady(): Promise<void | boolean>
  postMessage(message: unknown): void
}

export async function ready(view: ChatTarget, sidebar = false): Promise<boolean> {
  if (sidebar) await vscode.commands.executeCommand("dustcode.SidebarProvider.focus")
  return (await view.waitForReady()) !== false
}
