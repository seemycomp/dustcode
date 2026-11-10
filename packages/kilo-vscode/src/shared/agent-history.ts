export interface HistoryRow {
  id: string
  title: string
  updatedAt: string
}

export interface HistoryRequest {
  type: "agentManager.requestHistory"
  projectId: string
  worktreeId: string | null
  query: string
  requestId: string
  more?: boolean
  refresh?: boolean
  active?: boolean
}

export interface HistoryMessage {
  type: "agentManager.history"
  projectId: string
  worktreeId: string | null
  query: string
  requestId: string
  generation: number
  rows: HistoryRow[]
  more: boolean
  loading: boolean
  error?: string
}

export interface HistoryOpen {
  type: "agentManager.openHistorySession"
  projectId: string
  worktreeId: string | null
  sessionId: string
  requestId: string
}

export interface HistoryOpenFailed {
  type: "agentManager.historyOpenFailed"
  projectId: string
  worktreeId: string | null
  requestId: string
  error: string
}

export interface SetHistoryExpanded {
  type: "agentManager.setHistoryExpanded"
  projectId: string
  worktreeId: string | null
  expanded: boolean
  initialize?: boolean
}
