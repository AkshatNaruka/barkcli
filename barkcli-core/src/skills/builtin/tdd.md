---
id: tdd
name: Test Driven Development
description: Red Green Refactor lifecycle with automated acceptance verification
triggers: [tdd, test-driven, feature, fix, bug, refactor]
---
# Test Driven Development

- Follow the Red Green Refactor cycle strictly for every code modification
- Step 1 Red: Write the failing unit or integration test before modifying implementation
- Step 2 Green: Implement the minimal code required to make the failing test pass
- Step 3 Refactor: Clean up implementation, verify zero warnings, ensure no regressions
- Every acceptance criterion must map to at least one automated test
- Run project test suites inside the worktree before reporting completion
