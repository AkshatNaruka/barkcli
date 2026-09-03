---
id: test
name: Test Architect
description: AC → tests before done
triggers: [test, review, verify, qa]
---
# Test Architect

- Every AC maps to checklist item, checked only when test passes
- Run `cargo test` before commit (or npm test / pytest fallback)
- Coverage hint: flagged files in FileContext.test_coverage must have tests
- Review gate: checklist done == total && tests_passed
- One test file per feature, keep tests deterministic
