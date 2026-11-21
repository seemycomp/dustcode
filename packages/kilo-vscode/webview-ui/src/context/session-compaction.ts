import type { Message, Part } from "../types/messages"

export function hasCompaction(parts: Part[]) {
  return parts.some((part) => part.type === "compaction")
}

export function compacting(messages: Message[], getParts: (id: string) => Part[]) {
  const user = messages.findLast((message) => message.role === "user" && hasCompaction(getParts(message.id)))
  if (!user) return false
  const following = messages.slice(messages.indexOf(user) + 1)
  if (following.some((message) => message.role === "assistant" && (message.error || message.time?.completed)))
    return false
  if (following.some((message) => message.role === "assistant" && message.summary !== true)) return false
  return true
}
