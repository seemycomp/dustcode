import { Schema } from "effect"

export const PersistenceQuery = Schema.Struct({
  dispose: Schema.optional(
    Schema.Boolean.annotate({
      description: "Dispose loaded instances after persistence (default: true). Set false to dispose explicitly later.",
    }),
  ),
})
