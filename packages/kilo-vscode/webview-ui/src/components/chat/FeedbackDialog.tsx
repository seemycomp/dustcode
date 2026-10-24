import { Component, JSX } from "solid-js"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"

const GITHUB_ISSUES_URL = "https://github.com/seemycomp/dustcode/issues/new/choose"

const KiloLogo = (): JSX.Element => {
  const icons = (window as { ICONS_BASE_URI?: string }).ICONS_BASE_URI || ""

  return (
    <div class="feedback-dialog-logo">
      <img src={`${icons}/dustcode.png`} alt="Dustcode" />
    </div>
  )
}

export const FeedbackDialog: Component = () => {
  const language = useLanguage()
  const dialog = useDialog()
  const vscode = useVSCode()

  const open = (url: string) => {
    vscode.postMessage({ type: "openExternal", url })
    dialog.close()
  }

  return (
    <Dialog title="" fit>
      <div class="feedback-dialog">
        <KiloLogo />
        <p class="feedback-dialog-message">{language.t("feedback.dialog.message")}</p>
        <div class="feedback-dialog-actions">
          <Button variant="primary" size="large" data-full-width="true" onClick={() => open(GITHUB_ISSUES_URL)}>
            <Icon name="github" size="small" />
            {language.t("feedback.dialog.github")}
          </Button>
        </div>
        <Button variant="ghost" size="small" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
      </div>
    </Dialog>
  )
}
