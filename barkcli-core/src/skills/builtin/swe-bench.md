---
id: swe-bench
name: Deep Reasoning & SWE-bench Verification
description: Deliberate problem exploration, edge-case hardening, and rigorous self-verification
triggers: [swe-bench, deep-reason, solve, complex, benchmark, verify, reasoning]
---
# Deep Reasoning & SWE-bench Verification

- Read the problem specification and acceptance criteria thoroughly before touching code
- Map the affected code paths, data flow, and potential edge cases before writing changes
- Verify assumptions against real tool and compiler outputs rather than plausible guesses
- Add test coverage for boundary conditions, empty collections, null inputs, and concurrency
- Verify that fixes are completely self-contained within the intended repository scope
- Execute full test suites and ensure zero warnings before committing work
