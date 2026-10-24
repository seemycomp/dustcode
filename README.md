# Dustcode

Dustcode is an open-source AI coding agent for **VS Code**. This fork maintains the extension and the backend it bundles, not a standalone CLI, JetBrains plugin, desktop app, or cloud product.

[简体中文](translations/README.zh.md) | [繁體中文](translations/README.zht.md) | [한국어](translations/README.ko.md) | [Deutsch](translations/README.de.md) | [Español](translations/README.es.md) | [Français](translations/README.fr.md) | [Italiano](translations/README.it.md) | [Dansk](translations/README.da.md) | [日本語](translations/README.ja.md) | [Polski](translations/README.pl.md) | [Русский](translations/README.ru.md) | [Bosanski](translations/README.bs.md) | [العربية](translations/README.ar.md) | [Norsk](translations/README.no.md) | [Português (Brasil)](translations/README.br.md) | [ไทย](translations/README.th.md) | [Türkçe](translations/README.tr.md) | [Українська](translations/README.uk.md) | [বাংলা](translations/README.bn.md) | [Ελληνικά](translations/README.gr.md) | [Tiếng Việt](translations/README.vi.md)

## What It Does

- Chat about your code, plan changes, edit files, and run tools in VS Code.
- Manage parallel sessions and isolated Git worktrees with Agent Manager.
- Configure model providers and MCP servers for your workflow.
- Enable inline autocomplete when needed; automatic autocomplete is off by default.

Provider access, credentials, model availability, and charges depend on the provider you configure. Kilo Gateway remains an external service, not a Dustcode-operated gateway.

## Install

There is no configured Dustcode Marketplace listing or automatic publishing pipeline. Install a platform-specific VSIX built locally or downloaded from a successful **VS Code** GitHub Actions run in this repository.

1. Obtain `dustcode-<target>.vsix` for your operating system and architecture. See [RELEASING.md](RELEASING.md) for builds and CI artifacts.
2. In VS Code, run **Extensions: Install from VSIX...** from the Command Palette and select the file.
3. Open Dustcode and sign in to a supported provider or configure provider credentials separately.

The extension ID is `dustcode.dustcode`. It can coexist with upstream Kilo Code; it is not an update to the upstream extension. Dustcode uses `dustcode.*` settings and commands, `.dustcode/` project state, and `~/.local/share/dustcode/` user state (or `$XDG_DATA_HOME/dustcode/`). It does not import Kilo credentials, sessions, legacy settings, or worktrees. Global shortcut defaults are not installed. Repository `AGENTS.md` instructions still apply.

## Develop And Build

Use the Bun version pinned in root `package.json`. Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck:vscode
bun run test:vscode
bun run build:vscode
```

`build:vscode` compiles the native backend and packages the extension for the current platform into `packages/kilo-vscode/out/dustcode-<target>.vsix`. Linux builds require Zig 0.14.0 for the bundled sandbox helper. Use `bun run extension:isolated` for development in a separate VS Code profile.

CI checks the extension and backend, then produces `linux-x64`, `darwin-x64`, `darwin-arm64`, and `win32-x64` VSIX artifacts. It does not publish to Marketplace, npm, or GitHub Releases. Previous workflows remain in `.github/workflows/disabled/` with a `.disabled` suffix.

See [CONTRIBUTING.md](CONTRIBUTING.md) for general development guidance and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for contributor expectations. Those upstream-derived documents may describe products or processes outside this fork's scope; this README and [RELEASING.md](RELEASING.md) are canonical for Dustcode installation and distribution.

Report Dustcode bugs and feature requests in [this fork's issue tracker](https://github.com/seemycomp/dustcode/issues). Do not include credentials or private information in reports.

## Upstream Attribution

Dustcode is a fork of [Kilo Code](https://github.com/Kilo-Org/kilocode). Its bundled backend derives from Kilo CLI, itself a fork of [OpenCode](https://github.com/anomalyco/opencode). Upstream names in source paths, internal packages such as `@kilocode/cli`, and third-party integrations identify their origins; they do not imply Dustcode ownership of upstream products or services.

## License

MIT. You may use, modify, and distribute this code, including commercially, while retaining attribution and license notices. See [LICENSE](LICENSE), which preserves the Kilo Code and opencode copyright notices. Third-party components retain their own licenses and notices.
