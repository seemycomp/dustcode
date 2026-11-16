import { Show, createEffect, on, onCleanup } from "solid-js"
import { TranscriptSearch } from "./TranscriptSearch"
import { useTranscriptSearch } from "../../context/transcript-search"
import { useLocalTabs } from "../../context/local-tabs"
import { useSession } from "../../context/session"
import { SeparateTabAction } from "../shared/SeparateTabAction"

// Keep command-driven search and focus restoration mounted without a session header.
export function TaskHeader() {
  const search = useTranscriptSearch()
  const tabs = useLocalTabs()
  const session = useSession()
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
    <>
      <Show when={!tabs?.native && tabs?.scope()}>
        {(scope) => (
          <div
            data-component="task-header-scope"
            role="group"
            aria-label={`${scope().projectLabel}: ${scope().label}`}
            title={`${scope().projectLabel}: ${scope().label}`}
          >
            <span data-slot="scope-project">{scope().projectLabel}</span>
            <span data-slot="scope-placement">{scope().label}</span>
          </div>
        )}
      </Show>
      <Show when={tabs && !tabs.native}>
        <div data-component="task-header-actions">
          <SeparateTabAction
            sessionID={session.cloudPreviewId() ? undefined : (tabs?.active() ?? session.currentSessionID())}
          />
        </div>
      </Show>
      <Show when={search.active()}>
        <div data-component="task-header-search">
          <TranscriptSearch />
        </div>
      </Show>
    </>
  )
}
