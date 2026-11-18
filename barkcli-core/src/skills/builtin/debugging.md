---
id: debugging
name: Systematic Debugging
description: Root cause isolation, minimal reproduction, and non-destructive defect resolution
triggers: [debug, bug, fix, panic, error, crash, investigate, failure]
---
# Systematic Debugging

- Reproduce the exact issue first before altering any code
- Isolate the defect's root cause rather than patching surface symptoms
- Check recent changes, commit diffs, and exact error stack traces
- Formulate a testable hypothesis and verify it with the smallest possible test case
- Apply minimal, surgical corrections; preserve surrounding architecture and comments
- Verify that the fix resolves the failing scenario without causing regressions
- Rerun the project's test suite to ensure green gates
