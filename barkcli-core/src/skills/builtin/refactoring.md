---
id: refactoring
name: Clean Code Refactoring
description: Incremental structure improvement, duplication elimination, and safe modernization
triggers: [refactor, clean, simplify, restructure, tech-debt, optimize]
---
# Clean Code Refactoring

- Keep behavioral semantics intact during pure refactoring steps
- Separate structural refactoring from behavioral feature additions into distinct steps
- Eliminate code duplication through clean, single-purpose abstractions
- Ensure types, interfaces, and public contracts remain backward-compatible
- Avoid speculative complexity; prefer straightforward code over premature abstraction
- Run automated unit and integration tests after each refactoring transformation
