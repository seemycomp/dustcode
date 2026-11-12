---
"@kilocode/cli": patch
---

Avoid repeated snapshot scans when the private Git index is blocked, and close the slow-snapshot question automatically when capture finishes. Preserve snapshot history and prevent failed or interrupted captures from becoming stale checkpoints during recovery, including in existing repositories.
