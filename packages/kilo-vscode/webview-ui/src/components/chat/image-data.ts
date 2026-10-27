import { imageMime } from "../../../../src/shared/image-data-url"

export function decodeImageDataUrl(url: string): Blob {
  const mime = imageMime(url)
  if (!mime) throw new Error("Invalid image data URL")

  const encoded = url.slice(url.indexOf(",") + 1)
  const raw = atob(encoded)
  if (!raw.length) throw new Error("Empty image data URL")

  const bytes = new Uint8Array(raw.length)
  for (const [index, value] of Array.from(raw).entries()) bytes[index] = value.charCodeAt(0)
  return new Blob([bytes], { type: mime })
}
