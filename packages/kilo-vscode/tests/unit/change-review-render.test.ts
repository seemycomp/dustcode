import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it(
  "reviews files, tracks content revisions and confirms scoped rejection",
  () => fixture("change-review-render"),
  60_000,
)
