import { describe, expect, test } from "bun:test"
import { LOCALES } from "../../webview-ui/src/context/language-utils"

describe("Dustcode product branding", () => {
  for (const locale of LOCALES) {
    test(`uses Dustcode product labels and real provider names in ${locale}`, async () => {
      const { dict } = await import(`../../webview-ui/src/i18n/${locale}.ts`)
      expect(dict["settings.aboutKiloCode.title"]).toContain("Dustcode")
      expect(dict["sidebar.topBar.label"]).toContain("Dustcode")
      expect(dict["settings.agentBehaviour.sharedAgentBoard.title"]).toBe("Dustcode Swarm")
      expect(dict["settings.config.source.projectKilo"]).toContain(".dustcode")
      expect(dict["deviceAuth.title"]).toContain("Kilo Gateway")
      expect(dict["profile.action.login"]).toContain("Kilo Gateway")
      expect(Object.values(dict).every((value) => typeof value !== "string" || !value.includes("Kilo Code"))).toBe(true)
    })
  }
})
