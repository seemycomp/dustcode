import { createMemo } from "solid-js"
import type { AssistantMessage as SDKAssistantMessage, Part as SDKPart } from "@kilocode/sdk/v2"
import { useSession } from "../../context/session"
import { visibleParts } from "../../context/session-queue"
import { category, color, label, type TimelineCategory } from "../../utils/timeline/colors"
import { sizes } from "../../utils/timeline/sizes"
import { isRenderable } from "../../utils/transcript-parts"

export interface TimelineBar {
  bg: string
  tip: string
  width: number
  height: number
  idx: number
  msgId: string
  partId: string
  category: TimelineCategory
}

export function useTimeline() {
  const session = useSession()
  return createMemo(() => {
    const revert = session.revert() ?? undefined
    const qs = session.questions()
    const entries = session.visibleMessages().flatMap((m) => {
      if (m.role === "user") return []
      return visibleParts(m.id, session.getParts(m.id), revert)
        .filter((part) => {
          if (!isRenderable(part as SDKPart, m as SDKAssistantMessage)) return false
          if (part.type !== "tool" || part.tool !== "question") return true
          if (part.state.status !== "pending" && part.state.status !== "running") return true
          const call = (part as SDKPart & { callID: string }).callID
          return qs.some((item) => item.tool?.callID === call && item.tool?.messageID === m.id)
        })
        .filter((part) => part.type !== "step-start")
        .map((part) => ({ msg: m, part }))
    })
    const sz = sizes(entries.map((entry) => entry.part))
    return entries.map(
      (entry, idx): TimelineBar => ({
        bg: color(entry.part),
        tip: label(entry.part, entry.msg),
        width: sz.at(idx)!.width,
        height: sz.at(idx)!.height,
        idx,
        msgId: entry.msg.id,
        partId: entry.part.id,
        category: category(entry.part),
      }),
    )
  })
}
