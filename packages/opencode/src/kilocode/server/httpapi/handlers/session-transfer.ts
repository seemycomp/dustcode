import { Cause, Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "@/server/routes/instance/httpapi/api"
import { TransferHttpError } from "../groups/session-transfer"
import { Service } from "@/kilocode/session-transfer/service"

export const sessionTransferHandlers = HttpApiBuilder.group(InstanceHttpApi, "sessionTransfer", (handlers) =>
  Effect.gen(function* () {
    const transfer = yield* Service
    const error = (cause: unknown) => new TransferHttpError({
      message: cause instanceof Error ? cause.message : "Session transfer failed",
      code: cause != null && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : undefined,
      paths: cause != null && typeof cause === "object" && "paths" in cause && Array.isArray(cause.paths) ? cause.paths.filter((path): path is string => typeof path === "string") : undefined,
    })
    const checked = <A, E>(work: Effect.Effect<A, E>) => work.pipe(Effect.catchCause((cause) => Effect.fail(error(Cause.squash(cause)))))
    return handlers
      .handle("preview", ({ payload }) => checked(transfer.preview(payload)))
      .handle("commit", ({ payload }) => checked(transfer.commit(payload)))
      .handle("status", ({ params }) =>
        checked(transfer.status(params.operationID).pipe(
          Effect.flatMap((value) => (value ? Effect.succeed(value) : Effect.fail(error("Transfer not found")))),
        )),
      )
  }),
)
