import { Profile } from "./profile"

export namespace Branding {
  export function name(legacy = "Kilo") {
    return Profile.enabled ? "Dustcode" : legacy
  }

  // Only used for built-in prompts, never custom prompts or user content.
  export function prompt(text: string) {
    if (!Profile.enabled) return text
    return text
      .replace(
        /^.*(?:When the user directly asks about Kilo|When users ask directly about Kilo).*$/gm,
        "When users ask about Dustcode or its features, consult the current repository and https://github.com/seemycomp/dustcode. Upstream documentation may differ from this VS Code-only fork.",
      )
      .replaceAll("https://github.com/Kilo-Org/kilocode", "https://github.com/seemycomp/dustcode")
      .replace(/^You are opencode,/gm, "You are Dustcode,")
      .replace(/\bKilo Code\b|\bKilo\b(?! Gateway| Cloud| Pass)/g, "Dustcode")
  }
}
