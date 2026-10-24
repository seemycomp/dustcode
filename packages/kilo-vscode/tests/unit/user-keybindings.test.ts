import { describe, expect, it } from "bun:test"
import * as path from "node:path"
import { buildKeybindingMap } from "../../src/agent-manager/format-keybinding"
import { mergeUserKeybindings, parseJsonc, userKeybindingFiles } from "../../src/agent-manager/user-keybindings"

const defaults = [
  { command: "dustcode.agentManagerOpen", key: "ctrl+shift+m", mac: "cmd+shift+m" },
  { command: "dustcode.agentManager.toggleDiff", key: "ctrl+d", mac: "cmd+d" },
  { command: "dustcode.agentManager.showShortcuts", key: "ctrl+shift+/", mac: "cmd+shift+/" },
]

const map = (user: unknown, mac: boolean) => buildKeybindingMap(mergeUserKeybindings(defaults, user, mac), mac)

describe("user keybindings", () => {
  it("parses keybindings.json with comments and trailing commas", () => {
    const text = `// Place your key bindings in this file
[
  { "key": "cmd+j", "command": "dustcode.agentManagerOpen" }, /* block */
  { "key": "cmd+//", "command": "x", "when": "a // not a comment" },
]`
    expect(parseJsonc(text)).toEqual([
      { key: "cmd+j", command: "dustcode.agentManagerOpen" },
      { key: "cmd+//", command: "x", when: "a // not a comment" },
    ])
    expect(parseJsonc("[ { ")).toBeUndefined()
  })

  it("shows the user's shortcut instead of the default", () => {
    const user = [{ key: "cmd+j", command: "dustcode.agentManagerOpen" }]
    expect(map(user, true).agentManagerOpen).toBe("⌘J")
    expect(map([{ key: "ctrl+alt+j", command: "dustcode.agentManagerOpen" }], false).agentManagerOpen).toBe(
      "Ctrl+Alt+J",
    )
    expect(map(undefined, false).agentManagerOpen).toBe("Ctrl+Shift+M")
  })

  it("formats chords", () => {
    expect(map([{ key: "cmd+k cmd+d", command: "dustcode.agentManager.toggleDiff" }], true).toggleDiff).toBe("⌘K ⌘D")
  })

  it("hides a removed shortcut instead of showing its fallback", () => {
    const user = [{ key: "cmd+d", command: "-dustcode.agentManager.toggleDiff" }]
    expect(map(user, true).toggleDiff).toBeUndefined()
    const other = [{ key: "cmd+x", command: "-dustcode.agentManager.toggleDiff" }]
    expect(map(other, true).toggleDiff).toBe("⌘D")
  })

  it("finds the file for the default profile and falls back from a profile", () => {
    const user = path.join("/data", "User")
    expect(userKeybindingFiles(path.join(user, "globalStorage", "dustcode.dustcode"))).toEqual([
      path.join(user, "keybindings.json"),
    ])
    expect(userKeybindingFiles(path.join(user, "profiles", "abc", "globalStorage", "dustcode.dustcode"))).toEqual([
      path.join(user, "profiles", "abc", "keybindings.json"),
      path.join(user, "keybindings.json"),
    ])
  })
})
