import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import { useVSCode } from "../src/context/vscode"
import type { WorktreeFileDiff } from "../src/types/messages"
import { useLanguage } from "../src/context/language"

export function createReviewActions(context: Accessor<string>, source: Accessor<string | undefined>) {
  const vscode = useVSCode()
  const { t } = useLanguage()
  const [revision, setRevision] = createSignal("")
  const [diffs, setDiffs] = createSignal<WorktreeFileDiff[]>()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  let pending: string | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const request = (action?: "accept" | "reject", file?: string, hunk?: string) => {
    if (!source()?.startsWith("session:") || pending || (action && !revision())) return
    const requestId = crypto.randomUUID()
    pending = requestId
    if (action || !diffs()) setBusy(true)
    setError(undefined)
    timeout = setTimeout(() => {
      if (pending !== requestId) return
      pending = undefined
      setBusy(false)
      setRevision("")
      setError(t("review.sessionTimeout"))
    }, 30_000)
    vscode.postMessage(
      action && file
        ? { type: "diffViewer.review.decide", action, file, hunk, revision: revision(), requestId }
        : { type: "diffViewer.review.load", requestId },
    )
  }
  const unsubscribe = vscode.onMessage((message) => {
    if (message.type === "diffViewer.ready") {
      request()
      return
    }
    if (message.type !== "diffViewer.review.result" || message.requestId !== pending) return
    if (timeout) clearTimeout(timeout)
    pending = undefined
    setBusy(false)
    setError(message.error)
    if (message.error) {
      setRevision("")
      return
    }
    setRevision(message.revision ?? "")
    setDiffs((current) =>
      (message.diffs ?? []).map((file) => {
        const previous = current?.find((item) => item.file === file.file)
        return previous &&
          previous.stamp === file.stamp &&
          previous.patch === file.patch &&
          JSON.stringify(previous.hunks) === JSON.stringify(file.hunks)
          ? previous
          : file
      }),
    )
  })
  createEffect(() => {
    context()
    source()
    if (timeout) clearTimeout(timeout)
    pending = undefined
    setRevision("")
    setDiffs(undefined)
    setBusy(false)
    setError(undefined)
  })
  const interval = setInterval(() => {
    if (document.visibilityState !== "hidden") request()
  }, 5_000)
  onCleanup(() => {
    unsubscribe()
    clearInterval(interval)
    if (timeout) clearTimeout(timeout)
  })
  return {
    diffs,
    revision,
    busy,
    error,
    refresh: () => request(),
    decide: (action: "accept" | "reject", file: string, hunk?: string) => request(action, file, hunk),
  }
}
