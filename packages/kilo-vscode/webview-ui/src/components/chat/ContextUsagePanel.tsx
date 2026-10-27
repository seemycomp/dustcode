import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { useSession } from "../../context/session"
import { calcTokenUsage } from "../../context/session-utils"
import { hasModelUsage, tokenSummary } from "../../context/model-usage"
import { useLanguage } from "../../context/language"
import { groups, palette, type TimelineCategory } from "../../utils/timeline/colors"
import { formatCompactCount } from "../../utils/format"
import { TaskTimeline } from "./TaskTimeline"
import { ContextProgress } from "./ContextProgress"
import { TaskUsage } from "./TaskUsage"
import { useTimeline } from "./useTimeline"

export const ContextUsagePanel: Component<{ onClose: () => void }> = (props) => {
  const session = useSession()
  const language = useLanguage()
  const bars = useTimeline()
  const tokens = createMemo(() => {
    const usage = session.modelUsage()
    return hasModelUsage(usage) ? tokenSummary(usage) : calcTokenUsage(session.visibleMessages())
  })
  const [open, setOpen] = createSignal<TimelineCategory>()
  const summary = createMemo(() => groups(bars()))
  const count = (value: number) => value.toLocaleString(language.locale())

  return (
    <section class="context-usage-panel" aria-label={language.t("prompt.action.contextUsage")}>
      <div class="context-usage-header">
        <span>{language.t("prompt.action.contextUsage")}</span>
        <IconButton
          icon="dash"
          variant="ghost"
          size="small"
          aria-label={language.t("context.usage.hide")}
          onClick={props.onClose}
        />
      </div>
      <div class="context-usage-body">
        <div class="context-usage-overview">
          <span>
            {session.contextUsage()?.percentage != null
              ? language.t("context.usage.full", { percentage: session.contextUsage()!.percentage! })
              : language.t("context.usage.current")}
          </span>
          <span>
            {language.t("context.usage.tokens", { count: formatCompactCount(session.contextUsage()?.tokens ?? 0) })}
          </span>
        </div>
        <div data-slot="context-usage-progress">
          <ContextProgress />
        </div>
        <div class="context-usage-segments" aria-hidden="true">
          <For each={summary()}>
            {(item) => <span style={{ "flex-grow": item.count, "background-color": palette[item.key] }} />}
          </For>
        </div>
        <div class="context-usage-group-label">{language.t("context.usage.activity")}</div>
        <div class="context-usage-groups">
          <For each={summary()} fallback={<div class="context-usage-empty">{language.t("context.usage.empty")}</div>}>
            {(item) => (
              <div class="context-usage-group" data-open={open() === item.key ? "" : undefined}>
                <Button
                  variant="ghost"
                  class="context-usage-group-trigger"
                  aria-expanded={open() === item.key}
                  onClick={() => setOpen((current) => (current === item.key ? undefined : item.key))}
                >
                  <span class="context-usage-swatch" style={{ "background-color": palette[item.key] }} />
                  <span class="context-usage-group-name">{language.t(`context.usage.category.${item.key}`)}</span>
                  <span class="context-usage-group-count">{count(item.count)}</span>
                  <Icon name="chevron-down" size="small" />
                </Button>
                <Show when={open() === item.key}>
                  <div class="context-usage-chart">
                    <TaskTimeline bars={bars().filter((bar) => bar.category === item.key)} />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={tokens()}>{(value) => <TaskUsage tokens={value()} usage={session.modelUsage()} />}</Show>
      </div>
    </section>
  )
}
