import type {
  KiloClient,
  Part,
  TextPartInput,
  FilePartInput,
  AgentPartInput,
  SubtaskPartInput,
} from "@kilocode/sdk/v2/client"
import { formatBrowserFeedback, partFeedback } from "../shared/browser-feedback"
import { formatReviewCommentsMarkdown } from "../shared/review-comments"
import { Identifier } from "../../webview-ui/src/utils/id"
import type { ImageAttachment } from "../../webview-ui/src/hooks/useImageAttachments"
import type { FileAttachment, ResubmitMessageRequest } from "../../webview-ui/src/types/messages"

type Input = {
  sessionID: string
  messageID: string
  text: string
  images?: ImageAttachment[]
  files?: FileAttachment[]
  providerID?: string
  modelID?: string
  agent?: string
  variant?: string | null
  command?: ResubmitMessageRequest["command"]
}

type Prompt = {
  messageID: string
  parts: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>
  model?: { providerID: string; modelID: string }
  agent?: string
  variant?: string
  command?: ResubmitMessageRequest["command"]
}

type RevertResult = {
  revert?: { workspace?: "restored" | "snapshots-disabled" | "unavailable" | "not-a-git-repo" }
  summary?: { files?: number; diffs?: unknown[] }
}

function validate(result: RevertResult) {
  if ((result.summary?.diffs?.length ?? result.summary?.files ?? 0) > 0 && result.revert?.workspace !== "restored") {
    throw new Error(
      "Cannot resend the edited message because its workspace changes were not restored. Enable snapshots and retry.",
    )
  }
}

export type ResubmitContext = {
  client: KiloClient
  directory: string
  checkpoint: (run: () => Promise<void>) => Promise<void>
  stop: () => Promise<void>
  revert: () => Promise<RevertResult>
  send: (prompt: Prompt) => Promise<boolean>
}

type User = {
  info: {
    id: string
    sessionID: string
    role: "user"
    agent: string
    model: { providerID: string; modelID: string; variant?: string }
  }
  parts: Part[]
}

function files(input: FileAttachment[] | undefined, history: Part[]) {
  if (input !== undefined && !Array.isArray(input)) throw new Error("Invalid file attachments")
  const urls = new Set(
    history
      .filter(
        (part): part is Extract<Part, { type: "file" }> =>
          part.type === "file" && (!part.mime.startsWith("image/") || part.source?.type === "file"),
      )
      .map((part) => part.url),
  )
  return (input ?? [])
    .map((file) => {
      if (
        !file ||
        typeof file.mime !== "string" ||
        typeof file.url !== "string" ||
        (file.filename !== undefined && typeof file.filename !== "string") ||
        !URL.canParse(file.url) ||
        !["data:", "file:"].includes(new URL(file.url).protocol)
      ) {
        throw new Error("Invalid file attachment")
      }
      return {
        type: "file" as const,
        mime: file.mime,
        url: file.url,
        ...(file.filename !== undefined ? { filename: file.filename } : {}),
        ...(file.source ? { source: file.source } : {}),
      }
    })
    .filter((file) => {
      if (urls.has(file.url)) return false
      urls.add(file.url)
      return true
    })
}

function selection(input: Input, info: User["info"]) {
  const model =
    input.providerID && input.modelID
      ? { providerID: input.providerID, modelID: input.modelID }
      : { providerID: info.model.providerID, modelID: info.model.modelID }
  return {
    model,
    agent: input.agent ?? info.agent,
    variant:
      input.variant !== undefined
        ? (input.variant ?? undefined)
        : model.providerID === info.model.providerID && model.modelID === info.model.modelID
          ? info.model.variant
          : undefined,
  }
}

/** Stop a session tree, restore its historical boundary, and send an edited turn. */
export async function resubmitMessage(input: Input, ctx: ResubmitContext): Promise<boolean> {
  if (
    input.command !== undefined &&
    (!input.command || typeof input.command.name !== "string" || typeof input.command.args !== "string")
  ) {
    throw new Error("Invalid command")
  }
  let sent = false
  await ctx.checkpoint(async () => {
    sent = await run(input, ctx)
  })
  return sent
}

async function run(input: Input, ctx: ResubmitContext): Promise<boolean> {
  const result = await ctx.client.session.message(
    {
      sessionID: input.sessionID,
      directory: ctx.directory,
      messageID: input.messageID,
    },
    { throwOnError: true },
  )
  const message = result.data as User
  if (!message || message.info.sessionID !== input.sessionID || message.info.role !== "user") {
    throw new Error("Historical user message was not found in this session")
  }

  const attachments = message.parts.filter(
    (part): part is Extract<Part, { type: "file" }> =>
      part.type === "file" && part.mime.startsWith("image/") && part.source?.type !== "file",
  )
  if (input.images !== undefined && !Array.isArray(input.images)) throw new Error("Invalid image attachments")
  const images = input.images?.map((image) => {
    if (
      !image ||
      typeof image.id !== "string" ||
      typeof image.filename !== "string" ||
      typeof image.mime !== "string" ||
      typeof image.dataUrl !== "string"
    ) {
      throw new Error("Invalid image attachment")
    }
    const original = attachments.find((part) => part.url === image.dataUrl && part.mime === image.mime)
    const inline = image.dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
    if (
      !original &&
      (!inline || inline[2].length % 4 !== 0 || inline[1] !== image.mime || inline[0] !== image.dataUrl)
    ) {
      throw new Error("Invalid image attachment")
    }
    return {
      type: "file" as const,
      mime: image.mime,
      url: image.dataUrl,
      filename: image.filename,
      ...(original?.source ? { source: original.source } : {}),
    }
  })
  const text = message.parts.find(
    (part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.synthetic && !part.ignored,
  )
  const feedback = text ? partFeedback(text.metadata, text.text) : undefined
  const prefix = [
    feedback?.review ? formatReviewCommentsMarkdown(feedback.review.comments) : undefined,
    feedback?.browserFeedback ? formatBrowserFeedback(feedback.browserFeedback.references) : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n\n")
  const body = [prefix, input.text].filter(Boolean).join("\n\n")
  const parts = [
    { type: "text" as const, text: body, ...(text?.metadata ? { metadata: text.metadata } : {}) },
    ...message.parts
      .filter((part) => part.type !== "text" && !("synthetic" in part && part.synthetic === true))
      .filter((part) => images === undefined || part.type !== "file" || !attachments.includes(part))
      .map((part) =>
        part.type === "file"
          ? {
              type: "file" as const,
              mime: part.mime,
              url: part.url,
              ...(part.filename ? { filename: part.filename } : {}),
              ...(part.source ? { source: part.source } : {}),
            }
          : part.type === "agent"
            ? { type: "agent" as const, name: part.name, source: part.source }
            : part.type === "subtask"
              ? {
                  type: "subtask" as const,
                  prompt: part.prompt,
                  description: part.description,
                  agent: part.agent,
                  model: part.model,
                  ...(part.variant ? { variant: part.variant } : {}),
                  ...(part.command ? { command: part.command } : {}),
                }
              : undefined,
      )
      .filter((part): part is NonNullable<typeof part> => part !== undefined),
    ...(images ?? []),
    ...files(input.files, message.parts),
  ] satisfies Prompt["parts"]
  const prompt = {
    messageID: Identifier.ascending("message"),
    parts,
    command: input.command,
    ...selection(input, message.info),
  } satisfies Prompt

  await ctx.stop()
  validate(await ctx.revert())
  return ctx.send(prompt)
}
