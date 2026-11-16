import type { ExtensionMessage } from "../types/messages"

export function agentProject(message: ExtensionMessage): string | undefined {
  if (message.type === "ready") return message.nativeSessionTab?.scope?.projectId
  if (message.type === "agentManager.projects") return message.projects.find((item) => item.active)?.id
  if (message.type === "agentManager.selectionActivated") return message.target.projectId
}

export function isStaleAgentSession(message: ExtensionMessage, projectId: string | undefined): boolean {
  if (message.type === "sessionDeleted" && message.projectId) return message.projectId !== projectId
  return (
    (message.type === "sessionCreated" || message.type === "sessionsLoaded") &&
    !!message.projectId &&
    !!projectId &&
    message.projectId !== projectId
  )
}
