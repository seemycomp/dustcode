import { describe, expect, it } from "bun:test"
import { resubmitMessage } from "../../src/kilo-provider/resubmit-message"
import type { KiloClient, SessionMessageResponse } from "@kilocode/sdk/v2/client"
import { formatBrowserFeedback, partFeedback } from "../../src/shared/browser-feedback"
import { formatReviewCommentsMarkdown } from "../../src/shared/review-comments"

function fixture() {
  const stopped = Promise.withResolvers<void>()
  const reverted = Promise.withResolvers<void>()
  const events: string[] = []
  const source = {
    info: {
      id: "m1",
      sessionID: "s1",
      role: "user",
      agent: "plan",
      model: { providerID: "p", modelID: "m", variant: "high" },
    },
    parts: [
      {
        id: "p1",
        type: "text",
        text: "original",
        metadata: { kilo: { review: { version: 1, comments: [] }, browserFeedback: { version: 1, references: [] } } },
      },
      { id: "p2", type: "file", mime: "image/png", url: "data:image/png;base64,AA==", filename: "image.png" },
      {
        id: "p3",
        type: "file",
        mime: "text/plain",
        url: "file:///repo/file.ts",
        source: { type: "file", path: "/repo/file.ts", text: { value: "@file.ts", start: 0, end: 8 } },
      },
      { id: "p4", type: "agent", name: "explore", source: { value: "@explore", start: 9, end: 17 } },
    ],
  } as unknown as SessionMessageResponse
  const sent: Parameters<Parameters<typeof resubmitMessage>[1]["send"]>[0][] = []
  const client = { session: { message: async () => ({ data: source }) } } as unknown as KiloClient
  let pending: Promise<void> | undefined
  const ctx = {
    client,
    directory: "/repo",
    checkpoint: (run: () => Promise<void>) => {
      pending = Promise.resolve().then(run)
      return pending
    },
    stop: async () => {
      events.push("stop")
      await stopped.promise
      events.push("stopped")
    },
    revert: async () => {
      events.push("revert")
      await reverted.promise
      events.push("reverted")
    },
    send: async (prompt: Parameters<Parameters<typeof resubmitMessage>[1]["send"]>[0]) => {
      events.push("send")
      sent.push(prompt)
      return true
    },
  }
  return { ctx, source, stopped, reverted, events, sent }
}

describe("historical prompt resubmission", () => {
  it.each([
    { images: [] },
    { images: [{ id: "new", filename: "new.webp", mime: "image/webp", dataUrl: "data:image/webp;base64,AQ==" }] },
  ])("replaces image attachments with %j while preserving file mentions and context", async ({ images }) => {
    const f = fixture()
    const mention = {
      type: "file" as const,
      mime: "image/png",
      url: "file:///repo/icon.png",
      source: { type: "file" as const, path: "/repo/icon.png", text: { value: "@icon.png", start: 0, end: 9 } },
    }
    f.source.parts.push({ ...mention, id: "mention", sessionID: "s1", messageID: "m1" })
    f.stopped.resolve()
    f.reverted.resolve()

    await resubmitMessage({ sessionID: "s1", messageID: "m1", text: "edited", images }, f.ctx)

    const prompt = f.sent.at(0)
    expect(prompt).toMatchObject({
      agent: "plan",
      model: { providerID: "p", modelID: "m" },
      variant: "high",
    })
    const text = f.source.parts.find((part) => part.type === "text")
    expect(prompt?.parts.at(0)).toMatchObject({ text: "edited", metadata: text?.metadata })
    expect(prompt?.parts.filter((part) => part.type === "file")).toEqual([
      expect.objectContaining({ mime: "text/plain", url: "file:///repo/file.ts" }),
      mention,
      ...images.map((image) => ({ type: "file", mime: image.mime, url: image.dataUrl, filename: image.filename })),
    ])
    expect(prompt?.parts).toContainEqual({
      type: "agent",
      name: "explore",
      source: { value: "@explore", start: 9, end: 17 },
    })
  })

  it("adds inline images when the original turn has no image attachments", async () => {
    const f = fixture()
    f.source.parts = f.source.parts.filter((part) => part.type !== "file" || !part.mime.startsWith("image/"))
    f.stopped.resolve()
    f.reverted.resolve()

    await resubmitMessage(
      {
        sessionID: "s1",
        messageID: "m1",
        text: "edited",
        images: [
          { id: "png", filename: "new.png", mime: "image/png", dataUrl: "data:image/png;base64,AA==" },
          { id: "jpeg", filename: "new.jpg", mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AQ==" },
          { id: "gif", filename: "new.gif", mime: "image/gif", dataUrl: "data:image/gif;base64,Ag==" },
        ],
      },
      f.ctx,
    )

    expect(f.sent.at(0)?.parts.filter((part) => part.type === "file")).toHaveLength(4)
    expect(f.sent.at(0)?.parts).toContainEqual({
      type: "file",
      mime: "image/jpeg",
      url: "data:image/jpeg;base64,AQ==",
      filename: "new.jpg",
    })
  })

  it.each([undefined, true])("retains historical remote images when images is %s", async (replace) => {
    const f = fixture()
    const original = f.source.parts.find((part) => part.type === "file" && part.mime === "image/png")!
    if (original.type !== "file") throw new Error("Missing image fixture")
    original.url = "https://example.com/historical.png"
    f.stopped.resolve()
    f.reverted.resolve()

    await resubmitMessage(
      {
        sessionID: "s1",
        messageID: "m1",
        text: "edited",
        ...(replace
          ? { images: [{ id: "p2", filename: "image.png", mime: original.mime, dataUrl: original.url }] }
          : {}),
      },
      f.ctx,
    )

    expect(f.sent.at(0)?.parts).toContainEqual({
      type: "file",
      mime: "image/png",
      url: original.url,
      filename: "image.png",
    })
  })

  it.each([
    { mime: "image/png", dataUrl: "https://example.com/new.png" },
    { mime: "image/png", dataUrl: "file:///repo/new.png" },
    { mime: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,AA==" },
    { mime: "image/png", dataUrl: "data:image/jpeg;base64,AA==" },
    { mime: "image/png", dataUrl: "data:image/png;base64," },
    { mime: "image/png", dataUrl: "data:image/png;base64,%%%" },
    { mime: "image/png", dataUrl: "data:image/png;base64,A" },
    { mime: "image/png", dataUrl: "data:image/png;base64,AA==\n" },
  ])("rejects invalid image %j before abort or revert", async (image) => {
    const f = fixture()
    f.stopped.resolve()
    f.reverted.resolve()
    await expect(
      resubmitMessage(
        { sessionID: "s1", messageID: "m1", text: "edited", images: [{ id: "new", filename: "new", ...image }] },
        f.ctx,
      ),
    ).rejects.toThrow("Invalid image attachment")
    expect(f.events).toEqual([])
    expect(f.sent).toEqual([])
  })

  it("awaits tree stop and revert, then submits within its checkpoint with original context", async () => {
    const f = fixture()
    const result = resubmitMessage({ sessionID: "s1", messageID: "m1", text: "edited" }, f.ctx)
    await Bun.sleep(0)
    expect(f.events).toEqual(["stop"])
    f.stopped.resolve()
    await Bun.sleep(0)
    expect(f.events).toEqual(["stop", "stopped", "revert"])
    f.reverted.resolve()
    expect(await result).toBe(true)
    expect(f.events).toEqual(["stop", "stopped", "revert", "reverted", "send"])
    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]).toMatchObject({
      agent: "plan",
      model: { providerID: "p", modelID: "m" },
      variant: "high",
      parts: [
        {
          type: "text",
          text: "edited",
          metadata: f.source.parts.at(0)?.type === "text" ? f.source.parts.at(0)?.metadata : undefined,
        },
        { type: "file", mime: "image/png", url: "data:image/png;base64,AA==", filename: "image.png" },
        {
          type: "file",
          mime: "text/plain",
          url: "file:///repo/file.ts",
          source: { type: "file", path: "/repo/file.ts", text: { value: "@file.ts", start: 0, end: 8 } },
        },
        { type: "agent", name: "explore", source: { value: "@explore", start: 9, end: 17 } },
      ],
    })
    expect(typeof f.sent[0]?.messageID).toBe("string")
  })

  it.each(["stop", "revert"] as const)("does not send after %s failure", async (stage) => {
    const f = fixture()
    f.ctx[stage] = async () => {
      throw new Error(`${stage} failed`)
    }
    f.stopped.resolve()
    f.reverted.resolve()
    await expect(resubmitMessage({ sessionID: "s1", messageID: "m1", text: "edited" }, f.ctx)).rejects.toThrow(
      `${stage} failed`,
    )
    expect(f.sent).toEqual([])
  })

  it("emits one edited text and excludes backend-generated synthetic text", async () => {
    const f = fixture()
    f.source.parts = [
      ...(f.source.parts as unknown[]),
      { id: "p5", type: "text", text: "generated read context", synthetic: true },
      { id: "p6", type: "text", text: "ignored context", ignored: true },
    ] as never
    f.stopped.resolve()
    f.reverted.resolve()

    await resubmitMessage({ sessionID: "s1", messageID: "m1", text: "edited" }, f.ctx)

    expect(f.sent.at(0)?.parts.filter((part) => part.type === "text")).toEqual([
      expect.objectContaining({ type: "text", text: "edited" }),
    ])
  })

  it("round-trips rendered review and browser feedback prefixes", async () => {
    const f = fixture()
    const review = {
      version: 1 as const,
      comments: [
        {
          id: "c1",
          file: "src/app.ts",
          side: "additions" as const,
          line: 4,
          comment: "Fix this",
          selectedText: "const x = 1",
        },
      ],
    }
    const browser = {
      version: 1 as const,
      references: [{ id: "b1", sessionId: "s1", selector: "#save", text: "Save", url: "https://example.com/" }],
    }
    const reviewPrefix = formatReviewCommentsMarkdown(review.comments)
    const browserPrefix = formatBrowserFeedback(browser.references)
    f.source.parts[0] = {
      id: "p1",
      type: "text",
      text: `${reviewPrefix}\n\n${browserPrefix}\n\noriginal`,
      metadata: { kilo: { review, browserFeedback: browser } },
    } as never
    f.stopped.resolve()
    f.reverted.resolve()

    await resubmitMessage({ sessionID: "s1", messageID: "m1", text: "edited" }, f.ctx)

    expect(f.sent.at(0)?.parts.at(0)).toEqual({
      type: "text",
      text: `${reviewPrefix}\n\n${browserPrefix}\n\nedited`,
      metadata: { kilo: { review, browserFeedback: browser } },
    })
    const part = f.sent.at(0)?.parts.at(0)
    expect(part?.type === "text" && partFeedback(part.metadata, part.text)).toMatchObject({
      review,
      browserFeedback: browser,
      body: "edited",
    })
  })

  it("uses only explicitly supplied selection overrides", async () => {
    const f = fixture()
    f.stopped.resolve()
    f.reverted.resolve()
    await resubmitMessage(
      {
        sessionID: "s1",
        messageID: "m1",
        text: "edited",
        providerID: "other",
        modelID: "new",
        agent: "code",
        variant: "",
      },
      f.ctx,
    )
    expect(f.sent.at(0)).toMatchObject({ model: { providerID: "other", modelID: "new" }, agent: "code", variant: "" })
  })

  it("rejects messages outside the captured session before mutating it", async () => {
    const f = fixture()
    await expect(resubmitMessage({ sessionID: "other", messageID: "m1", text: "edited" }, f.ctx)).rejects.toThrow()
    expect(f.events).toEqual([])
    expect(f.sent).toEqual([])
  })
})
