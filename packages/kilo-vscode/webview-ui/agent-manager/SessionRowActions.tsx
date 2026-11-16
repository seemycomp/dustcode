/** @jsxImportSource solid-js */

import type { Component } from "solid-js"
import { ContextMenu } from "@kilocode/kilo-ui/context-menu"
import { Icon } from "@kilocode/kilo-ui/icon"
import type { LanguageContextValue } from "../src/context/language"

interface Props {
  t: LanguageContextValue["t"]
  /** Move the session into a freshly created worktree. */
  onWorktree: () => void
  /** Move the session back to the project root and open it in the local tabs. */
  onLocal: () => void
}

/** Items for the existing context menu in the Agent Manager history view. */
export const SessionRowActions: Component<Props> = (props) => (
  <>
    <ContextMenu.Item onSelect={props.onWorktree}>
      <Icon name="branch" size="small" />
      <ContextMenu.ItemLabel>{props.t("agentManager.session.openInWorktree")}</ContextMenu.ItemLabel>
    </ContextMenu.Item>
    <ContextMenu.Item onSelect={props.onLocal}>
      <Icon name="local" size="small" />
      <ContextMenu.ItemLabel>{props.t("agentManager.session.openLocally")}</ContextMenu.ItemLabel>
    </ContextMenu.Item>
  </>
)
