import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it("keeps history preferences and panel presentation scoped outside row mounts", () => fixture("history-state"))
