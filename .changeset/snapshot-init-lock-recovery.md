---
"@kilocode/cli": patch
---

Avoid repeated snapshot scans when the private Git index is blocked, and close the slow-snapshot question automatically when capture finishes. Preserve snapshot history and report failed captures instead of recording stale checkpoints.
