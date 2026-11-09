/** @jsxImportSource solid-js */

/**
 * ChatView component
 * Main chat container that combines all chat components
 */

import { type Component, type JSX, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { AgentAvatarPalette } from "@kilocode/kilo-ui/agent-avatar"
import { useData } from "@kilocode/kilo-ui/context/data"
import { useClipboard } from "@kilocode/kilo-ui/context/clipboard"
import { Button } from "@kilocode/kilo-ui/button"
import { showToast } from "@kilocode/kilo-ui/toast"
import { TaskHeader } from "./TaskHeader"
import { MessageList } from "./MessageList"
import { PromptInput } from "./PromptInput"
import { ContextUsagePanel } from "./ContextUsagePanel"
import type { ManagerContext } from "../../utils/shortcut-hint"
import { PermissionDock } from "./PermissionDock"
import { SwarmBoardButton, useSwarmBoard } from "./SwarmBoard"
import { SessionChanges } from "./SessionChanges"
import { createSessionReview } from "./session-review"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { StartupErrorBanner } from "./StartupErrorBanner"
import { SessionTabStrip } from "./SessionTabStrip"
import { useSession } from "../../context/session"
import { useLocalTabs } from "../../context/local-tabs"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import { useWorktreeMode } from "../../context/worktree-mode"
import { useServer } from "../../context/server"
import { TranscriptSearchProvider } from "../../context/transcript-search"
import { isPromptBlocked, isSuggesting, isQuestioning } from "./prompt-input-utils"
import { taskChildren } from "./background-agents"
import { pollBackgroundJobs } from "./background-jobs"
import { showTabStrip } from "../../utils/local-tabs"
import { forcesExternalBrowser } from "../../utils/link-modifier"
import { isTextControl } from "../../utils/focus"
import type { WorktreeReference } from "../../hooks/file-mention-utils"

interface ChatViewProps {
  projectId?: string
  onSelectSession?: (id: string) => void
  isSessionOpen?: (id: string) => boolean
  onShowHistory?: () => void
  onForkMessage?: (sessionId: string, messageId: string) => void
  onForkSession?: (sessionId: string) => void
  readonly?: boolean
  /** Whether this chat owns actionable prompt controls. Defaults to true. */
  interactivePrompts?: boolean
  /** Enable moving sidebar tabs to a worktree from their context menu. */
  continueInWorktree?: boolean
  worktree?: boolean
  onUpdateBase?: () => void
  promptBoxId?: string
  terminalContext?: () => string | undefined
  worktrees?: () => WorktreeReference[]
  deferFocusToQuestion?: () => boolean
  pendingSessionID?: string
  focusOnDraftChange?: () => boolean
  onFocusChange?: (focused: boolean) => void
  emptyState?: () => JSX.Element
  introduction?: boolean
  resolveEmbeddedTerminal?: (context?: string) => Promise<string | undefined>
  /** Agent Manager state for the prompt shortcut hint. */
  manager?: () => ManagerContext | undefined
  contextUsage?: () => boolean
  onContextUsage?: () => void
}

export const ChatView: Component<ChatViewProps> = (props) => {
  const session = useSession()
  const data = useData()
  const clipboard = useClipboard()
  const vscode = useVSCode()
  const language = useLanguage()
  const worktreeMode = useWorktreeMode()
  const server = useServer()
  const tabs = useLocalTabs()
  // Show "Show Changes" only in the standalone sidebar, not inside Agent Manager
  const isSidebar = () => worktreeMode === undefined
  const pendingSessionID = () => props.pendingSessionID ?? tabs?.pending()
  const ownsPrompts = () => props.interactivePrompts !== false

  const id = () => session.currentSessionID()
  const [usage, setUsage] = createSignal(false)
  const board = useSwarmBoard({
    get projectId() {
      return props.projectId
    },
    get readonly() {
      return props.readonly
    },
  })
  createEffect(() => {
    id()
    props.projectId
    setUsage(false)
  })
  const toggleUsage = () => {
    if (props.onContextUsage) return props.onContextUsage()
    setUsage((value) => !value)
  }
  const review = createSessionReview(
    id,
    () => session.status(),
    () => ownsPrompts() && !props.readonly,
    () => props.projectId,
  )
  const dialog = useDialog()
  const reject = (action: "reject" | "undo-all", file?: string) => {
    const sessionID = id()
    const project = props.projectId
    const revision = review.revision()
    const valid = () =>
      id() === sessionID &&
      props.projectId === project &&
      review.revision() === revision &&
      session.status() === "idle" &&
      !review.busy()
    dialog.show(() => (
      <Dialog title={language.t("review.undo")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("review.sessionWarning")}</span>
          <div class="dialog-confirm-actions">
            <Button variant="secondary" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              disabled={!valid()}
              onClick={() => {
                if (!valid()) return
                dialog.close()
                review.decide(action, file)
              }}
            >
              {language.t(action === "undo-all" ? "review.undoAll" : "review.undo")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }
  const openLink = (event: MouseEvent) => {
    if (!data.openUrl || !(event.target instanceof Element)) return
    const anchor = event.target.closest("a[href]")
    if (!anchor || anchor.closest(".chat-view") !== event.currentTarget) return
    const url = anchor.getAttribute("href") ?? ""
    if (!/^https?:\/\//i.test(url)) return
    // Claim the click before renderer handlers and VS Code's window listener.
    event.preventDefault()
    event.stopPropagation()
    if (forcesExternalBrowser(event, data.browserLinks)) {
      vscode.postMessage({ type: "openExternal", url })
      return
    }
    data.openUrl(url, id())
  }
  // Keep the swarm board's background job replies fresh.
  pollBackgroundJobs()
  const goal = () => session.currentSession()?.goal

  const [editable, setEditable] = createSignal(false)
  const [editing, setEditing] = createSignal<{ sessionID: string; messageID: string }>()
  const edit = (sessionID: string, messageID: string) => {
    if (props.readonly || !editable() || editing()) return
    setEditing({ sessionID, messageID })
  }
  let view: HTMLDivElement | undefined

  // Permissions and questions scoped to this session's family (self + subagents).
  // Each ChatView only sees its own session tree — no cross-session leakage.
  // Memoized so the BFS walk in sessionFamily() runs once per reactive update,
  // not once per accessor call (questionRequest, permissionRequest, blocked all read these).
  const familyPermissions = createMemo(() => session.scopedPermissions(id()))
  const familyQuestions = createMemo(() => session.scopedQuestions(id()))
  const familySuggestions = createMemo(() => session.scopedSuggestions(id()))
  // Non-tool questions (standalone, not from the question tool) render inline in
  // the message list since they don't have an associated tool part in the conversation.
  // Tool-linked questions render inline at their tool part position via AssistantMessage.
  const standaloneQuestions = createMemo(() => familyQuestions().filter((q) => !q.tool))
  const standaloneSuggestions = createMemo(() => familySuggestions().filter((s) => !s.tool))
  const permissionRequest = () => familyPermissions().at(0)
  // Questions and suggestions do not block input; permissions do.
  // Pending questions and suggestions are auto-dismissed in sendMessage/sendCommand.
  const blocked = () => isPromptBlocked(familyPermissions().length)
  // Session is busy only because a suggestion tool call is pending — prompt should behave as idle
  const suggesting = () => isSuggesting(blocked(), familySuggestions().length)
  // Session is busy only because a question tool call is pending — prompt should behave as idle
  const questioning = () => isQuestioning(blocked(), familyQuestions().length)
  const dock = () =>
    ownsPrompts() &&
    (!props.readonly || !!goal() || !!permissionRequest() || session.submitting() || session.status() !== "idle")

  onMount(() => {
    const copy = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        (event.key.toLowerCase() !== "c" && event.keyCode !== 67) ||
        isTextControl(document.activeElement)
      )
        return
      const selection = document.getSelection()
      const region = view?.querySelector(".chat-messages")
      if (
        !selection ||
        selection.isCollapsed ||
        !view?.contains(selection.anchorNode) ||
        !view.contains(selection.focusNode) ||
        (!region?.contains(selection.anchorNode) && !region?.contains(selection.focusNode))
      )
        return
      const text = selection.toString()
      if (!text) return
      // Stop VS Code's native-copy round trip from refocusing the prompt first.
      event.preventDefault()
      event.stopPropagation()
      void Promise.resolve(clipboard.write(text)).catch((err: unknown) => {
        console.error("[Dustcode] Failed to copy selected chat text", err)
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
    }
    document.addEventListener("keydown", copy, true)
    onCleanup(() => document.removeEventListener("keydown", copy, true))
  })

  onMount(() => {
    if (props.readonly || !ownsPrompts()) return
    const handler = (e: KeyboardEvent) => {
      if (
        e.key !== "Escape" ||
        (!session.submitting() && session.status() === "idle" && !goal()?.active) ||
        e.defaultPrevented
      )
        return
      e.preventDefault()
      session.abort()
    }
    document.addEventListener("keydown", handler)
    onCleanup(() => document.removeEventListener("keydown", handler))
  })

  const decide = (
    permissionID: string,
    response: "once" | "always" | "reject",
    approvedAlways: string[],
    deniedAlways: string[],
    feedback?: string,
  ) => {
    const perm = permissionRequest()
    if (!perm || perm.id !== permissionID || session.respondingPermissions().has(permissionID)) return
    session.respondToPermission(permissionID, response, approvedAlways, deniedAlways, feedback)
  }

  // Sibling-aware avatar colors for every subagent spawned by this session.
  const siblings = createMemo(() => (id() ? taskChildren(session.getSessionToolParts(id()!)) : []))

  return (
    <AgentAvatarPalette ids={siblings()}>
      <TranscriptSearchProvider>
        <div
          class="chat-view"
          data-browser-links={data.browserLinks ? "true" : undefined}
          ref={(node) => {
            view = node
            node.addEventListener("click", openLink, true)
            onCleanup(() => node.removeEventListener("click", openLink, true))
          }}
        >
          <Show when={isSidebar() && !props.readonly && tabs && showTabStrip(tabs.ids())}>
            <SessionTabStrip
              onMoveToWorktree={
                props.continueInWorktree === true && server.gitInstalled()
                  ? (sessionId) => vscode.postMessage({ type: "continueInWorktree", sessionId })
                  : undefined
              }
            />
          </Show>
          <TaskHeader />
          <div class="chat-messages-wrapper">
            <div class="chat-messages">
              <MessageList
                onSelectSession={props.onSelectSession}
                isSessionOpen={props.isSessionOpen}
                onShowHistory={props.onShowHistory}
                onForkMessage={props.onForkMessage}
                onEditMessage={edit}
                queuedDisabled={editing()?.sessionID === id() && !!editing()}
                editDisabled={!editable() || !!editing()}
                questions={standaloneQuestions}
                suggestions={standaloneSuggestions}
                readonly={props.readonly}
                interactivePrompts={ownsPrompts()}
                emptyState={props.emptyState}
                introduction={props.introduction}
                announce={isSidebar()}
                sessionID={pendingSessionID}
              />
            </div>
          </div>

          <Show when={dock()}>
            <div class="chat-input">
              <Show when={server.connectionState() === "error" && server.errorMessage()}>
                <StartupErrorBanner errorMessage={server.errorMessage()!} errorDetails={server.errorDetails()!} />
              </Show>
              <Show when={permissionRequest()} keyed>
                {(perm) => (
                  <PermissionDock
                    request={perm}
                    responding={session.respondingPermissions().has(perm.id)}
                    onDecide={decide}
                  />
                )}
              </Show>
              <Show when={ownsPrompts() && !props.readonly}>
                <SessionChanges
                  files={review.files().map((file) => ({
                    file: file.file,
                    additions: file.additions,
                    deletions: file.deletions,
                    status: file.reviewStatus,
                    rejectable: file.rejectable,
                  }))}
                  loading={review.loading()}
                  busy={review.busy()}
                  error={review.error()}
                  disabled={session.status() !== "idle"}
                  onAccept={(file) => review.decide("accept", file)}
                  onReject={(file) => reject("reject", file)}
                  onKeepAll={() => review.decide("accept-all")}
                  onUndoAll={() => reject("undo-all")}
                  onReview={(file) => vscode.postMessage({ type: "openChanges", file })}
                  onRetry={review.refresh}
                />
                <PromptInput
                  leadingAction={<SwarmBoardButton state={board} active={true} />}
                  contextUsagePanel={<ContextUsagePanel onClose={toggleUsage} />}
                  contextUsage={props.onContextUsage ? props.contextUsage?.() : usage()}
                  onContextUsage={toggleUsage}
                  blocked={blocked}
                  edit={editing()}
                  onEditComplete={() => setEditing(undefined)}
                  onEditReady={setEditable}
                  suggesting={suggesting}
                  questioning={questioning}
                  worktree={props.worktree}
                  onUpdateBase={props.onUpdateBase}
                  boxId={props.promptBoxId}
                  terminalContext={props.terminalContext}
                  worktrees={props.worktrees}
                  deferFocusToQuestion={props.deferFocusToQuestion}
                  pendingSessionID={pendingSessionID()}
                  focusOnDraftChange={props.focusOnDraftChange}
                  onFocusChange={props.onFocusChange}
                  resolveEmbeddedTerminal={props.resolveEmbeddedTerminal}
                  manager={props.manager}
                />
              </Show>
            </div>
          </Show>
        </div>
      </TranscriptSearchProvider>
    </AgentAvatarPalette>
  )
}
