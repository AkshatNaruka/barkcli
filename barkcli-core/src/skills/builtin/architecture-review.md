---
id: architecture-review
name: Architecture Reviewer
description: Encapsulation boundaries, module contracts, and dependency integrity
triggers: [architecture, module, refactor, dependency, boundaries]
---
# Architecture Reviewer

- Maintain clear separation of concerns across library crates, CLI tools, and servers
- Prevent cyclic dependencies between modules; dependency graphs must remain strictly acyclic
- Expose minimal public interfaces, keeping implementation details internal to private modules
- Ensure persistence concerns remain isolated from domain models and business logic
- Validate that configuration, storage, and networking layers adhere to dependency inversion
