/** @jsxImportSource solid-js */

/**
 * One row between the transcript and composer. Both working and action states
 * stay mounted in the same grid cell; the inactive one is hidden and out of
 * flow, so the row is exactly as tall as the visible state. Blocking surfaces
 * hide both.
 *
 * Background agents can keep working after the main agent's turn ends, so the
 * agent stack follows the same pattern as the goal: in the working state it
 * leads the spinner out of flow, as the goal badge trails it, so the spinner
 * stays centered. In the actions state it takes a line that has room for it.
 * On a surface without actions it keeps the row alive until the agents finish.
 *
 * The todo tracker lives with the sticky prompt now; this dock only owns
 * working status, background agents, and session actions.
 *
 * The board button follows the stack: what the agents say sits next to who
 * works. The board belongs to the session, so the button stays in the same
 * place when the agents are cleared or the view reloads.
 */
import { type Component, type JSX, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { useSession } from "../../context/session"
import { WorkingIndicator } from "../shared/WorkingIndicator"
import { showsWorking } from "../shared/working-indicator-utils"
import { running } from "../../context/session-timing"
import { useGoalDock } from "./goal/useGoalDock"
import { AgentStack, useAgentStack } from "./AgentStack"
import { SwarmBoardButton, useSwarmBoard } from "./SwarmBoard"
import { stackFit, stackPlace, stackWidth } from "./background-agents"

interface SessionDockProps {
  /** Idle-state content. Renders nothing when no action applies. */
  actions?: (goal: () => JSX.Element, agents: JSX.Element, todos: JSX.Element) => JSX.Element
  /** Whether idle-state content exists for this surface. */
  hasActions?: () => boolean
  /** True while a permission, question, suggestion, or requirement owns the row. */
  blocked?: boolean
  onScrollToBottom?: () => void
  readonly?: boolean
  projectId?: string
}

export const SessionDock: Component<SessionDockProps> = (props) => {
  const session = useSession()
  const stack = useAgentStack()
  const board = useSwarmBoard({
    get readonly() {
      return props.readonly
    },
    get projectId() {
      return props.projectId
    },
  })
  const working = () =>
    showsWorking(
      session.status(),
      session.submitting(),
      !!props.blocked,
      running(session.currentSession()?.goal, session.status(), session.closeReason()),
    )
  const actions = () => !working() && !props.blocked && (props.hasActions?.() ?? false)
  const visible = () => !props.readonly && stack.shown()
  // The stack, the board button, or both lead the spinner.
  const front = () => visible() || board.shown()
  const agents = () => !working() && !actions() && !props.blocked && front()
  const active = () => working() || actions() || agents()
  const goal = useGoalDock({
    working,
    actions,
    get readonly() {
      return props.readonly
    },
  })

  // Mirrors the goal badge: the goal trails the centered spinner and the stack
  // leads it, both out of flow. The lane reserves the stack width on both
  // sides, so the spinner stays centered and the label truncates before the
  // stack leaves the row. The avatar count depends only on the dock width, so
  // the reserve cannot feed back into it, and both states show the same stack.
  const [dock, setDock] = createSignal<HTMLDivElement>()
  const [lane, setLane] = createSignal<HTMLDivElement>()
  const [lead, setLead] = createSignal<HTMLDivElement>()
  const [max, setMax] = createSignal(1)

  createEffect(() => {
    const el = dock()
    if (!visible() || !el || typeof ResizeObserver === "undefined") return
    const count = stack.items().length
    const measure = () => setMax(stackFit((el.clientWidth - 200) / 2, count))
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    onCleanup(() => observer.disconnect())
    measure()
  })

  createEffect(() => {
    const content = lane()
    const el = lead()
    if (!working() || !content || !el || typeof ResizeObserver === "undefined") return
    const measure = () => content.style.setProperty("--session-lead", `${Math.ceil(el.offsetWidth)}px`)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    onCleanup(() => {
      observer.disconnect()
      content.style.removeProperty("--session-lead")
    })
    measure()
  })

  const idleTodo = <></>

  const [room, setRoom] = createSignal(3)

  // Created once, so the actions row can rebuild around it without replaying
  // the stack's open animation.
  const idleStack = (
    <>
      <Show when={visible()}>
        <AgentStack state={stack} max={Math.min(max(), room())} rule={!board.shown()} />
      </Show>
      <SwarmBoardButton state={board} rule active={actions()} />
    </>
  )

  // The actions row wraps. Put the stack on a line that has room for it, so
  // it does not push an action onto a new line and change the dock height.
  // Only `order` changes, and only when the slot changes, so the observers
  // settle after one pass.
  const [idle, setIdle] = createSignal<HTMLDivElement>()

  createEffect(() => {
    const state = idle()
    if (!actions() || !visible() || !state || typeof ResizeObserver === "undefined") return
    const place = () => {
      const row = state.querySelector<HTMLElement>(".session-actions-row")
      const item = row?.querySelector<HTMLElement>(':scope > [data-component="agent-stack"]')
      if (!row || !item) return
      // The board button travels with the stack, right after it.
      const tail = row.querySelector<HTMLElement>(':scope > [data-component="board-trigger"]')
      const all = [...row.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
      const kids = all.filter((child) => child !== item && child !== tail)
      // Boxes as painted, including a running glide, so a new glide starts
      // where the eye last saw each item.
      const first = new Map(all.map((child) => [child, child.getBoundingClientRect()]))
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
      const width = row.clientWidth
      // Lines from layout boxes, not painted ones: offset metrics ignore the
      // glide transforms, so a running glide cannot feed back into placement.
      // Take the stack out of flow with `position`, not `display: none`. A
      // forced layout under `display: none` cancels the avatar pulses, so they
      // restart and jump out of phase on every pass.
      const prev = item.style.position
      item.style.position = "absolute"
      if (tail) tail.style.position = "absolute"
      const lines: { last: number; used: number; top: number }[] = []
      kids.forEach((child, index) => {
        const line = lines.at(-1)
        // Items on one line differ by a pixel or so in height, so compare
        // their tops with a tolerance.
        if (line && Math.abs(line.top - child.offsetTop) < child.offsetHeight / 2) {
          line.last = index
          line.used += gap + child.offsetWidth
          return
        }
        lines.push({ last: index, used: child.offsetWidth, top: child.offsetTop })
      })
      item.style.position = prev
      tail?.style.removeProperty("position")
      // The button, plus the spacing and gap that follow it.
      const extra = tail ? tail.offsetWidth + 4 + gap : 0
      // Show only as many avatars as the roomiest line can take. Plan with the
      // target width, not the measured one, which changes while it animates.
      const count = stack.items().length
      const room = Math.max(0, ...lines.map((line) => width - line.used))
      const size = Math.min(max(), stackFit(room - gap - 1 - extra, count), Math.max(1, count))
      setRoom(size)
      const slot = stackPlace(
        lines.map((line) => line.used),
        width,
        stackWidth(size, count) + gap + 1 + extra,
      )
      kids.forEach((child, index) => {
        const order = String(index * 2 + 2)
        if (child.style.order !== order) child.style.order = order
      })
      const order = slot.end ? String((lines.at(slot.line)?.last ?? 0) * 2 + 3) : "0"
      const side = slot.end ? "end" : "start"
      if (tail) {
        const next = String(Number(order) + 1)
        if (tail.style.order !== next) tail.style.order = next
        tail.dataset.place = side
      }
      if (item.style.order === order && item.dataset.place === side) return
      // The first placement happens while the stack opens, so only later moves glide.
      const moved = item.dataset.place != null
      item.style.order = order
      item.dataset.place = side
      if (moved) glide(all, first)
    }
    const resize = new ResizeObserver(place)
    const mutate = new MutationObserver(place)
    resize.observe(state)
    mutate.observe(state, { childList: true, subtree: true })
    onCleanup(() => {
      resize.disconnect()
      mutate.disconnect()
      for (const child of state.querySelectorAll<HTMLElement>(".session-actions-row > *"))
        child.style.removeProperty("order")
      state.querySelector('.session-actions-row > [data-component="board-trigger"]')?.removeAttribute("data-place")
    })
    place()
  })

  return (
    <div class="session-dock" ref={setDock} data-component="session-dock" data-active={active() ? "" : undefined}>
      <div class="session-dock-state" ref={goal.row} data-active={working() ? "" : undefined} aria-hidden={!working()}>
        <div
          class="session-working"
          ref={(el) => {
            goal.lane(el)
            setLane(el)
          }}
          data-goal={goal.running() ? "" : undefined}
          data-agents={front() ? "" : undefined}
        >
          <Show when={front()}>
            <div class="session-working-lead" ref={setLead}>
              <Show when={visible()}>
                <AgentStack state={stack} max={max()} rule={!board.shown()} />
              </Show>
              <SwarmBoardButton state={board} rule active={working()} />
            </div>
          </Show>
          <WorkingIndicator onScrollToBottom={props.onScrollToBottom} />
          <div class="session-working-trail">{goal.status()}</div>
        </div>
      </div>
      <div class="session-dock-state" ref={setIdle} data-active={actions() ? "" : undefined} aria-hidden={!actions()}>
        {props.actions?.(goal.control, idleStack, idleTodo)}
      </div>
      <div class="session-dock-state" data-active={agents() ? "" : undefined} aria-hidden={!agents()}>
        <div class="session-agents">
          <Show when={visible()}>
            <AgentStack state={stack} label />
          </Show>
          <SwarmBoardButton state={board} active={agents()} />
        </div>
      </div>
    </div>
  )
}

/**
 * Slide items from their old boxes to their new ones after a reorder, so the
 * stack moving to another line reads as one motion instead of a jump.
 */
function glide(items: HTMLElement[], first: Map<HTMLElement, DOMRect>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  if (document.body.classList.contains("vscode-reduce-motion")) return
  for (const item of items) {
    const prev = first.get(item)
    if (!prev) continue
    const next = item.getBoundingClientRect()
    const x = prev.left - next.left
    const y = prev.top - next.top
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue
    item.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], {
      duration: 260,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    })
  }
}
