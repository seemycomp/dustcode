import { Show, createEffect, on, onCleanup } from "solid-js"
import { TranscriptSearch } from "./TranscriptSearch"
import { useTranscriptSearch } from "../../context/transcript-search"

// Keep command-driven search and focus restoration mounted without a session header.
export function TaskHeader() {
  const search = useTranscriptSearch()
  const toggle = () => (search.active() ? search.closeSearch() : search.setActive(true))
  window.addEventListener("focusTranscriptSearch", toggle)
  onCleanup(() => window.removeEventListener("focusTranscriptSearch", toggle))

  createEffect(
    on(
      () => search.closeSignal(),
      () => window.dispatchEvent(new CustomEvent("focusPrompt", { detail: { restore: true } })),
      { defer: true },
    ),
  )

  return (
    <Show when={search.active()}>
      <div data-component="task-header-search">
        <TranscriptSearch />
      </div>
    </Show>
  )
}
