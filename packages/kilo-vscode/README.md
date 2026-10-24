# Dustcode For VS Code

Dustcode is an open-source AI coding agent for VS Code, with chat, code editing, tool execution, and Agent Manager for parallel sessions and Git worktrees. This fork ships only the extension and its bundled backend.

## Install

Install `dustcode-<target>.vsix` for your operating system and architecture using **Extensions: Install from VSIX...** in VS Code. Build it locally with `bun run build:vscode` from the repository root, or download the matching artifact from a successful **VS Code** GitHub Actions run in this repository. See [the root README](../../README.md) and [RELEASING.md](../../RELEASING.md) for canonical build and artifact details.

There is no configured Dustcode Marketplace listing or automatic publishing pipeline. The extension ID is `dustcode.dustcode`; it does not replace the upstream Kilo Code extension.

## Configuration

Dustcode uses `dustcode.*` settings and commands and `.dustcode/` project state. It does not import upstream Kilo credentials, sessions, legacy settings, or worktrees. Configure a provider separately; model availability and charges depend on that provider. Kilo Gateway is an external service, not a Dustcode-operated service. Automatic autocomplete is off by default, and global shortcut defaults are not installed.

## Development

Use the Bun version pinned in root `package.json`. From the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck:vscode
bun run test:vscode
bun run build:vscode
```

The VSIX is written to `packages/kilo-vscode/out/`. Linux builds require Zig 0.14.0. Use `bun run extension:isolated` to develop in a separate VS Code profile. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for general contribution guidance and [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) for contributor expectations.

## Upstream Attribution

Dustcode derives from [Kilo Code](https://github.com/Kilo-Org/kilocode), whose bundled backend derives from [OpenCode](https://github.com/anomalyco/opencode). Existing source paths and internal package names are retained where needed. This fork does not claim to operate upstream services or distribute the other upstream products.

Thanks to the upstream contributors, including mcowger, bhaktatejas922, NyxJae, Aikiboy123, cobra91, ivanarifin, PeterDaveHello, possible055, seuros, and [the other Kilo Code contributors](https://github.com/Kilo-Org/kilocode/graphs/contributors).

## License

This package is licensed under MIT. See [LICENSE](LICENSE) for the unchanged Kilo Code and opencode copyright notices. Retain attribution, license notices, and third-party notices when redistributing the extension or its bundled components.
