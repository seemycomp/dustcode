import type { AgentManagerDialogMessage } from "../src/types/messages/agent-manager"

/** Worktree creation and shortcuts stay in-place; other large sidebar dialogs use the editor. */
export function routeDialog(post: (message: AgentManagerDialogMessage) => void, message: AgentManagerDialogMessage) {
  if (message.dialog === "worktree" || message.dialog === "shortcuts") return false
  if (document.body.dataset.agentManagerPresentation !== "sidebar") return false
  post(message)
  return true
}
