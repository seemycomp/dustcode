# Changesets

This directory tracks user-facing changes for future Dustcode releases. Dustcode is a VS Code-only fork; changesets do not publish packages or trigger a release.

## Adding a changeset

When making a user-facing change, prefer one concise changeset per PR, grouping related changes when possible. Run:

```sh
bunx changeset add
```

Or manually create a file `.changeset/<slug>.md`:

```md
---
"dustcode": minor
---

Support exporting conversations as markdown.
```

Use `patch` for bug fixes, `minor` for new features, `major` for breaking changes.

The extension package is `dustcode`. It remains in a fixed version group with its bundled backend, `@kilocode/cli`; that internal package name is retained from upstream and does not imply a separately published Dustcode CLI.

The changelog generator links changes to this fork, `seemycomp/dustcode`, rather than the upstream repository. There is no active automatic versioning or publishing workflow. Maintain release versions and notes manually, and follow [RELEASING.md](../RELEASING.md) to build or download VSIX artifacts. The upstream `publish.yml` workflow is archived with a `.disabled` suffix and does not consume these files automatically.
