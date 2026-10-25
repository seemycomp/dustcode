import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it(
  "renders session-only file and hunk review controls with native context expansion",
  () => fixture("review-session-diff-render"),
  60_000,
)
