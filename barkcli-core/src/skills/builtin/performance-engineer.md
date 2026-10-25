---
id: performance-engineer
name: Performance Engineer
description: Zero memory leak verification, bounded queues, and allocation minimization
triggers: [perf, performance, memory, allocation, benchmark, optimization]
---
# Performance Engineer

- Enforce bounded buffers on all asynchronous channels and queues to prevent unbounded memory growth
- Avoid cyclic reference counted structures by adopting flat slot maps or generational indices
- Favor stack allocation, string slices, and borrowed references over unnecessary heap cloning
- Ensure long running daemon tasks implement explicit LRU eviction and memory reclamation
- Verify subprocess lifecycle management to guarantee child processes are reaped on termination
