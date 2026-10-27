# Create Test Files

1. Create `file_1.txt`, `file_2.txt`, and `file_3.txt` in the workspace root (`C:\Users\thinh.tran\Desktop\Temp\dustcode`). None currently exists.
2. Write exactly `test 1` into each file, using UTF-8 without a BOM or trailing newline.
3. Verify all three files exist and each contains exactly `test 1`. Leave all unrelated files unchanged.

No source-code changes, dependencies, migration, or rollout are required. If a target file appears before implementation, inspect it before overwriting to avoid replacing unrelated concurrent work.
