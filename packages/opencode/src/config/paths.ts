export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Profile } from "@opencode-ai/core/kilocode/profile" // kilocode_change

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  if (Profile.enabled) return [] // kilocode_change - project files live only inside .dustcode
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.KILO_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: Profile.dirs(), // kilocode_change
          start: directory,
          stop: worktree,
        })
      : []),
    ...(!Profile.enabled
      ? yield* afs.up({
          // kilocode_change
          targets: [".kilocode", ".kilo"], // kilocode_change
          start: Global.Path.home,
          stop: Global.Path.home,
        })
      : []), // kilocode_change
    ...(!Profile.enabled && Flag.KILO_CONFIG_DIR ? [Flag.KILO_CONFIG_DIR] : []), // kilocode_change
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
