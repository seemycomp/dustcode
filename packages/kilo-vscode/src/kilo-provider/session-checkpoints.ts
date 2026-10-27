const owners = new WeakMap<object, Map<string, Promise<void>>>()

/** Panels sharing a backend must also share history/submission barriers. */
export function sessionCheckpoints(owner: object) {
  const existing = owners.get(owner)
  if (existing) return existing
  const pending = new Map<string, Promise<void>>()
  owners.set(owner, pending)
  return pending
}
