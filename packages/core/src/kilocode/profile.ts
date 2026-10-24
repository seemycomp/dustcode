import path from "path"

export namespace Profile {
  export const root = process.env.DUSTCODE_HOME || undefined
  if (root && !path.isAbsolute(root)) throw new Error("DUSTCODE_HOME must be an absolute path")
  export const enabled = root !== undefined

  export function dir() {
    return enabled ? ".dustcode" : ".kilo"
  }

  export function dirs(project = false) {
    return enabled ? [".dustcode"] : project ? [".kilo", ".kilocode"] : [".kilocode", ".kilo"]
  }

  export function files() {
    return enabled ? ["kilo.json", "kilo.jsonc"] : ["kilo.json", "kilo.jsonc", "opencode.json", "opencode.jsonc"]
  }

  export function global() {
    return root ? path.join(root, "config") : undefined
  }
}
