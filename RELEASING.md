# Building And Distributing Dustcode

This fork distributes a **VS Code extension VSIX** with an embedded backend. No automatic versioning or publishing is configured. The upstream release workflows are archived in `.github/workflows/disabled/` with a `.disabled` suffix; they do not run and are not the release procedure for Dustcode.

## Manual Build

Use the Bun version pinned in root `package.json`. On Linux, install Zig 0.14.0 for the bundled sandbox helper. Run from the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck:vscode
bun run test:vscode
bun run build:vscode
```

The build uses the extension version from `packages/kilo-vscode/package.json` by default, compiles the native backend for the current platform, then packages the extension and bundled resources. It does not increment versions, create commits or tags, or publish anything. Maintain versions and release notes manually; [.changeset/README.md](.changeset/README.md) describes how to record user-facing changes.

Output is in `packages/kilo-vscode/out/`, including `dustcode-<target>.vsix` and SBOM evidence. For example, a Windows x64 build produces `dustcode-win32-x64.vsix`. Build on the matching platform rather than treating a single-platform build as a cross-platform release. Keep the accompanying license, third-party notices, and SBOM evidence when distributing artifacts.

## CI Artifacts

The active [VS Code workflow](.github/workflows/test-vscode.yml) runs on pushes to `main` and `dev`, pull requests, or a manual **Run workflow** action. After the checks pass, its packaging matrix builds:

| Target | Artifact | VSIX |
|---|---|---|
| Linux x64 | `dustcode-linux-x64` | `dustcode-linux-x64.vsix` |
| macOS Intel | `dustcode-darwin-x64` | `dustcode-darwin-x64.vsix` |
| macOS Apple Silicon | `dustcode-darwin-arm64` | `dustcode-darwin-arm64.vsix` |
| Windows x64 | `dustcode-win32-x64` | `dustcode-win32-x64.vsix` |

Open a successful **VS Code** run in this repository's GitHub Actions tab and download the matching artifact. Extract the archive to access the VSIX and SBOM evidence. Artifacts are retained for 14 days. The final inventory job scans packaged VSIX contents and uploads a separate `vscode-physical-inventories` artifact.

CI uses read-only repository contents permission and needs no publishing credentials. It does not publish a GitHub Release, Marketplace listing, npm package, container, standalone CLI, or JetBrains plugin. There is no Dustcode publishing account or registry endpoint documented or configured by this procedure.

## Verify And Install

1. Confirm the artifact target matches the recipient's operating system and architecture.
2. In VS Code, run **Extensions: Install from VSIX...** and select the extracted `dustcode-<target>.vsix`.
3. Confirm the installed extension is **Dustcode** with ID `dustcode.dustcode`.
4. Open Dustcode, configure a provider separately, and verify chat and Agent Manager using a test workspace.

Dustcode does not migrate upstream Kilo Code credentials or sessions. Upstream package names and the bundled `kilo` backend executable remain internal implementation details, not separate products released by this fork. See [README.md](README.md) for configuration isolation and upstream attribution.
