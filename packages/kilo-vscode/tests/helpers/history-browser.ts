import path from "node:path"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

let assets: { script: Uint8Array; css: Uint8Array } | undefined

export async function historyBrowser() {
  if (!assets) {
    const bundle = await build({
      entryPoints: [path.join(import.meta.dir, "../fixtures/worktree-history.tsx")],
      bundle: true,
      conditions: ["browser"],
      platform: "browser",
      format: "iife",
      outfile: "app.js",
      write: false,
      loader: { ".svg": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl" },
      plugins: [
        {
          name: "fixture-workers",
          setup(build) {
            build.onResolve({ filter: /\?worker&url$/ }, () => ({ path: "worker", namespace: "history-fixture" }))
            build.onLoad({ filter: /.*/, namespace: "history-fixture" }, () => ({
              contents: "export default '';",
              loader: "js",
            }))
          },
        },
        {
          name: "css-packages",
          setup(build) {
            build.onResolve({ filter: /^@/ }, (args) =>
              args.kind === "import-rule"
                ? build.resolve(args.path, { kind: "import-statement", resolveDir: args.resolveDir })
                : undefined,
            )
          },
        },
        solidPlugin(),
      ],
    })
    assets = {
      script: bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.contents,
      css: bundle.outputFiles.find((file) => file.path.endsWith(".css"))!.contents,
    }
  }
  const { script, css } = assets
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/app.js")
        return new Response(script, { headers: { "Content-Type": "application/javascript" } })
      if (url.pathname === "/app.css") return new Response(css, { headers: { "Content-Type": "text/css" } })
      return new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>History fixture</title><link rel="stylesheet" href="/app.css"></head><body style="margin:0"><script src="/app.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } },
      )
    },
  })
}
