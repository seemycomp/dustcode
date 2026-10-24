import * as fs from "node:fs"
import * as path from "node:path"

export const MAX_MULTI_VERSIONS = 4
export const PLATFORM = "agent-manager" as const
export const SNAPSHOT_INITIALIZATION = "wait" as const

/** Never adopt the original extension's project state or worktrees. */
export const KILO_DIR = ".dustcode"
export const LEGACY_DIR = ".dustcode"

export interface MigrationResult {
  refsFixed: number
}

export async function migrateAgentManagerData(_root: string, _log: (msg: string) => void): Promise<MigrationResult> {
  return { refsFixed: 0 }
}

export async function resolveGitDir(root: string): Promise<string> {
  const file = path.join(root, ".git")
  const stat = await fs.promises.stat(file)
  if (stat.isDirectory()) return file
  const content = await fs.promises.readFile(file, "utf8")
  const match = content.match(/^gitdir:\s*(.+)$/m)
  if (!match) throw new Error("Invalid .git file format")
  return path.resolve(path.dirname(file), match[1]!.trim(), "..", "..")
}
