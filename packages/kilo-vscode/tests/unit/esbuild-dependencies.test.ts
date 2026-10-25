import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { builtinModules } from "node:module"
import os from "node:os"
import { build } from "esbuild"
import { listFiles, PackageManager } from "@vscode/vsce"
import playwright from "../../script/playwright-runtime"

const ROOT = path.resolve(import.meta.dir, "../..")
const PKG_FILE = path.join(ROOT, "package.json")
const ESBUILD_FILE = path.join(ROOT, "esbuild.js")

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

function extractPackageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null
  if (BUILTINS.has(specifier)) return null
  if (specifier.startsWith("node:")) return null

  if (specifier.startsWith("@")) {
    const parts = specifier.split("/")
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return specifier.split("/")[0]
}

function findImportsAndRequires(content: string): string[] {
  const specifiers = new Set<string>()
  const requireRegex = /require\(["']([^"']+)["']\)/g
  const importRegex = /(?:import|from)\s+["']([^"']+)["']/g

  for (const match of content.matchAll(requireRegex)) {
    specifiers.add(match[1])
  }
  for (const match of content.matchAll(importRegex)) {
    specifiers.add(match[1])
  }

  return Array.from(specifiers)
}

describe("Build Script Dependency Declarations", () => {
  it("packages runtime assets without development artifacts or local markers", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-vsix-files-"))
    const included = [
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "THIRD_PARTY_LICENSES/notice.txt",
      "assets/icon.svg",
      "audio-wav/notify.wav",
      "dist/extension.js",
      "dist/webview.css",
      "dist/font.woff2",
      "dist/settings/chunk.js",
      "dist/settings-preload.json",
      "dist/markdown-shiki-worker.js",
      "dist/node_modules/playwright-core/browsers.json",
      "dist/node_modules/zod/index.d.ts",
      "dist/licenses/playwright-core/LICENSE",
      "bin/kilo.exe",
      "bin/kilo",
      "bin/ffmpeg.exe",
      "bin/bwrap",
      "bin/kilo-sandbox-mutation-worker.js",
      "bin/kilo-sandbox-network-relay.js",
      "bin/kilo-sandbox-seccomp",
      "bin/tree-sitter/tree-sitter.wasm",
      "bin/licenses/bubblewrap/build.ts",
      "bin/licenses/bubblewrap/source.tar.gz",
    ]
    const excluded = [
      "storybook-static/index.html",
      ".storybook/main.js",
      ".turbo/build.log",
      "docs/notes.md",
      "tests/example.js",
      "test-results/result.json",
      "bunfig.toml",
      "knip.json",
      "src/main.ts",
      "out/previous.vsix",
      "node_modules/.cache/sdk.json",
      "bin/.cli-version",
      "bin/.ffmpeg-target",
      "bin/.ffmpeg-tmp/package/ffmpeg.exe",
      "dist/extension.js.map",
      "dist/settings/chunk.js.map",
      "dist/node_modules/zod/index.js.map",
      "bin/console/assets/chunk.js.map",
      "bin/console/assets/chunk.js",
      "bin/console/index.html",
    ]
    try {
      for (const file of [...included, ...excluded]) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        fs.writeFileSync(path.join(dir, file), "fixture")
      }
      fs.copyFileSync(PKG_FILE, path.join(dir, "package.json"))
      fs.copyFileSync(path.join(ROOT, ".vscodeignore"), path.join(dir, ".vscodeignore"))
      const files = await listFiles({ cwd: dir, packageManager: PackageManager.None })
      for (const file of included) expect(files, file).toContain(file)
      for (const file of excluded) expect(files, file).not.toContain(file)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("esbuild.js must declare all imported/required packages in package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_FILE, "utf8"))
    const declared = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      "vscode",
    ])

    const esbuildContent = fs.readFileSync(ESBUILD_FILE, "utf8")
    const specifiers = findImportsAndRequires(esbuildContent)

    const undeclared: string[] = []
    for (const spec of specifiers) {
      const pkgName = extractPackageName(spec)
      if (pkgName && !declared.has(pkgName)) {
        undeclared.push(`${spec} (package: ${pkgName})`)
      }
    }

    expect(undeclared).toEqual([])
  })

  it("loads the packaged browser broker outside the repository", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-browser-runtime-"))
    const staging = path.join(dir, "staging")
    const installed = path.join(dir, "installed")
    try {
      await build({
        entryPoints: [path.join(ROOT, "src/services/browser-automation/browser-broker.ts")],
        outfile: path.join(staging, "dist/extension.js"),
        bundle: true,
        format: "cjs",
        platform: "node",
        minify: true,
        logLevel: "silent",
        plugins: [playwright],
      })
      for (const file of ["package.json", ".vscodeignore"]) {
        fs.copyFileSync(path.join(ROOT, file), path.join(staging, file))
      }
      const files = await listFiles({ cwd: staging, packageManager: PackageManager.None })
      for (const file of [
        "dist/node_modules/playwright-core/browsers.json",
        "dist/node_modules/playwright-core/lib/generated/utilityScriptSource.js",
        "dist/node_modules/chromium-bidi/node_modules/zod/package.json",
      ]) {
        expect(files).toContain(file)
      }
      for (const file of files) {
        const target = path.join(installed, file)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(path.join(staging, file), target)
      }
      const child = Bun.spawnSync(
        [
          "node",
          "--no-global-search-paths",
          "-e",
          `
          const assert = require("node:assert/strict")
          const fs = require("node:fs")
          const path = require("node:path")
          const entry = process.argv[1]
          const load = require("node:module").createRequire(entry)
          assert.equal(typeof load(entry).BrowserBroker, "function")
          assert.equal(load("playwright-core").chromium.name(), "chromium")
          const manifest = fs.realpathSync(load.resolve("playwright-core/package.json"))
          assert.ok(manifest.startsWith(fs.realpathSync(path.dirname(entry)) + path.sep))
        `,
          path.join(installed, "dist/extension.js"),
        ],
        {
          cwd: installed,
          env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
