import { expect, test } from "bun:test"
import { createHash } from "crypto"
import { QdrantVectorStore } from "../../src/indexing/vector-store/qdrant-client"

test("Dustcode collections cannot collide with original workspace collections", () => {
  const prior = process.env.DUSTCODE_HOME
  const workspace = "/test/workspace"
  const hash = createHash("sha256").update(workspace).digest("hex").slice(0, 16)
  try {
    delete process.env.DUSTCODE_HOME
    const original = new QdrantVectorStore(workspace, "http://localhost:6333", 1536)
    process.env.DUSTCODE_HOME = "/test/dustcode"
    const fork = new QdrantVectorStore(workspace, "http://localhost:6333", 1536)
    expect(Reflect.get(original, "collectionName")).toBe(`ws-${hash}`)
    expect(Reflect.get(fork, "collectionName")).toBe(`dustcode-ws-${hash}`)
  } finally {
    if (prior === undefined) delete process.env.DUSTCODE_HOME
    else process.env.DUSTCODE_HOME = prior
  }
})
