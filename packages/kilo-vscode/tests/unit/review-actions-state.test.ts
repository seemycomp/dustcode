import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it(
  "correlates detailed session review decisions and invalidates stale contexts",
  () => fixture("review-actions-state"),
  60_000,
)
