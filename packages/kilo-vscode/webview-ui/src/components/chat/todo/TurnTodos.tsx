import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, useContext } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { SessionContext } from "../../../context/session"
import { useLanguage } from "../../../context/language"
import type { TodoItem } from "../../../types/messages"
import { todoStats } from "./todo-dock"

export function TurnTodos(props: { id: string; floating?: boolean }) {
  const session = useContext(SessionContext)
  const language = useLanguage()
  const uid = createUniqueId()
  const [open, setOpen] = createSignal(!props.floating)
  let root: HTMLElement | undefined
  createEffect(() => {
    props.id
    setOpen(!props.floating)
  })
  createEffect(() => {
    if (!props.floating || !open()) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setOpen(false)
      root?.querySelector<HTMLButtonElement>("button")?.focus()
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    onCleanup(() => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape)
    })
  })
  const items = createMemo(() => {
    if (!session) return []
    const messages = session.messages()
    const index = messages.findIndex((message) => message.id === props.id)
    if (index < 0) return []
    const following = messages.slice(index + 1)
    const end = following.findIndex((message) => message.role === "user")
    const turn = end < 0 ? following : following.slice(0, end)
    const parts = turn.flatMap((message) => session.getParts(message.id))
    const part = parts.findLast(
      (part) => part.type === "tool" && part.tool === "todowrite" && part.state?.status === "completed",
    )
    if (!part || part.type !== "tool" || part.state.status !== "completed") return []
    const value = part.state.metadata?.todos ?? part.state.input.todos
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is TodoItem =>
        item != null &&
        typeof item.content === "string" &&
        ["pending", "in_progress", "completed", "cancelled"].includes(item.status),
    )
  })
  const stats = createMemo(() => todoStats(items()))
  const label = () => language.t("task.todos.progress", { done: String(stats().done), total: String(stats().total) })
  return (
    <Show when={items().length > 0}>
      <section
        ref={root}
        class="turn-todos"
        data-floating={props.floating ? "" : undefined}
        data-open={open() ? "" : undefined}
      >
        <Button
          variant="ghost"
          size="small"
          class="turn-todos-toggle"
          aria-label={stats().all ? language.t("task.todos.allDone", { count: String(stats().total) }) : label()}
          aria-expanded={open()}
          aria-controls={uid}
          onClick={() => setOpen(!open())}
        >
          <Icon name={open() ? "chevron-down" : stats().all ? "circle-check" : "chevron-right"} size="small" />
          <span>{label()}</span>
        </Button>
        <Show when={open()}>
          <div id={uid} class="turn-todos-list" role="region" aria-label={language.t("task.todos.title")}>
            <For each={items()}>
              {(item) => (
                <div
                  class="turn-todos-row"
                  data-status={item.status}
                  title={item.status === "completed" ? language.t("task.todos.done") : undefined}
                >
                  <Show
                    when={item.status === "in_progress"}
                    fallback={
                      <Icon
                        name={
                          item.status === "completed"
                            ? "circle-check"
                            : item.status === "cancelled"
                              ? "close-small"
                              : "circle-dashed"
                        }
                        size="small"
                      />
                    }
                  >
                    <Spinner />
                  </Show>
                  <span dir="auto">{item.content}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  )
}
