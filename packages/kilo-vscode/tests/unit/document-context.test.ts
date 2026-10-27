import { describe, expect, it } from "bun:test"
import { resolveDocumentDirectory } from "../../src/documents/document-context"

describe("resolveDocumentDirectory", () => {
  it("retains the last directory for a replayed session", () => {
    const contexts = new Map([["session:old", { sessionId: "s1", directory: "C:/repo/worktree" }]])
    expect(resolveDocumentDirectory(contexts, "session:s1", "s1")).toBe("C:/repo/worktree")
  })

  it("prefers an explicit directory and otherwise the active context", () => {
    const contexts = new Map([["active", { directory: "C:/repo" }]])
    expect(resolveDocumentDirectory(contexts, "active", undefined, "C:/repo/worktree")).toBe("C:/repo/worktree")
    expect(resolveDocumentDirectory(contexts, "active")).toBe("C:/repo")
  })
})
