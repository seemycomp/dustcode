import { describe, expect, it } from "bun:test"
import type * as vscode from "vscode"
import { nativeRenameTarget } from "../../src/commands/native-rename-target"

function fixture() {
  const input = { viewType: "mainThreadWebview-dustcode.TabPanel" }
  const group: vscode.TabGroup = { isActive: true, viewColumn: 1, tabs: [], activeTab: undefined }
  const tab: vscode.Tab = {
    input,
    group,
    label: "Session",
    isActive: true,
    isDirty: false,
    isPinned: true,
    isPreview: false,
  }
  Object.assign(group, { tabs: [tab], activeTab: tab })
  const panel = { active: true, viewColumn: 1 }
  const opts = {
    resource: { scheme: "webview-panel" },
    context: { groupId: 42, editorIndex: 0 },
    groups: [group],
    panels: new Map([[panel, "session"]]),
    webview: (value: unknown) => value === input,
  }
  return { opts, group, tab, panel, input }
}

describe("native Rename targeting", () => {
  it("renames an unambiguous already-active session", () => {
    expect(nativeRenameTarget(fixture().opts)).toBe("session")
  })

  it("rejects an inactive target while the previous panel still reports active", () => {
    const { opts, group, tab } = fixture()
    const target = { ...tab, isActive: false }
    Object.assign(group, { tabs: [tab, target] })
    opts.context.editorIndex = 1
    expect(nativeRenameTarget(opts)).toBeUndefined()

    // The tab RPC can arrive before the panel RPC. Even after the target
    // becomes active, the previous panel must never receive Rename.
    Object.assign(tab, { isActive: false })
    Object.assign(target, { isActive: true })
    Object.assign(group, { activeTab: target })
    expect(nativeRenameTarget(opts)).toBeUndefined()
  })

  it("rejects multiple panels even if only the wrong panel reports active", () => {
    const { opts } = fixture()
    opts.panels.set({ active: false, viewColumn: 1 }, "target")
    expect(nativeRenameTarget(opts)).toBeUndefined()
  })

  it("does not interpret groupId as a public viewColumn", () => {
    const { opts, group } = fixture()
    opts.groups.push({ ...group, isActive: false, viewColumn: 2 })
    expect(nativeRenameTarget(opts)).toBeUndefined()
  })

  it("rejects other webviews and stale panel activation", () => {
    const { opts, tab, input, panel } = fixture()
    Object.assign(tab, { input: { viewType: "mainThreadWebview-dustcode.settingsPanel" } })
    expect(nativeRenameTarget(opts)).toBeUndefined()
    Object.assign(tab, { input })
    panel.active = false
    expect(nativeRenameTarget(opts)).toBeUndefined()
    panel.active = true
    panel.viewColumn = 2
    expect(nativeRenameTarget(opts)).toBeUndefined()
  })

  it("rejects malformed or partial native context instead of using the active panel", () => {
    const { opts } = fixture()
    for (const index of [-1, 0.5, NaN, 4]) {
      expect(nativeRenameTarget({ ...opts, context: { groupId: 42, editorIndex: index } })).toBeUndefined()
    }
    expect(nativeRenameTarget({ ...opts, context: { groupId: 42 } })).toBeUndefined()
    expect(nativeRenameTarget({ ...opts, resource: undefined })).toBeUndefined()
    expect(nativeRenameTarget({ ...opts, resource: { scheme: "file" } })).toBeUndefined()
  })
})
