import type { AssistantMessage, ToolPart } from "@kilocode/sdk/v2"

export function toolErrorCause(part: ToolPart, error?: AssistantMessage["error"]) {
  if (part.state.status !== "error") return
  if (part.state.error.replace(/^Error:\s*/, "").trim() !== "Tool execution aborted") return
  const stored = part.state.metadata?.abortCause
  const cause =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : error && { name: error.name, ...error.data }
  if (!cause) return
  const token = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value) ? value : undefined
  const name = token(cause.name)
  if (!name) return
  if (name === "MessageAbortedError") return name
  const metadata =
    "metadata" in cause && cause.metadata && typeof cause.metadata === "object"
      ? (cause.metadata as Record<string, unknown>)
      : undefined
  const code = token(cause.code ?? metadata?.code)
  const status =
    typeof cause.statusCode === "number" &&
    Number.isInteger(cause.statusCode) &&
    cause.statusCode >= 100 &&
    cause.statusCode <= 599
      ? `HTTP ${cause.statusCode}`
      : undefined
  return [name, code, status].filter(Boolean).join(" / ")
}

function parse(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function read(value: string) {
  const first = parse(value)
  if (typeof first !== "string") return first
  return parse(first.trim())
}

function detail(err: Record<string, unknown>) {
  const type = typeof err.type === "string" ? err.type : undefined
  const code = typeof err.code === "string" ? err.code : undefined
  const msg = typeof err.message === "string" && err.message.trim() ? err.message : undefined
  if (type && msg) return `${type}: ${msg}`
  if (msg) return msg
  if (code === "rate_limit_exceeded") return "Provider rate limit exceeded. Please try again shortly."
  if (code) return code
  return type
}

function format(value: unknown, depth: number): string | undefined {
  if (depth > 3) return
  if (typeof value === "string") {
    const nested = read(value.trim())
    return nested === undefined ? value : format(nested, depth + 1)
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return

  const rec = value as Record<string, unknown>
  const err =
    rec.error && typeof rec.error === "object" && !Array.isArray(rec.error)
      ? (rec.error as Record<string, unknown>)
      : undefined
  const message = err ? detail(err) : undefined
  if (message) return message
  if (typeof rec.message === "string" && rec.message.trim()) return format(rec.message, depth + 1)
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error
}

export function unwrapError(message: string): string {
  const text = message.replace(/^Error:\s*/, "").trim()
  const direct = read(text)
  if (direct !== undefined) return format(direct, 0) ?? message

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) return message
  return format(read(text.slice(start, end + 1)), 0) ?? message
}

const errorCodes = {
  PAID_MODEL_AUTH_REQUIRED: "PAID_MODEL_AUTH_REQUIRED",
  PROMOTION_MODEL_LIMIT_REACHED: "PROMOTION_MODEL_LIMIT_REACHED",
} as const

export interface ParsedError {
  statusCode?: number
  code?: string
  message?: string
}

export interface ParsedProviderAuthError {
  providerID: string
  message: string
}

export function parseAssistantError(error: AssistantMessage["error"] | null | undefined): ParsedError | null {
  if (!error) return null
  if (error.name !== "APIError") return null

  const data = error.data
  if (!data) return null

  const statusCode = typeof data.statusCode === "number" ? data.statusCode : undefined
  const message = typeof data.message === "string" ? data.message : undefined

  let code: string | undefined
  if (typeof data.responseBody === "string") {
    try {
      const body = JSON.parse(data.responseBody) as Record<string, unknown>
      const bodyError = body.error as Record<string, unknown> | undefined
      if (bodyError && typeof bodyError.code === "string") {
        code = bodyError.code
      } else if (typeof body.code === "string") {
        code = body.code
      }
    } catch {
      // responseBody is not valid JSON — ignore
    }
  }

  return { statusCode, code, message }
}

export function parseProviderAuthError(
  error: AssistantMessage["error"] | null | undefined,
): ParsedProviderAuthError | null {
  if (!error) return null
  if (error.name !== "ProviderAuthError") return null

  const data = error.data
  if (!data) return null
  const providerID = typeof data.providerID === "string" ? data.providerID : undefined
  const message = typeof data.message === "string" ? data.message : undefined
  if (!providerID || !message) return null
  return { providerID, message }
}

export function isUnauthorizedPaidModelError(parsed: ParsedError | null): boolean {
  if (!parsed) return false
  return parsed.statusCode === 401 && parsed.code === errorCodes.PAID_MODEL_AUTH_REQUIRED
}

/**
 * Accepts both 401 (current backend) and 429 (future backend) to support
 * the transition. Keep 401 until the backend is updated to return 429.
 */
export function isUnauthorizedPromotionLimitError(parsed: ParsedError | null): boolean {
  if (!parsed) return false
  return (
    (parsed.statusCode === 401 || parsed.statusCode === 429) && parsed.code === errorCodes.PROMOTION_MODEL_LIMIT_REACHED
  )
}
