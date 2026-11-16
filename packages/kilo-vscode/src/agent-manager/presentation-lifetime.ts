import type { Disposable } from "./host"

/** A view is owned by VS Code; a panel can also be explicitly disposed. */
export class PresentationLifetime implements Disposable {
  private live = true
  private readonly listeners = new Set<() => void>()
  private readonly subscription: Disposable

  constructor(
    watch: (cb: () => void) => Disposable,
    private readonly release: () => void,
    private readonly cleanup: () => void,
  ) {
    this.subscription = watch(() => this.dispose())
  }

  onDidDispose(cb: () => void): Disposable {
    if (!this.live) {
      cb()
      return { dispose: () => {} }
    }
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }

  when(active: () => boolean, watch: (cb: () => void) => Disposable): Promise<void> {
    if (!this.live || active()) return Promise.resolve()
    const wait = Promise.withResolvers<void>()
    const changed = watch(() => {
      if (active()) wait.resolve()
    })
    const closed = this.onDidDispose(() => wait.resolve())
    return wait.promise.finally(() => {
      changed.dispose()
      closed.dispose()
    })
  }

  dispose(): void {
    if (!this.live) return
    this.live = false
    this.subscription.dispose()
    try {
      for (const cb of this.listeners) cb()
    } finally {
      this.listeners.clear()
      this.cleanup()
      this.release()
    }
  }
}
