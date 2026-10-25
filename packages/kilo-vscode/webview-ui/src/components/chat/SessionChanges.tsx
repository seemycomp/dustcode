import { For, Show, createSignal, createUniqueId } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { FileIcon } from "@kilocode/kilo-ui/file-icon"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { useLanguage } from "../../context/language"

type Props = {
  files: Array<{
    file: string
    additions: number
    deletions: number
    status?: "pending" | "accepted" | "rejected"
    rejectable?: boolean
  }>
  loading?: boolean
  error?: string
  busy?: boolean
  disabled?: boolean
  onAccept(file: string): void
  onReject(file: string): void
  onKeepAll(): void
  onUndoAll(): void
  onReview(file?: string): void
  onRetry(): void
}

export function SessionChanges(props: Props) {
  const { t } = useLanguage()
  const [open, expand] = createSignal(true)
  const id = createUniqueId()
  const locked = () => !!(props.disabled || props.busy || props.loading)
  const blocked = () => locked() || !!props.error
  const pending = () => props.files.some((item) => (item.status ?? "pending") === "pending")
  const reversible = () =>
    props.files.some((item) => (item.status ?? "pending") === "pending" && item.rejectable !== false)
  const scope = () => t("review.sessionScope")
  const undo = () => `${t("review.undoAll")} · ${scope()} · ${t("review.pending")}`
  const keep = () => `${t("review.keepAll")} · ${scope()} · ${t("review.pending")}`

  return (
    <section
      class="session-changes"
      data-component="session-changes"
      aria-label={scope()}
      title={scope()}
      aria-busy={!!(props.loading || props.busy)}
    >
      <div class="session-changes-header">
        <Button
          variant="ghost"
          size="small"
          class="session-changes-toggle"
          aria-expanded={open()}
          aria-controls={id}
          onClick={() => expand(!open())}
        >
          <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
          <span>{t("review.sessionFiles", { count: props.files.length })}</span>
        </Button>
        <div class="session-changes-toolbar">
          <Button
            variant="ghost"
            size="small"
            title={undo()}
            disabled={blocked() || !reversible()}
            onClick={() => props.onUndoAll()}
          >
            {t("review.undoAll")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            title={keep()}
            disabled={blocked() || !pending()}
            onClick={() => props.onKeepAll()}
          >
            {t("review.keepAll")}
          </Button>
          <Button
            variant="secondary"
            size="small"
            disabled={locked() || !props.files.length}
            onClick={() => props.onReview()}
          >
            {t("common.review")}
          </Button>
        </div>
      </div>
      <div id={id} hidden={!open()} class="session-changes-body">
        <Show when={props.loading || props.busy}>
          <div class="session-changes-message" role="status">
            <Spinner class="session-changes-spinner" />
            <span>{t("common.loading")}</span>
          </div>
        </Show>
        <Show when={props.error}>
          <div class="session-changes-message session-changes-error" role="alert">
            <Icon name="circle-x" size="small" />
            <span>{props.error}</span>
            <Button variant="ghost" size="small" disabled={locked()} onClick={() => props.onRetry()}>
              {t("common.retry")}
            </Button>
          </div>
        </Show>
        <Show when={!props.loading && !props.busy && !props.error && !props.files.length}>
          <div class="session-changes-message" role="status">
            {t("session.review.noChanges")}
          </div>
        </Show>
        <Show when={props.files.length}>
          <ul class="session-changes-list">
            <For each={props.files}>
              {(item) => {
                const status = () => item.status ?? "pending"
                const label = () => t(`review.${status()}`)
                return (
                  <li class="session-changes-row" data-status={status()}>
                    <Button
                      variant="ghost"
                      size="small"
                      class="session-changes-file"
                      title={item.file}
                      aria-label={`${t("common.review")}: ${item.file}`}
                      disabled={locked()}
                      onClick={() => props.onReview(item.file)}
                    >
                      <FileIcon node={{ path: item.file, type: "file" }} />
                      <span class="session-changes-name">{item.file.split(/[\\/]/).at(-1)}</span>
                      <span class="session-changes-counts">
                        <span class="session-changes-additions">+{item.additions}</span>
                        <span class="session-changes-deletions">-{item.deletions}</span>
                      </span>
                    </Button>
                    <Show when={status() !== "pending"}>
                      <span class="session-changes-status" title={label()}>
                        <Show when={status() === "accepted"}>
                          <Icon name="check" size="small" />
                        </Show>
                        {label()}
                      </span>
                    </Show>
                    <Show when={status() === "pending"}>
                      <div class="session-changes-actions">
                        <IconButton
                          icon="check"
                          size="small"
                          variant="ghost"
                          aria-label={`${t("review.keep")}: ${item.file}`}
                          title={t("review.keep")}
                          disabled={blocked()}
                          onClick={() => props.onAccept(item.file)}
                        />
                        <Show when={item.rejectable !== false}>
                          <IconButton
                            icon="close"
                            size="small"
                            variant="ghost"
                            aria-label={`${t("review.undo")}: ${item.file}`}
                            title={`${t("review.undo")} · ${scope()}`}
                            disabled={blocked()}
                            onClick={() => props.onReject(item.file)}
                          />
                        </Show>
                      </div>
                    </Show>
                  </li>
                )
              }}
            </For>
          </ul>
        </Show>
      </div>
    </section>
  )
}
