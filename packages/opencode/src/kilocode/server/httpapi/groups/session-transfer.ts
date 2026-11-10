import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { PreviewInput, CommitInput } from "@/kilocode/session-transfer/service"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
} from "@/server/routes/instance/httpapi/middleware/workspace-routing"

const root = "/kilocode/session-transfer"
export const TransferPreview = Schema.Struct({
  operationID: Schema.String,
  action: Schema.Literals(["move", "copy"]),
  sourceSessionID: Schema.String,
  sourceDirectory: Schema.String,
  targetDirectory: Schema.String,
  revision: Schema.String,
  fingerprint: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String, kind: Schema.String, sourceHash: Schema.String })),
})
export const TransferResult = Schema.Struct({
  operationID: Schema.String,
  sourceSessionID: Schema.String,
  sessionID: Schema.String,
  action: Schema.Literals(["move", "copy"]),
  directory: Schema.String,
})
export class TransferHttpError extends Schema.ErrorClass<TransferHttpError>("SessionTransferError")(
  { message: Schema.String, code: Schema.optional(Schema.String), paths: Schema.optional(Schema.Array(Schema.String)) },
  { httpApiStatus: 409 },
) {}

export const SessionTransferApi = HttpApi.make("sessionTransfer").add(
  HttpApiGroup.make("sessionTransfer")
    .add(
      HttpApiEndpoint.post("preview", `${root}/preview`, {
        payload: PreviewInput,
        query: WorkspaceRoutingQuery,
        success: TransferPreview,
        error: TransferHttpError,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "kilocode.sessionTransfer.preview", summary: "Preview a session transfer" }),
      ),
      HttpApiEndpoint.post("commit", `${root}/commit`, {
        payload: CommitInput,
        query: WorkspaceRoutingQuery,
        success: TransferResult,
        error: TransferHttpError,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "kilocode.sessionTransfer.commit", summary: "Commit a session transfer" }),
      ),
      HttpApiEndpoint.get("status", `${root}/status/:operationID`, {
        params: { operationID: Schema.String },
        query: WorkspaceRoutingQuery,
        success: TransferResult,
        error: TransferHttpError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "kilocode.sessionTransfer.status",
          summary: "Get a session transfer result",
        }),
      ),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
