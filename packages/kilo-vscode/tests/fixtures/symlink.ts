import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export const links = await (async () => {
  const root = await mkdtemp(path.join(tmpdir(), "kilo-file-link-"))
  try {
    await writeFile(path.join(root, "source"), "fixture")
    return await symlink(path.join(root, "source"), path.join(root, "alias"), "file").then(
      () => true,
      (err: NodeJS.ErrnoException) => {
        // Windows file symlinks require a capability that junctions do not.
        if (process.platform === "win32" && err.code === "EPERM") return false
        throw err
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})()
