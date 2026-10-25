import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it(
  "renders session changes and delegates scoped actions with loading and disabled guards",
  () => fixture("session-changes-render"),
  30_000,
)
