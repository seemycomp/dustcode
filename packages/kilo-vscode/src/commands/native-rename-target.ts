import type * as vscode from "vscode"

type TabContext = { groupId?: number; editorIndex?: number }

// Webview tabs expose neither their resource nor their panel handle. Do not
// correlate independently delivered tab/panel activation events by timing.
export function nativeRenameTarget<T>(opts: {
  context?: TabContext
  resource?: Pick<vscode.Uri, "scheme">
  groups: readonly vscode.TabGroup[]
  panels: ReadonlyMap<Pick<vscode.WebviewPanel, "active" | "viewColumn">, T>
  webview: (input: unknown) => boolean
}): T | undefined {
  const index = opts.context?.editorIndex
  if (opts.resource?.scheme !== "webview-panel") return
  if (!Number.isInteger(opts.context?.groupId)) return
  if (index == null || !Number.isInteger(index) || index < 0) return

  // Public TabGroup has no groupId. Multiple groups or panels cannot be
  // disambiguated safely, even when exactly one panel currently reports active.
  if (opts.groups.length !== 1 || opts.panels.size !== 1) return
  const group = opts.groups.at(0)
  if (!group?.isActive) return
  const tab = group.tabs.at(index)
  if (!tab || tab !== group.activeTab || !opts.webview(tab.input)) return
  if (group.tabs.filter((item) => opts.webview(item.input)).length !== 1) return
  const entry = [...opts.panels].at(0)
  if (!entry || !entry[0].active || entry[0].viewColumn !== group.viewColumn) return
  return entry[1]
}
