import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { isPendingTab } from "../../utils/local-tabs"

export function SeparateTabAction(props: { sessionID?: string; name?: string; row?: boolean }) {
  const language = useLanguage()
  const vscode = useVSCode()
  const label = () => {
    const action = language.t("session.openInSeparateTab")
    return props.name ? `${action}: ${props.name}` : action
  }
  const enabled = () => !!props.sessionID && !isPendingTab(props.sessionID) && !props.sessionID.startsWith("cloud:")
  return (
    <Tooltip value={label()}>
      <IconButton
        icon="window-cursor"
        size="small"
        variant="ghost"
        data-slot={props.row ? "session-row-action" : undefined}
        aria-label={label()}
        disabled={!enabled()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (enabled() && props.sessionID) vscode.postMessage({ type: "openSessionInTab", sessionID: props.sessionID })
        }}
      />
    </Tooltip>
  )
}
