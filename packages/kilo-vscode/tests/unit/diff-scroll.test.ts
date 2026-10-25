import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it(
  "scrolls to the requested source side after line numbers shift in unified and split diffs",
  () => fixture("diff-scroll"),
  30_000,
)
