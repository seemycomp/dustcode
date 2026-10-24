import { expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"

test.each([false, true])(
  "built-in persona and callback branding follows the profile (enabled=%s)",
  async (enabled) => {
    await using tmp = await tmpdir()
    const env = { ...process.env }
    delete env.DUSTCODE_HOME
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `
      import { SystemPrompt } from "./src/session/system"
      import { ProviderTest } from "./test/fake/provider"
      import { reviewCommand } from "./src/kilocode/review/command"
      import { KiloOauthCallbackPage } from "@opencode-ai/core/kilocode/oauth/page"
      import { createCaffeinationDriver } from "@opencode-ai/core/kilocode/caffeination"
      import { renderOAuthError } from "./src/plugin/openai/codex"
      import { Instance } from "./src/kilocode/instance"
      import { KiloSessionPrompt } from "./src/kilocode/session/prompt"
      import { McpOAuthCallback } from "./src/mcp/oauth-callback"
      import { createServer } from "net"
      import { Effect } from "effect"
      import { LLMRequestPrep } from "./src/session/llm/request"
      import { RuntimeFlags } from "./src/effect/runtime-flags"
      import { notice } from "./src/kilocode/command/reserved"
      import { KiloSessionProcessor } from "./src/kilocode/session/processor"
      const model = ProviderTest.model()
      const flags = await Effect.runPromise(RuntimeFlags.Service.pipe(Effect.provide(RuntimeFlags.layer({ client: "test" }))))
      const requests = []
      for (const oauth of [false, true]) {
        const result = await Effect.runPromise(LLMRequestPrep.prepare({
          user: { id: "msg_branding", sessionID: "ses_branding", role: "user", time: { created: 0 }, agent: "code", model: { providerID: model.providerID, modelID: model.id } },
          sessionID: "ses_branding", model, agent: { name: "code", mode: "primary", options: {}, permission: [], prompt: "Custom Kilo Gateway instructions" },
          system: [], messages: [], tools: {}, provider: ProviderTest.info({ id: oauth ? "openai" : "test" }),
          auth: oauth ? { type: "oauth", refresh: "refresh", access: "access", expires: Date.now() + 60000 } : undefined,
          plugin: { trigger: (_name, _input, output) => Effect.succeed(output) }, flags, isWorkflow: false,
        }))
        requests.push({ text: oauth ? result.params.options.instructions : result.system.join("\\n"), headers: result.headers })
      }
      const dir = process.env.TEST_DIRECTORY
      const user = { info: { id: "msg_branding", sessionID: "ses_branding" }, parts: [] }
      await Instance.restore({ directory: dir, worktree: dir, project: { vcs: "git" } }, () => KiloSessionPrompt.insertPlanReminders({ agent: { name: "plan" }, session: { slug: "branding", time: { created: 1 } }, userMessage: user }))
      const probe = createServer()
      await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve))
      const port = probe.address().port
      await new Promise(resolve => probe.close(resolve))
      const uri = "http://127.0.0.1:" + port + "/callback"
      await McpOAuthCallback.ensureRunning(uri)
      const failure = await fetch(uri + "?state=missing&error=access_denied&error_description=Kilo%20Gateway%20denied%20%3Cscript%3E").then(res => res.text())
      await McpOAuthCallback.ensureRunning(uri)
      const callback = McpOAuthCallback.waitForCallback("branding")
      const success = await fetch(uri + "?state=branding&code=code").then(res => res.text())
      await callback
      await McpOAuthCallback.stop()
      const prompts = ["anthropic", "anthropic_without_todo", "beast", "codex", "gemini", "gpt55", "ling", "trinity"].flatMap(prompt => SystemPrompt.provider(ProviderTest.model({ prompt })))
      const models = ["gpt-4", "gpt-5", "gpt-5-codex", "gemini-pro", "claude-sonnet", "trinity", "kimi", "ling-2", "muse-glimmer", "unknown"]
      for (const id of models) prompts.push(...SystemPrompt.provider(ProviderTest.model({ api: { id, url: "https://example.com", npm: "@ai-sdk/openai" } })))
      const calls = []
      const driver = createCaffeinationDriver({ platform: "linux", locate: name => name, spawn: (command, args) => { calls.push(args); throw new Error("captured") } })
      await driver.start(process.pid, () => {}).catch(err => { if (err.message !== "captured") throw err })
      console.log(JSON.stringify({ soul: SystemPrompt.soul(), instructions: SystemPrompt.instructions(), prompts, requests, warning: notice("goal"), error: KiloSessionProcessor.PROVIDER_FINISH_ERROR_MESSAGE, review: reviewCommand().template, plan: user.parts.map(part => part.text).join("\\n"), failure, pages: [KiloOauthCallbackPage.success({ provider: "ChatGPT" }), KiloOauthCallbackPage.error("Denied <script>", { provider: "ChatGPT" }), renderOAuthError("Denied <script>"), success], args: calls[0] }))
      process.exit(0)
    `,
      ],
      {
        cwd: path.resolve(import.meta.dir, "../.."),
        env: {
          ...env,
          ...(enabled ? { DUSTCODE_HOME: path.join(tmp.path, "profile") } : {}),
          TEST_DIRECTORY: tmp.path,
          KILO_DB: ":memory:",
        },
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      },
    )
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(err).not.toContain("error:")
    expect(code, err).toBe(0)
    const result = JSON.parse(out.trim().split("\n").at(-1)!)
    const name = enabled ? "Dustcode" : "Kilo"
    expect(result.soul).toStartWith(`You are ${name},`)
    expect(result.instructions).toStartWith(`You are ${name},`)
    expect(result.warning).toContain(`reserved for ${name}'s own command`)
    expect(result.error).toContain(`${name} will compact`)
    expect(result.review).toStartWith(`You are ${enabled ? "Dustcode" : "Kilo Code"},`)
    expect(result.plan).toContain(`You are ${enabled ? "Dustcode" : "Kilo Code"}, an experienced technical leader`)
    expect(result.failure).toContain(`<title>${name} - Authorization Failed</title>`)
    expect(result.failure).toContain("Kilo Gateway denied &lt;script&gt;")
    for (const prompt of result.prompts as string[]) {
      if (enabled) {
        expect(prompt).toStartWith("You are Dustcode,")
        expect(prompt).not.toContain("Kilo-Org/kilocode")
        expect(prompt).not.toContain("https://kilo.ai/docs")
        expect(prompt).not.toMatch(/\bKilo(?: Code)?\b/)
      }
      if (!enabled) expect(prompt).toMatch(/^You are (Kilo(?: Code)?|opencode),/)
    }
    for (const page of result.pages as string[]) {
      expect(page).toContain(name)
      if (enabled) expect(page).not.toMatch(/Kilo|OpenCode/)
    }
    expect(result.pages[1]).toContain("Denied &lt;script&gt;")
    expect(result.pages[2]).toContain("Denied &lt;script&gt;")
    expect(result.args).toContain(`--who=${enabled ? "Dustcode" : "Kilo Code"}`)
    expect(result.args).toContain(`--why=${name} agent running`)
    expect(result.args).toContain("kilo-caffeination")
    for (const request of result.requests as { text: string; headers: Record<string, string> }[]) {
      expect(request.text).toStartWith(`You are ${name},`)
      expect(request.text).toContain("Custom Kilo Gateway instructions")
      expect(request.headers["X-Title"]).toBe("Kilo Code")
    }
  },
  120_000,
)
