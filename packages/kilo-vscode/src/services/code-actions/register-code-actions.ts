import * as vscode from "vscode"
import type { KiloProvider } from "../../KiloProvider"
import type { AgentManagerProvider } from "../../agent-manager/AgentManagerProvider"
import { getEditorContext } from "./editor-utils"
import { createPrompt } from "./support-prompt"
import { ready, type ChatTarget } from "./chat-target"

export function registerCodeActions(
  context: vscode.ExtensionContext,
  sidebar: () => ChatTarget,
  agentManager?: AgentManagerProvider,
  activeTabProvider?: () => KiloProvider | undefined,
  lastFocusedChat?: () => KiloProvider | AgentManagerProvider | undefined,
): void {
  const target = async (remember = false) => {
    const fallback = sidebar()
    const view =
      (remember ? lastFocusedChat?.() : undefined) ??
      (agentManager?.isActive() ? agentManager : (activeTabProvider?.() ?? fallback))
    return (await ready(view, view === fallback)) ? view : undefined
  }
  const reveal = async () => {
    const view = sidebar()
    return (await ready(view, true)) ? view : undefined
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("dustcode.explainCode", async () => {
      const ctx = getEditorContext()
      if (!ctx) return
      const prompt = createPrompt("EXPLAIN", {
        filePath: ctx.filePath,
        startLine: String(ctx.startLine),
        endLine: String(ctx.endLine),
        selectedText: ctx.selectedText,
        userInput: "",
      })
      const view = await reveal()
      view?.postMessage({ type: "triggerTask", text: prompt, injectedTitle: "Explain selected code" })
    }),

    vscode.commands.registerCommand("dustcode.fixCode", async () => {
      const ctx = getEditorContext()
      if (!ctx) return
      const prompt = createPrompt("FIX", {
        filePath: ctx.filePath,
        startLine: String(ctx.startLine),
        endLine: String(ctx.endLine),
        selectedText: ctx.selectedText,
        diagnostics: ctx.diagnostics,
        userInput: "",
      })
      const view = await reveal()
      view?.postMessage({ type: "triggerTask", text: prompt, injectedTitle: "Fix code problems" })
    }),

    vscode.commands.registerCommand("dustcode.improveCode", async () => {
      const ctx = getEditorContext()
      if (!ctx) return
      const prompt = createPrompt("IMPROVE", {
        filePath: ctx.filePath,
        startLine: String(ctx.startLine),
        endLine: String(ctx.endLine),
        selectedText: ctx.selectedText,
        userInput: "",
      })
      const view = await reveal()
      view?.postMessage({ type: "triggerTask", text: prompt, injectedTitle: "Improve selected code" })
    }),

    vscode.commands.registerCommand("dustcode.addToContext", async () => {
      const ctx = getEditorContext()
      if (!ctx) return
      const view = await target(true)
      if (!view) return
      view.postMessage({
        type: "appendChatContext",
        context: {
          id: crypto.randomUUID(),
          filePath: ctx.filePath,
          startLine: ctx.startLine,
          endLine: ctx.endLine,
          text: ctx.selectedText,
        },
      })
    }),

    vscode.commands.registerCommand("dustcode.focusChatInput", async () => {
      const view = await target()
      if (!view) return
      view.postMessage({ type: "action", action: "focusInput" })
    }),

    // Command Palette only — no keybinding. A keybinding would need to
    // route through VS Code's keybinding-to-focused-webview forwarding,
    // which doesn't reliably reach a webview whose own input already has
    // focus; invoking straight from the palette sidesteps that path
    // entirely, the same way terminalAddToContext etc. do. Toggles: the
    // webview closes the search bar itself if it's already open.
    vscode.commands.registerCommand("dustcode.toggleChatSearch", async () => {
      const view = await target()
      if (!view) return
      view.postMessage({ type: "action", action: "focusSearch" })
    }),
  )
}
