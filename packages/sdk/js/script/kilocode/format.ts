import { join, relative } from "node:path"
import * as prettier from "prettier"

export async function format(root: string) {
  const glob = new Bun.Glob("src/{gen,v2}/**/*")
  for await (const file of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) {
    const info = await prettier.getFileInfo(file, {
      ignorePath: [join(root, ".gitignore"), join(root, ".prettierignore")],
    })
    if (info.ignored || !info.inferredParser) continue
    const source = await Bun.file(file).text()
    const config = await prettier.resolveConfig(file, { editorconfig: true })
    const content = await prettier.format(source, { ...config, filepath: file })
    if (content === source) continue

    // Stay in Bun instead of invoking the Windows Prettier shim. A recently
    // generated file can still be temporarily unavailable to writers on Windows.
    const attempts = process.platform === "win32" ? 8 : 1
    for (let attempt = 1; ; attempt++) {
      try {
        await Bun.write(file, content)
        break
      } catch (err) {
        const retry =
          err instanceof Error &&
          "code" in err &&
          (["EBUSY", "EACCES", "EPERM"].includes(String(err.code)) ||
            (err.code === "UNKNOWN" && "syscall" in err && err.syscall === "open"))
        if (!retry || attempt >= attempts) throw err
        await Bun.sleep(50 * attempt)
      }
    }
    console.log(`[sdk] formatted ${relative(root, file)}`)
  }
}
