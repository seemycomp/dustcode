import { describe, expect, it } from "bun:test"
import { fetchSessionPage, mergeSessions, SESSION_PAGE_LIMIT } from "../../src/kilo-provider/session-page"

type Item = { id: string; time: { updated: number } }

function client(data: Item[], header?: string, id?: string) {
  const calls: Array<Record<string, unknown>> = []
  const headers = new Headers()
  if (header !== undefined) headers.set("x-next-cursor", header)
  if (id !== undefined) headers.set("x-next-cursor-id", id)
  return {
    calls,
    experimental: {
      session: {
        list: async (query: Record<string, unknown>) => {
          calls.push(query)
          return { data, response: { headers } }
        },
      },
    },
  }
}

describe("fetchSessionPage", () => {
  it("requests one page for the directory and returns the header cursor", async () => {
    const api = client([{ id: "ses_1", time: { updated: 10 } }], "7")
    const page = await fetchSessionPage(api as never, { dir: "/repo" })

    expect(api.calls).toEqual([
      { directory: "/repo", roots: true, archived: true, limit: SESSION_PAGE_LIMIT, cursor: undefined },
    ])
    expect(page.cursor).toBe(7)
  })

  it("ignores an empty or non-positive cursor header", async () => {
    const empty = client([{ id: "ses_1", time: { updated: 10 } }], "")
    expect((await fetchSessionPage(empty as never, { dir: "/repo" })).cursor).toBeUndefined()

    const zero = client([{ id: "ses_1", time: { updated: 10 } }], "0")
    expect((await fetchSessionPage(zero as never, { dir: "/repo" })).cursor).toBeUndefined()
  })

  it("returns no cursor when the header is missing", async () => {
    const api = client([{ id: "ses_1", time: { updated: 10 } }])
    const page = await fetchSessionPage(api as never, { dir: "/repo" })

    expect(page.cursor).toBeUndefined()
  })

  it("forwards a paired cursor and returns the next ID without changing the numeric cursor", async () => {
    const api = client([{ id: "ses_2", time: { updated: 7 } }], "7", "ses_2")
    const page = await fetchSessionPage(api as never, { dir: "/repo", cursor: 7, cursorID: "ses_3", limit: 2 })

    expect(api.calls).toEqual([
      { directory: "/repo", roots: true, archived: true, limit: 2, cursor: 7, cursorID: "ses_3" },
    ])
    expect(page.cursor).toBe(7)
    expect(page.nextCursorID).toBe("ses_2")
    expect(page.sessions.map((item) => item.id)).toEqual(["ses_2"])
  })

  it("keeps timestamp-only responses compatible and ignores unpaired ID headers", async () => {
    expect((await fetchSessionPage(client([], "7") as never, { dir: "/repo" })).nextCursorID).toBeUndefined()
    expect(
      (await fetchSessionPage(client([], undefined, "ses_2") as never, { dir: "/repo" })).nextCursorID,
    ).toBeUndefined()
  })

  it("forwards title search without altering paired pagination", async () => {
    const api = client([], "7", "ses_2")
    await fetchSessionPage(api as never, { dir: "/repo", search: "older title", cursor: 7, cursorID: "ses_3" })
    expect(api.calls.at(0)).toMatchObject({ search: "older title", cursor: 7, cursorID: "ses_3" })
  })

  it("retains a zero timestamp only when paired with an ID", async () => {
    const page = await fetchSessionPage(client([], "0", "ses_2") as never, { dir: "/repo" })
    expect(page.cursor).toBe(0)
    expect(page.nextCursorID).toBe("ses_2")
  })
})

describe("mergeSessions", () => {
  it("dedupes ids and sorts newest first", () => {
    const merged = mergeSessions([
      [{ id: "a", time: { updated: 1 } }],
      [
        { id: "b", time: { updated: 3 } },
        { id: "a", time: { updated: 2 } },
      ],
    ] as never)

    expect(merged.map((session) => session.id)).toEqual(["b", "a"])
  })
})
