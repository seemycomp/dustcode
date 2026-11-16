import { afterEach, describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import { registerTerminalActions } from "../../src/services/code-actions/register-terminal-actions"

type Command = (...args: unknown[]) => unknown

type Api = typeof vscode & {
  commands: {
    registerCommand: (command: string, callback: Command) => { dispose(): void }
    executeCommand: (...args: unknown[]) => Promise<void>
  }
}

const api = vscode as Api
const original = {
  register: api.commands.registerCommand,
  execute: api.commands.executeCommand,
}

function setup(active = false) {
  const commands = new Map<string, Command>()
  const executed: unknown[][] = []
  const events: string[] = []
  const posts: unknown[] = []
  const waits: string[] = []
  const context = { subscriptions: [] as Array<{ dispose(): void }> } as vscode.ExtensionContext
  const provider = {
    postMessage: (msg: unknown) => {
      events.push("post")
      posts.push(msg)
    },
    waitForReady: async () => {
      events.push("wait")
      waits.push("provider")
    },
  }
  const agent = {
    isActive: () => active,
    waitForReady: async () => {
      events.push("wait")
      waits.push("agent")
      return true
    },
    postMessage: (msg: unknown) => {
      events.push("post")
      posts.push(msg)
    },
  }

  api.commands.registerCommand = (command, callback) => {
    commands.set(command, callback)
    return { dispose: () => undefined }
  }
  api.commands.executeCommand = async (...args) => {
    events.push("focus")
    executed.push(args)
  }

  registerTerminalActions(context, () => provider, agent as never)

  return { commands, events, executed, posts, waits }
}

afterEach(() => {
  api.commands.registerCommand = original.register
  api.commands.executeCommand = original.execute
})

describe("registerTerminalActions", () => {
  it("resolves terminal command fallbacks lazily without awaiting an unattached legacy provider", async () => {
    const state = setup()
    const legacy = Promise.withResolvers<void>()
    const waits: string[] = []
    const posts: unknown[] = []
    let destination = {
      waitForReady: () => {
        waits.push("legacy")
        return legacy.promise
      },
      postMessage: (_msg: unknown) => {
        throw new Error("legacy provider must not receive terminal actions")
      },
    }
    registerTerminalActions({ subscriptions: [] } as unknown as vscode.ExtensionContext, (() => destination) as never)
    destination = {
      waitForReady: async () => {
        waits.push("manager")
      },
      postMessage: (msg) => {
        posts.push(msg)
      },
    }
    for (const command of ["terminalAddToContext", "terminalFixCommand", "terminalExplainCommand"]) {
      await state.commands.get(`dustcode.${command}`)?.({ selection: "bun test" })
    }
    expect(waits).toEqual(Array(3).fill("manager"))
    expect(posts).toHaveLength(4)
    expect(state.executed).toEqual(Array(3).fill(["dustcode.SidebarProvider.focus"]))
  })
  it("reveals the sidebar before adding terminal output to context", async () => {
    const state = setup()

    await state.commands.get("dustcode.terminalAddToContext")?.({ selection: "bun test" })

    expect(state.events).toEqual(["focus", "wait", "post", "post"])
    expect(state.executed).toEqual([["dustcode.SidebarProvider.focus"]])
    expect(state.waits).toEqual(["provider"])
    expect(state.posts).toEqual([
      {
        type: "appendChatBoxMessage",
        text: "\nTerminal output:\n```\nbun test\n```",
      },
      { type: "action", action: "focusInput" },
    ])
  })

  it("adds terminal output to the active Agent Manager without revealing the sidebar", async () => {
    const state = setup(true)

    await state.commands.get("dustcode.terminalAddToContext")?.({ selection: "bun test" })

    expect(state.events).toEqual(["wait", "post", "post"])
    expect(state.executed).toEqual([])
    expect(state.waits).toEqual(["agent"])
    expect(state.posts).toEqual([
      {
        type: "appendChatBoxMessage",
        text: "\nTerminal output:\n```\nbun test\n```",
      },
      { type: "action", action: "focusInput" },
    ])
  })
})
