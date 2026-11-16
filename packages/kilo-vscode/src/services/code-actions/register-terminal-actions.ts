import * as vscode from "vscode"
import type { AgentManagerProvider } from "../../agent-manager/AgentManagerProvider"
import { createPrompt } from "./support-prompt"
import { getTerminalContents } from "../terminal/context"
import { ready, type ChatTarget } from "./chat-target"

export function registerTerminalActions(
  context: vscode.ExtensionContext,
  sidebar: () => ChatTarget,
  agentManager?: AgentManagerProvider,
): void {
  const target = async () => {
    const fallback = sidebar()
    const view = agentManager?.isActive() ? agentManager : fallback
    return (await ready(view, view === fallback)) ? view : undefined
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("dustcode.terminalAddToContext", async (args: any) => {
      let content = args?.selection as string | undefined
      if (!content) {
        content = (await getTerminalContents(-1)).content
      }
      if (!content) {
        vscode.window.showInformationMessage("No terminal content available. Select text in the terminal first.")
        return
      }
      const prompt = createPrompt("TERMINAL_ADD_TO_CONTEXT", {
        terminalContent: content,
        userInput: "",
      })
      const view = await target()
      if (!view) return
      view.postMessage({ type: "appendChatBoxMessage", text: prompt })
      view.postMessage({ type: "action", action: "focusInput" })
    }),

    vscode.commands.registerCommand("dustcode.terminalFixCommand", async (args: any) => {
      let content = args?.selection as string | undefined
      if (!content) {
        content = (await getTerminalContents(1)).content
      }
      if (!content) {
        vscode.window.showInformationMessage("No terminal content available. Select text in the terminal first.")
        return
      }
      const prompt = createPrompt("TERMINAL_FIX", {
        terminalContent: content,
        userInput: "",
      })
      const view = await target()
      if (!view) return
      view.postMessage({ type: "triggerTask", text: prompt, injectedTitle: "Fix terminal command" })
    }),

    vscode.commands.registerCommand("dustcode.terminalExplainCommand", async (args: any) => {
      let content = args?.selection as string | undefined
      if (!content) {
        content = (await getTerminalContents(1)).content
      }
      if (!content) {
        vscode.window.showInformationMessage("No terminal content available. Select text in the terminal first.")
        return
      }
      const prompt = createPrompt("TERMINAL_EXPLAIN", {
        terminalContent: content,
        userInput: "",
      })
      const view = await target()
      if (!view) return
      view.postMessage({ type: "triggerTask", text: prompt, injectedTitle: "Explain terminal command" })
    }),
  )
}
