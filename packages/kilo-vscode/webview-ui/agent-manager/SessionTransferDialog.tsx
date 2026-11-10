import { createSignal, For, onCleanup, Show, type Component } from "solid-js"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { Button } from "@kilocode/kilo-ui/button"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { Checkbox } from "@kilocode/kilo-ui/checkbox"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { useLanguage } from "../src/context/language"
import { useVSCode } from "../src/context/vscode"
import type {
  SessionTransferAction,
  SessionTransferReply,
  SessionTransferRequest,
} from "../../src/shared/session-transfer"
import "./session-transfer.css"

export const SessionTransferDialog: Component<{
  projectId: string
  sourceSessionId: string
  sourceWorktreeId: string | null
  action: SessionTransferAction
  create?: boolean
  onCommitted: (result: NonNullable<SessionTransferReply["result"]>) => void
  onClose: () => void
}> = (props) => {
  const vscode = useVSCode()
  const { t } = useLanguage()
  const [targets, setTargets] = createSignal<NonNullable<SessionTransferReply["targets"]>>([])
  const [files, setFiles] = createSignal<string[]>([])
  const [selected, setSelected] = createSignal<string[]>([])
  const [target, setTarget] = createSignal("")
  const [create, setCreate] = createSignal(props.create !== false)
  const [enabled, setEnabled] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [branch, setBranch] = createSignal("")
  const [head, setHead] = createSignal("")
  const [conflicts, setConflicts] = createSignal<string[]>([])
  const [preview, setPreview] = createSignal<SessionTransferReply["preview"]>()
  const [busy, setBusy] = createSignal(true)
  const [error, setError] = createSignal("")
  const [uncertain, setUncertain] = createSignal(false)
  let operation = crypto.randomUUID()
  let pending = ""
  const send = (phase: SessionTransferRequest["phase"]) => {
    if (busy() && pending) return
    if (phase === "preview") operation = crypto.randomUUID()
    pending = crypto.randomUUID()
    setBusy(true)
    setError("")
    vscode.postMessage({
      type: "agentManager.sessionTransfer",
      phase,
      projectId: props.projectId,
      sourceSessionId: props.sourceSessionId,
      sourceWorktreeId: props.sourceWorktreeId,
      action: props.action,
      operationID: operation,
      requestId: pending,
      targetWorktreeId: target() || undefined,
      create: create(),
      selectedFiles: enabled() ? selected() : [],
      branch: branch() || undefined,
      revision: preview()?.revision,
      fingerprint: preview()?.fingerprint,
    })
  }
  const stop = vscode.onMessage((message) => {
    if (
      message.type !== "agentManager.sessionTransferResult" ||
      message.projectId !== props.projectId ||
      message.sourceSessionId !== props.sourceSessionId ||
      message.requestId !== pending ||
      message.operationID !== operation
    )
      return
    setBusy(false)
    if (message.error) {
      setError(message.error)
      setConflicts(message.paths ?? [])
      if (message.code === "stale") {
        setPreview(undefined)
        setUncertain(false)
      } else {
        setUncertain((message.phase === "commit" || message.phase === "status") && message.code !== "conflict")
      }
      return
    }
    if (message.targets)
      setTargets((rows) => [...new Map([...rows, ...message.targets!].map((row) => [row.id, row])).values()])
    if (message.head) setHead(message.head)
    if (message.files) setFiles(message.files)
    if (message.preview) setPreview(message.preview)
    if (message.targetWorktreeId) {
      setTarget(message.targetWorktreeId)
      setCreate(false)
    }
    if (message.result) {
      props.onCommitted(message.result)
      props.onClose()
    }
  })
  onCleanup(stop)
  send("targets")
  return (
    <Dialog
      title={t(props.action === "move" ? "agentManager.transfer.moveTitle" : "agentManager.transfer.copyTitle")}
      size="large"
    >
      <div class="am-transfer" data-transfer-dialog>
        <p>
          {t(
            props.action === "move" ? "agentManager.transfer.moveDescription" : "agentManager.transfer.copyDescription",
          )}
        </p>
        <Show
          when={!preview()}
          fallback={
            <>
              <p>
                {t("agentManager.transfer.destination")}:{" "}
                <strong>{targets().find((row) => row.id === target())?.name}</strong>
              </p>
              <p>
                {preview()?.files.length
                  ? t("agentManager.transfer.selected", { count: preview()!.files.length })
                  : t("agentManager.transfer.chatOnly")}
              </p>
              <p>{t("agentManager.transfer.baseline")}</p>
            </>
          }
        >
          <TextField
            label={t("agentManager.transfer.search")}
            hideLabel
            placeholder={t("agentManager.transfer.search")}
            value={query()}
            onChange={setQuery}
          />
          <div class="am-transfer-targets" role="group" aria-label={t("agentManager.transfer.destination")}>
            <Button
              variant={create() ? "primary" : "secondary"}
              disabled={busy()}
              onClick={() => {
                setCreate(true)
                setTarget("")
              }}
            >
              {t("agentManager.transfer.new")}
            </Button>
            <For
              each={targets().filter((row) => `${row.name} ${row.path}`.toLowerCase().includes(query().toLowerCase()))}
            >
              {(row) => (
                <Button
                  variant={!create() && target() === row.id ? "primary" : "secondary"}
                  disabled={busy()}
                  onClick={() => {
                    setTarget(row.id)
                    setCreate(false)
                  }}
                  title={row.path}
                >
                  {row.name} <span>{row.path}</span>
                </Button>
              )}
            </For>
            <Show when={!busy() && !targets().length}>
              <p>{t("agentManager.transfer.empty")}</p>
            </Show>
            <Show
              when={
                targets().length > 0 &&
                !targets().some((row) => `${row.name} ${row.path}`.toLowerCase().includes(query().toLowerCase()))
              }
            >
              <p>{t("agentManager.transfer.noMatches")}</p>
            </Show>
          </div>
          <Show when={create()}>
            <TextField
              label={t("agentManager.transfer.branch")}
              value={branch()}
              onChange={setBranch}
              disabled={busy()}
            />
            <p>{t("agentManager.transfer.head", { head: head().slice(0, 12) })}</p>
          </Show>
          <Show when={files().length}>
            <Checkbox
              checked={enabled()}
              disabled={busy()}
              onChange={(value) => {
                setEnabled(value)
                setSelected([])
              }}
            >
              {t("agentManager.transfer.files")}
            </Checkbox>
            <p>{t("agentManager.transfer.fileNotice")}</p>
            <Show when={enabled()}>
              <div class="am-transfer-files">
                <For each={files()}>
                  {(file) => (
                    <Checkbox
                      checked={selected().includes(file)}
                      disabled={busy()}
                      onChange={() =>
                        setSelected((rows) =>
                          rows.includes(file) ? rows.filter((row) => row !== file) : [...rows, file],
                        )
                      }
                    >
                      {file}
                    </Checkbox>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
        <Show when={conflicts().length}>
          <For each={conflicts()}>{(file) => <p>{file}</p>}</For>
          <Button
            disabled={busy()}
            onClick={() => {
              setSelected([])
              setEnabled(false)
              setPreview(undefined)
              setConflicts([])
              setError("")
            }}
          >
            {t("agentManager.transfer.chat")}
          </Button>
          <Button
            disabled={busy()}
            onClick={() => {
              setPreview(undefined)
              setConflicts([])
              setError("")
            }}
          >
            {t("agentManager.transfer.choose")}
          </Button>
        </Show>
        <Show when={error()}>
          <div role="alert" class="am-apply-alert">
            {error()}
          </div>
        </Show>
        <div class="am-transfer-footer">
          <Button variant="secondary" disabled={busy()} onClick={props.onClose}>
            {t("agentManager.transfer.cancel")}
          </Button>
          <Show
            when={preview()}
            fallback={
              <Button disabled={busy() || (!create() && !target())} onClick={() => send("preview")}>
                {t(create() ? "agentManager.transfer.create" : "agentManager.transfer.review")}
              </Button>
            }
          >
            <Show
              when={!uncertain()}
              fallback={
                <Button disabled={busy()} onClick={() => send("commit")}>
                  {t("agentManager.transfer.retry")}
                </Button>
              }
            >
              <Button variant="secondary" disabled={busy()} onClick={() => setPreview(undefined)}>
                {t("agentManager.transfer.back")}
              </Button>
              <Button disabled={busy()} onClick={() => send("commit")}>
                {t(props.action === "move" ? "agentManager.transfer.move" : "agentManager.transfer.copy")}
              </Button>
            </Show>
          </Show>
          <Show when={busy()}>
            <Spinner />
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
