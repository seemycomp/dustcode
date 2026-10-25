import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it("keeps compact review requests scoped to the active session", () => fixture("session-review-state"), 60_000)
