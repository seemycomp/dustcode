import { describe, expect, it } from "bun:test"
import { fixture } from "../fixtures/run"
import { decodeImageDataUrl } from "../../webview-ui/src/components/chat/image-data"

describe("message attachment image interactions", () => {
  it("decodes image data locally without a network request", async () => {
    const data = "data:image/png;base64,AAECAwQ="
    const blob = decodeImageDataUrl(data)
    expect(blob.type).toBe("image/png")
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 3, 4]))
  })

  it("opens a popup and handles image actions on the thumbnail and popup", async () => {
    await fixture("message-image-interactions")
  }, 60000)
})
