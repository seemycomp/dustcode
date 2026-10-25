import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import { useVSCode } from "../../context/vscode"
import type { WorktreeFileDiff } from "../../types/messages"
import { useLanguage } from "../../context/language"

type File = WorktreeFileDiff & { reviewStatus: "pending" | "accepted" | "rejected"; rejectable: boolean }

export function createSessionReview(
  id: Accessor<string | null | undefined>,
  status: Accessor<string>,
  enabled: Accessor<boolean> = () => true,
  scope: Accessor<string | undefined> = () => undefined,
) {
  const vscode = useVSCode()
  const { t } = useLanguage()
  const [files, setFiles] = createSignal<File[]>([])
  const [loading, setLoading] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [revision, setRevision] = createSignal("")
  let pending: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const request = (action?: "accept" | "accept-all" | "reject" | "undo-all", file?: string) => {
    const sessionID = id()
    if (!enabled() || !sessionID || pending) return
    if (action && (!revision() || status() !== "idle")) return
    const requestId = crypto.randomUUID()
    pending = requestId
    setError(undefined)
    if (action) setBusy(true)
    else if (!files().length) setLoading(true)
    timer = setTimeout(() => {
      if (pending !== requestId) return
      pending = undefined
      setLoading(false)
      setBusy(false)
      setRevision("")
      setError(t("review.sessionTimeout"))
    }, 30_000)
    vscode.postMessage(
      action
        ? { type: "sessionReview.decide", sessionID, requestId, revision: revision(), action, file }
        : { type: "sessionReview.load", sessionID, requestId },
    )
  }
  const unsubscribe = vscode.onMessage((message) => {
    if (message.type !== "sessionReview.result" || message.sessionID !== id() || message.requestId !== pending) return
    if (timer) clearTimeout(timer)
    pending = undefined
    setLoading(false)
    setBusy(false)
    if (message.error) {
      setError(message.error)
      setRevision("")
      return
    }
    setFiles(message.files ?? [])
    setRevision(message.revision ?? "")
  })
  createEffect(() => {
    id()
    enabled()
    scope()
    if (timer) clearTimeout(timer)
    pending = undefined
    setFiles([])
    setRevision("")
    setLoading(false)
    setBusy(false)
    setError(undefined)
    untrack(() => request())
  })
  createEffect(() => {
    const state = status()
    if (state === "idle") untrack(() => request())
  })
  const interval = setInterval(() => {
    if (document.visibilityState !== "hidden" && status() === "idle") request()
  }, 5_000)
  onCleanup(() => {
    unsubscribe()
    clearInterval(interval)
    if (timer) clearTimeout(timer)
  })
  return { files, loading, busy, error, revision, refresh: () => request(), decide: request }
}
