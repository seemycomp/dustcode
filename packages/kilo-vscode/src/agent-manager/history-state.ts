import type { WorktreeStateManager } from "./WorktreeStateManager"

/** Persisted sidebar preferences shared with the history disclosure state. */
export function sidebarState(state: WorktreeStateManager) {
  return {
    tabOrder: state.getTabOrder(),
    pinnedTabs: state.getPinnedTabs(),
    worktreeOrder: state.getWorktreeOrder(),
    sessionsCollapsed: state.getSessionsCollapsed(),
    historyExpanded: state.getHistoryExpanded(),
    historyInitialized: state.getHistoryInitialized(),
    sidebarCollapsed: state.getSidebarCollapsed(),
    reviewDiffStyle: state.getReviewDiffStyle(),
    defaultBaseBranch: state.getDefaultBaseBranch(),
    activeTarget: state.getActiveTarget(),
  }
}
