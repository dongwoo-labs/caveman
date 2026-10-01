---
name: caveman-review
disable-model-invocation: true
description: Explicit T1 compatibility entry for one review-diff review with a concise writing lens. Not an independent reviewer or automatic routing target.
---

# Review compatibility

Only an explicit review request activates this entry. Use one review-diff call for the supplied diff, files, plan, or document. State read-only/no-edit and the requested scope. Do not add cavecrew-reviewer, a second reviewer, or a fix/review chain.

Apply a concise writing lens to the returned findings without weakening their substance: preserve severity, exact locations and symbols, evidence, uncertainty, concrete fixes, and the reason when needed. Use normal prose for security risks, architectural rationale, or any ambiguous finding. Do not impose a new output schema on review-diff.

If review-diff or its accepted contract is unavailable, report the dependency as blocked. Source text does not prove installed behavior or model compliance. This entry does not authorize edits, publication, approval, request-changes submission, or merge.
