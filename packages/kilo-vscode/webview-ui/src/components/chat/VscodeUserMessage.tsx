import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { UserMessageDisplay } from "@kilocode/kilo-ui/message-part"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { partFeedback } from "../../../../src/shared/browser-feedback"
import { injectedView } from "../../../../src/shared/injected-prompt"
import type { Message, Part, TextPart } from "../../types/messages"
import { revertPromptState } from "../../context/session-utils"
import { MessageImage } from "./MessageImage"
import { BrowserReferences } from "./BrowserReferences"
import { ReviewComments } from "./ReviewComments"
import { useLanguage } from "../../context/language"
import "./user-message.css"

interface VscodeUserMessageProps {
  message: Message
  parts: Part[]
  interrupted?: boolean
  queued?: boolean
  onEdit?: () => void
  onResubmit?: (text: string) => Promise<boolean>
  queuedDisabled?: boolean
  editDisabled?: boolean
  onDelete?: () => void
  onFork?: () => void
  onRevert?: () => void
  revertDisabled?: boolean
  onSelectSession?: (id: string) => boolean | void
  isSessionOpen?: (id: string) => boolean
}

const ATTRIBUTION = /\n\n<!-- kilo-agent-manager source=([^ ]+) -->$/

export const VscodeUserMessage: Component<VscodeUserMessageProps> = (props) => {
  const language = useLanguage()
  // Cron and wakeup fires are synthetic parts flagged `metadata.wakeup`; show them as scheduled notes.
  const text = createMemo(() =>
    props.parts.find(
      (part): part is TextPart =>
        part.type === "text" &&
        (!part.synthetic || (part.metadata as { wakeup?: unknown } | undefined)?.wakeup === true),
    ),
  )
  const attribution = createMemo(() => text()?.text.match(ATTRIBUTION)?.[1])
  const feedback = createMemo(() => {
    const part = text()
    if (!part) return undefined
    return partFeedback(part.metadata, part.text)
  })
  const full = createMemo(() => (feedback()?.body ?? text()?.text)?.replace(ATTRIBUTION, ""))
  const view = createMemo(() => {
    const value = full()
    if (value == null) return undefined
    if (attribution()) return { label: "Sent by Dustcode from another session" }
    return injectedView(text()?.metadata, value)
  })
  const [open, setOpen] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const editable = () => !!props.onResubmit && !view() && !props.queuedDisabled
  const edit = () => {
    if (!editable() || pending()) return
    setDraft(revertPromptState(props.parts).text)
    setEditing(true)
  }
  const submit = async () => {
    if (pending() || !props.onResubmit || (!draft().trim() && !props.parts.some((part) => part.type === "file"))) return
    setPending(true)
    try {
      if (await props.onResubmit(draft())) setEditing(false)
    } finally {
      setPending(false)
    }
  }
  const collapsed = createMemo(() => !!view()?.preview && !open())
  const body = createMemo(() => (collapsed() ? view()?.preview : full()))
  const openSource = () => {
    const id = attribution()
    if (!id || !props.onSelectSession) return
    props.onSelectSession(id)
  }

  // Build the header nodes once. UserMessageDisplay reads these props in
  // several Show conditions, and a JSX getter would rebuild a detached subtree
  // (with mounted Tooltip effects) on every read.
  const bubble = createMemo(() => {
    if (!view()) return undefined
    return (
      <div class="agent-manager-attribution" data-collapsed={collapsed() ? "" : undefined} dir="ltr">
        <span class="agent-manager-attribution-label">{view()?.label}</span>
        <Show when={attribution()}>
          <Show
            when={props.onSelectSession && props.isSessionOpen?.(attribution() ?? "") !== false}
            fallback={<span class="agent-manager-attribution-status">Session not open</span>}
          >
            <Tooltip value="Go to originating session" placement="top">
              <IconButton
                icon="square-arrow-top-right"
                size="small"
                variant="ghost"
                class="agent-manager-attribution-link"
                aria-label="Go to originating session"
                onClick={openSource}
              />
            </Tooltip>
          </Show>
        </Show>
        <Show when={view()?.preview}>
          <button
            type="button"
            class="agent-manager-attribution-toggle"
            aria-expanded={open()}
            onClick={() => setOpen((value) => !value)}
          >
            {open() ? "Hide prompt" : "Show prompt"}
          </button>
        </Show>
      </div>
    )
  })
  const header = createMemo(() => {
    if (!feedback()) return undefined
    return (
      <>
        <Show when={feedback()?.review}>
          {(review) => (
            <ReviewComments comments={review().comments} sessionID={props.message.sessionID} variant="message" />
          )}
        </Show>
        <Show when={feedback()?.browserFeedback}>
          {(browser) => <BrowserReferences references={browser().references} variant="message" />}
        </Show>
      </>
    )
  })

  return (
    <div
      class="vscode-user-message"
      data-editable={editable() ? "" : undefined}
      onClick={(event) => {
        if (editing() || !(event.target instanceof Element)) return
        if (event.target.closest("button, a, [data-highlight], [data-slot='user-message-attachment']")) return
        if (!event.target.closest('[data-slot="user-message-text"]')) return
        if (window.getSelection()?.toString()) return
        edit()
      }}
    >
      <Show
        when={editing()}
        fallback={
          <>
            <UserMessageDisplay
              message={props.message as unknown as Parameters<typeof UserMessageDisplay>[0]["message"]}
              parts={props.parts as unknown as Parameters<typeof UserMessageDisplay>[0]["parts"]}
              text={body()}
              copyText={view() ? full() : feedback() ? text()?.text : undefined}
              bubbleHeader={bubble()}
              header={header()}
              interrupted={props.interrupted}
              queued={props.queued}
              edit={
                props.onEdit
                  ? { label: language.t("common.edit"), onClick: props.onEdit, disabled: props.editDisabled }
                  : undefined
              }
              queuedDisabled={props.queuedDisabled}
              onDelete={props.onDelete}
              onFork={props.onFork}
              onRevert={props.onRevert}
              revertDisabled={props.revertDisabled}
              renderAttachment={(file) => {
                if (!file.mime.startsWith("image/")) return undefined
                return <MessageImage url={file.url} filename={file.filename} />
              }}
            />
            <Show when={editable()}>
              <IconButton
                class="user-message-edit-trigger"
                icon="edit"
                size="small"
                variant="ghost"
                aria-label={language.t("common.edit")}
                onClick={edit}
              />
            </Show>
          </>
        }
      >
        <div class="user-message-editor" aria-busy={pending()}>
          <div class="user-message-editor-images">
            <For each={props.parts.filter((part) => part.type === "file" && part.mime.startsWith("image/"))}>
              {(part) => part.type === "file" && <MessageImage url={part.url} filename={part.filename} />}
            </For>
          </div>
          <TextField
            multiline
            autofocus
            label={language.t("common.edit")}
            hideLabel
            value={draft()}
            onChange={setDraft}
            disabled={pending()}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === "Escape" && !pending()) {
                event.preventDefault()
                setEditing(false)
              }
              if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
              event.preventDefault()
              void submit()
            }}
          />
          <div class="user-message-editor-actions">
            <span class="user-message-editor-model">{props.message.model?.modelID}</span>
            <Button
              variant="ghost"
              size="small"
              data-action="cancel-edit"
              disabled={pending()}
              onClick={() => setEditing(false)}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="small"
              data-action="resubmit-message"
              disabled={pending() || (!draft().trim() && !props.parts.some((part) => part.type === "file"))}
              onClick={() => void submit()}
            >
              {language.t("prompt.action.send")}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  )
}
