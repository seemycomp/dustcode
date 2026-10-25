import type { WorktreeFileDiff } from "../src/types/messages"
import { diffToken } from "./diff-state"

export type ReviewStatus = "pending" | "accepted"

export type ReviewStatusMap = Record<string, { token: string; status: ReviewStatus }>

function revision(diff: WorktreeFileDiff) {
  return JSON.stringify([diffToken(diff), diff.patch, diff.before, diff.after, diff.image])
}

export function reviewStatus(map: ReviewStatusMap, diff: WorktreeFileDiff): ReviewStatus {
  const value = map[diff.file]
  return value?.token === revision(diff) ? value.status : "pending"
}

export function setReviewStatus(
  map: ReviewStatusMap,
  diff: WorktreeFileDiff | WorktreeFileDiff[],
  status: ReviewStatus,
): ReviewStatusMap {
  const next = { ...map }
  for (const item of Array.isArray(diff) ? diff : [diff]) next[item.file] = { token: revision(item), status }
  return next
}

export function pruneReviewStatuses(map: ReviewStatusMap, diffs: WorktreeFileDiff[]): ReviewStatusMap {
  const current = new Map(diffs.map((diff) => [diff.file, revision(diff)]))
  return Object.fromEntries(Object.entries(map).filter(([file, value]) => current.get(file) === value.token))
}

export function reviewProgress(map: ReviewStatusMap, diffs: WorktreeFileDiff[]) {
  const accepted = diffs.filter((diff) => reviewStatus(map, diff) === "accepted").length
  return { accepted, total: diffs.length, pending: diffs.length - accepted }
}
