import type { AgentManagerDialogMessage } from "../../webview-ui/src/types/messages/agent-manager"

export async function openDialog(
  manager: {
    openPanel(): void | Promise<void>
    openInTab(): void
    waitForReady(presentation: "sidebar" | "editor"): Promise<boolean>
    postMessage(message: unknown, presentation: "sidebar" | "editor"): void
  },
  message: AgentManagerDialogMessage,
) {
  const target = message.dialog === "worktree" || message.dialog === "shortcuts" ? "sidebar" : "editor"
  if (target === "sidebar") await manager.openPanel()
  if (target === "editor") manager.openInTab()
  if (!(await manager.waitForReady(target))) return
  manager.postMessage(message, target)
}
