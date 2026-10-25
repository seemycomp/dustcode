---
"dustcode": patch
---

Speed up repeated VS Code extension packaging by reusing validated local build artifacts and excluding development-only files from VSIX packages.

Omit the deprecated browser Console from VS Code packages while retaining the extension's chat, settings, and Agent Manager.
