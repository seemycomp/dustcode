import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const file = Bun.file(path.join(root, ".github/workflows/test-vscode.yml"))
const workflow = Bun.YAML.parse(await file.text()) as {
  permissions: Record<string, string>
  jobs: Record<
    string,
    {
      needs?: string
      "runs-on": string
      steps: { run?: string; uses?: string; with?: Record<string, string> }[]
      strategy?: { matrix: { include: { runner: string; target: string }[] } }
    }
  >
}

describe("VS Code fork CI", () => {
  test("only enables extension CI and JavaScript security scanning", async () => {
    const files = await Array.fromAsync(new Bun.Glob("*.{yml,yaml}").scan(path.join(root, ".github/workflows")))
    expect(files.sort()).toEqual(["codeql.yml", "test-vscode.yml"])
  })

  test("checks backend contracts before packaging", () => {
    const job = workflow.jobs.check
    expect(job).toBeDefined()
    expect(job?.steps.some((step) => step.run?.includes("test/server/"))).toBe(true)
    expect(workflow.jobs.package?.needs).toBe("check")
  })

  test("packages native desktop targets without publishing credentials", async () => {
    expect(workflow.permissions).toEqual({ contents: "read" })
    expect(workflow.jobs.package?.strategy?.matrix.include.map((item) => item.target)).toEqual([
      "linux-x64",
      "darwin-x64",
      "darwin-arm64",
      "win32-x64",
    ])
    expect(await file.text()).not.toContain("secrets.")
    expect(workflow.jobs.package?.steps.some((step) => step.run === "bun run build:vscode")).toBe(true)
    expect(workflow.jobs.package?.steps.some((step) => step.with?.["if-no-files-found"] === "error")).toBe(true)
    expect(workflow.jobs.package?.steps.some((step) => step.with?.name === "dustcode-${{ matrix.target }}")).toBe(true)
    expect(workflow.jobs.inventory?.needs).toBe("package")
    expect(workflow.jobs.inventory?.steps.some((step) => step.with?.pattern === "dustcode-*")).toBe(true)
    expect(workflow.jobs.inventory?.steps.some((step) => step.uses === "./.github/actions/setup-sbom")).toBe(true)
    expect(workflow.jobs.inventory?.steps.some((step) => step.run?.includes("syft scan"))).toBe(true)
  })

  test("scopes typechecking to extension, backend and embedded console", async () => {
    const pkg = await Bun.file(path.join(root, "package.json")).json()
    expect(pkg.scripts.typecheck).toBe("bun run script/kilocode/typecheck.ts")
    expect(pkg.scripts["typecheck:vscode"]).toStartWith("bun run script/kilocode/typecheck.ts ")
    expect(pkg.scripts["typecheck:vscode"]).toContain("--filter=dustcode...")
    expect(pkg.scripts["typecheck:vscode"]).toContain("--filter=@kilocode/cli...")
    expect(pkg.scripts["typecheck:vscode"]).toContain("--filter=@kilocode/kilo-console...")
    expect(pkg.scripts["build:vscode"]).toBe("bun run script/kilocode/build-vscode.ts")
    const hook = await Bun.file(path.join(root, ".husky/pre-push")).text()
    expect(hook).toContain("bun run typecheck:vscode")
    expect(hook).not.toContain("@kilocode/kilo-jetbrains")
  })

  test.skipIf(process.platform !== "win32")(
    "typechecks with native Bun ahead of Windows command shims",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "dustcode-typecheck-"))
      try {
        await Bun.write(path.join(dir, "bun.cmd"), "@exit /b 73\r\n")
        const child = Bun.spawn(
          [
            process.execPath,
            path.join(root, "script/kilocode/typecheck.ts"),
            "--filter=@kilocode/kilo-docs",
            "--only",
            "--force",
          ],
          {
            cwd: root,
            env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` },
            stdout: "pipe",
            stderr: "pipe",
          },
        )
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        expect({ code, output: code === 0 ? "" : stdout + stderr }).toEqual({ code: 0, output: "" })
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
    60_000,
  )

  test("keeps the fork identity and defaults independent of Kilo", async () => {
    const pkg = await Bun.file(path.join(root, "packages/kilo-vscode/package.json")).json()
    const props = pkg.contributes.configuration.properties
    expect([pkg.publisher, pkg.name, pkg.displayName]).toEqual(["dustcode", "dustcode", "Dustcode"])
    expect(pkg.repository.url).toBe("https://github.com/seemycomp/dustcode.git")
    expect(pkg.contributes.commands.every((item: { command: string }) => item.command.startsWith("dustcode."))).toBe(
      true,
    )
    expect(Object.keys(props).every((key) => key.startsWith("dustcode."))).toBe(true)
    expect(props["dustcode.autocomplete.enableAutoTrigger"].default).toBe(false)
    expect(props["dustcode.autocomplete.enableChatAutocomplete"].default).toBe(false)
    expect(props["dustcode.autocomplete.enableSmartInlineTaskKeybinding"].default).toBe(false)
    expect(props["dustcode.agentManager.worktreePool"].default).toBe(false)
    expect(
      pkg.contributes.keybindings.every(
        (item: { command: string; when?: string }) =>
          item.command.startsWith("dustcode.") && item.when?.includes("dustcode."),
      ),
    ).toBe(true)
    expect(pkg.contributes.views["dustcode-ActivityBar"].map((item: { id: string }) => item.id)).toEqual([
      "dustcode.SidebarProvider",
    ])
    expect(pkg.contributes.taskDefinitions.map((item: { type: string }) => item.type)).toEqual([
      "dustcode-worktree-setup",
    ])
    expect(Object.keys(pkg.contributes.icons)).toEqual(["dustcode-logo"])
  })

  test("keeps dependency automation within the shared Bun workspace", async () => {
    const config = Bun.YAML.parse(await Bun.file(path.join(root, ".github/dependabot.yml")).text()) as {
      updates: { "package-ecosystem": string; directory: string }[]
    }
    expect(config.updates.map((item) => [item["package-ecosystem"], item.directory])).toEqual([["bun", "/"]])
  })
})
