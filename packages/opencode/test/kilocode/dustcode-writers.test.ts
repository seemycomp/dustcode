import { expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"

test("Dustcode agent and marketplace paths stay inside the isolated scope", async () => {
  await using tmp = await tmpdir()
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
      import path from "path"
      import { AgentBuilder } from "./src/kilocode/agent/builder"
      import * as Paths from "./src/kilocode/marketplace/paths"
      import { ConfigProtection } from "./src/kilocode/permission/config-paths"
      const dir = process.env.TEST_DIRECTORY
      const legacy = path.join(dir, ".kilo", "agent", "reviewer.md")
      await Bun.write(legacy, "original agent")
      const agent = await AgentBuilder.save({directory: dir, worktree: dir}, { id: "reviewer", scope: "project", mode: "all", prompt: "Review code" })
      console.log(JSON.stringify({ agent, files: Paths.pluginFiles("project", dir, dir), skills: Paths.skillsDir("global", dir), agents: Paths.agentsDir("project", dir), root: Paths.configRoot("project", dir), legacy: await Bun.file(legacy).text(), protected: ConfigProtection.isRelative(".dustcode/agent/test.md"), plan: ConfigProtection.isRelative(".dustcode/plans/test.md") }))
      process.exit(0)
      `,
    ],
    {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: { ...process.env, TEST_DIRECTORY: tmp.path, DUSTCODE_HOME: path.join(tmp.path, "profile") },
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(stderr).not.toContain("error:")
  expect(code).toBe(0)
  const out = JSON.parse(stdout.trim().split("\n").at(-1)!)
  const root = path.join(tmp.path, ".dustcode")
  expect(out.agent.path).toBe(path.join(root, "agent", "reviewer.md"))
  expect(await Bun.file(out.agent.path).text()).toContain("Review code")
  expect(out.files.every((file: string) => path.dirname(file) === root)).toBe(true)
  expect(out.skills).toBe(path.join(tmp.path, "profile", "config", "skills"))
  expect(out.agents).toBe(path.join(root, "agents"))
  expect(out.root).toBe(root)
  expect(out.legacy).toBe("original agent")
  expect(out.protected).toBe(true)
  expect(out.plan).toBe(false)
}, 120_000)
