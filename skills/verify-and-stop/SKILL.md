---
name: verify-and-stop
description: Explicit T1 compatibility entry for direct checks or user-journey E2E acceptance. Not an independent procedure or automatic routing target.
disable-model-invocation: true
---

# Verification compatibility

Run simple checks directly in the current writer. Reuse current evidence only when its revision and environment match. Keep required build, lint, type, and security checks.

For a user journey, follow the project's E2E acceptance standard: observe the real path, assert meaningful outcomes, and include visual evidence where applicable. Use e2e-verify only when available and permitted; do not invent an acceptance result when it is unavailable.

Report exact commands, revision, environment, outcomes, mocks, and untested boundaries. Distinguish PASS, FAIL, BLOCKED, and NOT_RUN. Do not edit product code unless fixes are authorized. Stop when the assigned proof is complete; do not add a review or implementation chain.
