export type SessionTransferAction = "move" | "copy"
export type SessionTransferRequest = {
  type: "agentManager.sessionTransfer"
  phase: "targets" | "preview" | "commit" | "status"
  projectId: string
  sourceSessionId: string
  sourceWorktreeId: string | null
  requestId: string
  operationID: string
  action: SessionTransferAction
  targetWorktreeId?: string
  create?: boolean
  branch?: string
  selectedFiles?: string[]
  revision?: string
  fingerprint?: string
}

export type SessionTransferReply = {
  type: "agentManager.sessionTransferResult"
  phase: SessionTransferRequest["phase"]
  projectId: string
  sourceSessionId: string
  requestId: string
  operationID: string
  targetWorktreeId?: string
  targets?: Array<{ id: string; name: string; path: string }>
  files?: string[]
  head?: string
  preview?: { revision: string; fingerprint: string; files: Array<{ path: string; kind: string; sourceHash: string }> }
  result?: { sessionID: string; action: SessionTransferAction; directory: string }
  error?: string
  paths?: string[]
  code?: string
}
