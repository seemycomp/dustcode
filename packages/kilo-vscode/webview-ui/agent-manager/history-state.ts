import { batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type {
  HistoryMessage,
  HistoryOpen,
  HistoryOpenFailed,
  HistoryRequest,
  HistoryRow,
} from "../../src/shared/agent-history"

type Send = (message: HistoryRequest | HistoryOpen) => void

function page() {
  const [data, set] = createStore({
    rows: [] as HistoryRow[],
    loading: false,
    loaded: false,
    more: false,
    error: undefined as string | undefined,
    generation: -1,
  })
  return { data, set, request: "", paging: false, scroll: 0, focus: "" }
}

/** Metadata and presentation live with the project, never with sortable/accordion row mounts. */
export function createHistoryState(projectId: string) {
  const contexts = new Map<string, ReturnType<typeof context>>()
  function context(worktreeId: string | null) {
    const pages = new Map([["", page()]])
    const [query, setQuery] = createSignal("")
    const [text, setText] = createSignal("")
    const [searching, search] = createSignal(false)
    const [current, setCurrent] = createSignal(pages.get("")!)
    const [failure, setFailure] = createSignal<string>()
    let send: Send | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let opening: HistoryOpen | undefined
    const request = (opts: { more?: boolean; refresh?: boolean } = {}) => {
      if (!send) return
      const value = current()
      if (value.data.loading && !opts.refresh) return
      if (opts.more && (value.data.loading || !value.data.more)) return
      value.request = crypto.randomUUID()
      value.paging = opts.more === true
      value.set({ loading: true, error: undefined })
      send({
        type: "agentManager.requestHistory",
        projectId,
        worktreeId,
        query: query(),
        requestId: value.request,
        ...opts,
      })
    }
    const stop = () => {
      if (!send) return
      send({
        type: "agentManager.requestHistory",
        projectId,
        worktreeId,
        query: query(),
        requestId: current().request,
        active: false,
      })
      current().set("loading", false)
    }
    const change = (value: string) => {
      if (value === query()) return
      stop()
      for (const key of pages.keys()) if (key && key !== value) pages.delete(key)
      const next = pages.get(value) ?? page()
      pages.set(value, next)
      batch(() => {
        setQuery(value)
        setCurrent(next)
      })
      request()
    }
    const input = (value: string) => {
      setText(value)
      clearTimeout(timer)
      timer = setTimeout(() => change(value.trim()), 200)
    }
    return {
      text,
      query,
      searching,
      search,
      current,
      failure,
      input,
      clear: () => {
        clearTimeout(timer)
        setText("")
        search(false)
        change("")
      },
      attach: (post: Send) => {
        send = post
        request()
        return () => {
          stop()
          send = undefined
        }
      },
      request,
      receive: (message: HistoryMessage) => {
        const value = pages.get(message.query)
        if (!value || value.request !== message.requestId || message.generation < value.data.generation) return
        batch(() => {
          // Failed revalidation/pagination must not replace successfully loaded rows.
          if (!message.error && (!message.loading || message.rows.length > 0))
            value.set("rows", reconcile(message.rows, { key: "id" }))
          value.set({
            generation: message.generation,
            loading: message.loading,
            more: message.more,
            error: message.error,
            loaded: value.data.loaded || (!message.loading && !message.error),
          })
        })
      },
      retry: () => request({ more: current().paging }),
      open: (sessionId: string) => {
        if (!send) return
        setFailure(undefined)
        opening = {
          type: "agentManager.openHistorySession",
          projectId,
          worktreeId,
          sessionId,
          requestId: crypto.randomUUID(),
        }
        send(opening)
      },
      failed: (message: HistoryOpenFailed) => {
        if (opening?.requestId === message.requestId) setFailure(message.error)
      },
      reopen: () => {
        if (opening) send?.(opening)
      },
      revalidate: () => {
        if (send) request()
      },
      dispose: () => {
        clearTimeout(timer)
        stop()
        send = undefined
      },
    }
  }
  const get = (id: string | null) => {
    const key = id ?? "local"
    const value = contexts.get(key) ?? context(id)
    contexts.set(key, value)
    return value
  }
  return {
    context: get,
    receive: (message: HistoryMessage | HistoryOpenFailed) => {
      if (message.projectId !== projectId) return
      const value = contexts.get(message.worktreeId ?? "local")
      if (message.type === "agentManager.history") value?.receive(message)
      else value?.failed(message)
    },
    revalidate: () => {
      for (const value of contexts.values()) value.revalidate()
    },
    prune: (ids: Set<string>) => {
      for (const [key, value] of contexts) {
        if (key === "local" || ids.has(key)) continue
        value.dispose()
        contexts.delete(key)
      }
    },
    dispose: () => {
      for (const value of contexts.values()) value.dispose()
      contexts.clear()
    },
  }
}
