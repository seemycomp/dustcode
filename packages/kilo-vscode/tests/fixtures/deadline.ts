export async function deadline<T>(run: () => Promise<T>, stop: () => void, ms: number) {
  let expired = false
  const timer = setTimeout(() => {
    expired = true
    stop()
  }, ms)
  try {
    // Cancellation is a request, not settlement: never race the owned operation.
    const result = await run()
    if (expired) throw new Error(`Fixture deadline exceeded (${ms}ms)`)
    return result
  } finally {
    clearTimeout(timer)
  }
}
