import * as vscode from "vscode"
import type { KiloConnectionService } from "../services/cli-backend"
import { SessionReview } from "./session-review"
import * as fs from "node:fs"
import * as path from "node:path"
import { createHash, randomUUID } from "node:crypto"

const services = new WeakMap<KiloConnectionService, SessionReview>()
const directories = new WeakMap<KiloConnectionService, string>()

export function configureSessionReview(connection: KiloConnectionService, directory: string) {
  directories.set(connection, path.join(directory, "session-review"))
}

export function sessionReview(connection: KiloConnectionService) {
  const existing = services.get(connection)
  if (existing) return existing
  const directory = directories.get(connection)
  const filename = (key: string) => path.join(directory!, `${createHash("sha256").update(key).digest("hex")}.json`)
  const service = new SessionReview({
    store: directory
      ? {
          read(key) {
            const file = filename(key)
            if (!fs.existsSync(file)) return undefined
            const stat = fs.lstatSync(file)
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024)
              throw new Error("Unsafe review checkpoint")
            return JSON.parse(fs.readFileSync(file, "utf8")) as unknown
          },
          write(key, value) {
            const data = JSON.stringify(value)
            if (Buffer.byteLength(data) > 16 * 1024 * 1024) throw new Error("Review checkpoint is too large")
            fs.mkdirSync(directory, { recursive: true })
            const file = filename(key)
            const existing = fs.lstatSync(file, { throwIfNoEntry: false })
            if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1))
              throw new Error("Unsafe review checkpoint")
            const temporary = `${file}.${randomUUID()}.tmp`
            try {
              fs.writeFileSync(temporary, data, { flag: "wx", mode: 0o600 })
              fs.renameSync(temporary, file)
            } finally {
              fs.rmSync(temporary, { force: true })
            }
          },
        }
      : undefined,
    async messages(sessionID, directory) {
      const { data } = await connection.getClient().session.messages({ sessionID, directory }, { throwOnError: true })
      return data ?? []
    },
    async idle(_sessionID, directory) {
      const { data } = await connection.getClient().session.status({ directory }, { throwOnError: true })
      return Object.values(data ?? {}).every((status) => status.type === "idle")
    },
    dirtyFiles: () =>
      vscode.workspace.textDocuments
        .filter((document) => document.isDirty && document.uri.scheme === "file")
        .map((document) => document.uri.fsPath),
  })
  services.set(connection, service)
  return service
}

export async function rewindSessionReview(
  connection: KiloConnectionService,
  sessionID: string,
  directory: string,
): Promise<void> {
  await sessionReview(connection).rewind(sessionID, directory)
}

export async function handleSessionReview(
  message: Record<string, unknown>,
  ctx: {
    connection: KiloConnectionService
    sessionID?: string
    directory: (id: string) => string | null | undefined
    post: (message: unknown) => void
  },
) {
  if (message.type !== "sessionReview.load" && message.type !== "sessionReview.decide") return false
  if (typeof message.sessionID !== "string" || typeof message.requestId !== "string") return true
  const { sessionID, requestId } = message
  try {
    if (sessionID !== ctx.sessionID) throw new Error("The active session changed. Refresh the review.")
    const directory = ctx.directory(sessionID)
    if (!directory) throw new Error("The session directory is unavailable or ambiguous.")
    const service = sessionReview(ctx.connection)
    const state =
      message.type === "sessionReview.load"
        ? await service.load(sessionID, directory)
        : await (async () => {
            if (
              typeof message.revision !== "string" ||
              !["accept", "accept-all", "reject", "undo-all"].includes(String(message.action))
            )
              throw new Error("Invalid review decision")
            if (message.file !== undefined && typeof message.file !== "string") throw new Error("Invalid review file")
            if (message.hunk !== undefined && typeof message.hunk !== "string") throw new Error("Invalid review block")
            return service.decide(
              sessionID,
              directory,
              message.revision,
              message.action as "accept" | "accept-all" | "reject" | "undo-all",
              message.file as string | undefined,
              message.hunk as string | undefined,
            )
          })()
    ctx.post({
      type: "sessionReview.result",
      sessionID,
      requestId,
      revision: state.revision,
      files: state.files.map((file) => ({
        file: file.file,
        before: "",
        after: "",
        additions: file.additions,
        deletions: file.deletions,
        reviewStatus: file.reviewStatus,
        rejectable: file.rejectable,
      })),
    })
  } catch (error) {
    ctx.post({
      type: "sessionReview.result",
      sessionID,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return true
}
