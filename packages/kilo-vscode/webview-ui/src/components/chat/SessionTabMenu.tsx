import { ContextMenu } from "@kilocode/kilo-ui/context-menu"
import { Icon } from "@kilocode/kilo-ui/icon"
import { Show, type JSX, type ParentComponent } from "solid-js"
import { useLanguage } from "../../context/language"

export const SessionTabMenu: ParentComponent<{
  showFork?: boolean
  showNewSession?: boolean
  showMoveToWorktree?: boolean
  showCopyToWorktree?: boolean
  onNewSession?: () => void
  onMoveToWorktree?: (create?: boolean) => void
  onCopyToWorktree?: (create?: boolean) => void
  transferOptions?: { new: string; existing: string; copy: string }
  onFork?: () => void
  onClose: () => void
  onCloseOthers?: () => void
  onCloseToRight?: () => void
  pinned?: boolean
  onTogglePin?: () => void
  closeable?: boolean
  closeShortcut?: JSX.Element
  /** Extra items rendered above the fork/pin/close actions, e.g. per-tab copy actions. */
  leading?: JSX.Element
}> = (props) => {
  const { t } = useLanguage()
  return (
    <ContextMenu>
      <ContextMenu.Trigger as="div" style={{ display: "contents" }}>
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class="session-tab-menu am-ctx-menu">
          <Show when={props.leading}>
            {(items) => (
              <>
                {items()}
                <ContextMenu.Separator />
              </>
            )}
          </Show>
          <Show when={props.showNewSession}>
            <ContextMenu.Item disabled={!props.onNewSession} onSelect={() => props.onNewSession?.()}>
              <Icon name="plus" size="small" />
              <ContextMenu.ItemLabel>{t("sidebar.session.newSession")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </Show>
          <Show when={props.showFork}>
            <ContextMenu.Item disabled={!props.onFork} onSelect={() => props.onFork?.()}>
              <Icon name="fork" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.tab.forkSession")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </Show>
          <Show when={props.showMoveToWorktree}>
            <Show
              when={props.transferOptions}
              fallback={
                <ContextMenu.Item disabled={!props.onMoveToWorktree} onSelect={() => props.onMoveToWorktree?.()}>
                  <Icon name="branch" size="small" />
                  <ContextMenu.ItemLabel>{t("sidebar.session.moveToWorktree")}</ContextMenu.ItemLabel>
                </ContextMenu.Item>
              }
            >
              <ContextMenu.Sub>
                <ContextMenu.SubTrigger disabled={!props.onMoveToWorktree}>
                  <Icon name="branch" size="small" />
                  <span>{t("sidebar.session.moveToWorktree")}</span>
                </ContextMenu.SubTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.SubContent>
                    <ContextMenu.Item onSelect={() => props.onMoveToWorktree?.(true)}>
                      {props.transferOptions?.new}
                    </ContextMenu.Item>
                    <ContextMenu.Item onSelect={() => props.onMoveToWorktree?.(false)}>
                      {props.transferOptions?.existing}
                    </ContextMenu.Item>
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>
            </Show>
          </Show>
          <Show when={props.showCopyToWorktree}>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger disabled={!props.onCopyToWorktree}>
                <Icon name="copy" size="small" />
                <span>{props.transferOptions?.copy}</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent>
                  <ContextMenu.Item onSelect={() => props.onCopyToWorktree?.(true)}>
                    {props.transferOptions?.new}
                  </ContextMenu.Item>
                  <ContextMenu.Item onSelect={() => props.onCopyToWorktree?.(false)}>
                    {props.transferOptions?.existing}
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          </Show>
          <Show
            when={
              (props.showNewSession || props.showFork || props.showMoveToWorktree || props.showCopyToWorktree) &&
              (props.closeable !== false || props.onCloseOthers || props.onCloseToRight || props.onTogglePin)
            }
          >
            <ContextMenu.Separator />
          </Show>
          <Show when={props.onTogglePin}>
            <ContextMenu.Item onSelect={() => props.onTogglePin?.()}>
              <Icon name={props.pinned ? "pin-filled" : "pin"} size="small" />
              <ContextMenu.ItemLabel>
                {props.pinned ? t("agentManager.tab.unpin") : t("agentManager.tab.pin")}
              </ContextMenu.ItemLabel>
              <span class="session-tab-menu-hint">{t("session.tabs.pinHint")}</span>
            </ContextMenu.Item>
            <Show when={props.closeable !== false || props.onCloseOthers}>
              <ContextMenu.Separator />
            </Show>
          </Show>
          <Show when={props.closeable !== false}>
            <ContextMenu.Item onSelect={props.onClose}>
              <Icon name="close" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.tab.close")}</ContextMenu.ItemLabel>
              {props.closeShortcut}
            </ContextMenu.Item>
          </Show>
          <Show when={props.onCloseOthers}>
            <ContextMenu.Item onSelect={() => props.onCloseOthers?.()}>
              <Icon name="close" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.tab.closeOthers")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </Show>
          <Show when={props.onCloseToRight}>
            <ContextMenu.Item onSelect={() => props.onCloseToRight?.()}>
              <Icon name="arrow-right" size="small" />
              <ContextMenu.ItemLabel>{t("agentManager.tab.closeToRight")}</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )
}
