import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

const root = new URL("../../", import.meta.url)
const asset = "assets/icons/dustcode.png"

describe("Dustcode icon", () => {
  test("packages the supplied PNG and uses it in extension contributions", async () => {
    const manifest = await Bun.file(new URL("package.json", root)).json()
    const image = Buffer.from(await Bun.file(new URL(asset, root)).arrayBuffer())
    const source = Buffer.from(await Bun.file(new URL("../kilo-docs/public/img/code.png", root)).arrayBuffer())

    expect(image.equals(source)).toBe(true)
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(image.readUInt32BE(16)).toBe(512)
    expect(image.readUInt32BE(20)).toBe(512)
    expect(manifest.icon).toBe(asset)
    expect(manifest.contributes.viewsContainers.activitybar[0].icon).toBe(asset)
    for (const id of ["dustcode.openInTab", "dustcode.generateCommitMessage"]) {
      expect(manifest.contributes.commands.find((command: { command: string }) => command.command === id)?.icon).toBe(
        asset,
      )
    }
    expect(manifest.contributes.icons["dustcode-logo"].default).toBe("code")
  })

  test("uses the new icon for branded editor panels", async () => {
    for await (const path of new Bun.Glob("src/**/*.ts").scan(fileURLToPath(root))) {
      const text = await Bun.file(new URL(path, root)).text()
      if (!text.includes("panel.iconPath =")) continue
      expect(text).not.toMatch(/kilo-(light|dark)\.svg/)
      expect(text).toContain('"dustcode.png"')
    }
  })

  test("keeps the new webview logo visible without the old hover animation", async () => {
    for (const path of [
      "webview-ui/src/components/chat/WelcomeEmptyState.tsx",
      "webview-ui/src/components/chat/FeedbackDialog.tsx",
      "webview-ui/src/components/migration/MigrationWizard.tsx",
    ]) {
      const text = await Bun.file(new URL(path, root)).text()
      expect(text).toContain("dustcode.png")
      expect(text).not.toMatch(/kilo-(light|dark)\.svg|AnimatedKiloLogo/)
    }
  })
})
