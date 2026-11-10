import { render } from "solid-js/web"
import { VSCodeProvider } from "../../webview-ui/src/context/vscode"
import { LanguageProvider } from "../../webview-ui/src/context/language"
import { DialogProvider } from "@kilocode/kilo-ui/context/dialog"
import { HistorySidebar } from "../../webview-ui/src/stories/agent-manager-history"
import { applyKiloTheme, applyVscodeTheme } from "../../../kilo-ui/src/stories/theme-decorator"
import "@kilocode/kilo-ui/styles"
import "../../webview-ui/agent-manager/agent-manager.css"

const params = new URLSearchParams(location.search)
applyKiloTheme("kilo-vscode", applyVscodeTheme(params.get("theme") ?? "dark-modern"))
const root = document.createElement("main")
root.style.cssText = `width:${params.get("width") ?? "280"}px;height:760px`
document.body.append(root)
render(
  () => (
    <VSCodeProvider>
      <LanguageProvider>
        <DialogProvider>
          <HistorySidebar
            total={Number(params.get("total") ?? 75)}
            worktrees={Number(params.get("worktrees") ?? 2)}
            collapsed={params.has("collapsed")}
            legacy={params.has("legacy")}
            bulk={params.has("bulk")}
            transfer={params.has("transfer")}
          />
        </DialogProvider>
      </LanguageProvider>
    </VSCodeProvider>
  ),
  root,
)
