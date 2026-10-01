---
name: cavecrew
disable-model-invocation: true
description: Explicit T1 compatibility guide selecting only the requested locate, narrow edit, or review path. No automatic chaining or parallel scouts.
---

# Cavecrew compatibility

Keep this name and the three agent names during T1. They are compatibility entries, not additional canonical procedures. Select only the path the caller requested.

- Locate: search directly; use one built-in Explore call only when a separate context is useful, available, and permitted.
- Fix: the current writer applies the minimal diagnosed edit directly; use patch-bug only for an authorized narrow handoff that needs a separate context.
- Review: use one review-diff call, read-only/no-edit. Do not add another reviewer.

Do not automatically chain locate, fix, and review. Do not spawn parallel scouts. Missing targets block only that delegation; report the dependency rather than claiming it ran.

Explicit calls to cavecrew-investigator, cavecrew-builder, or cavecrew-reviewer remain supported by their real agent definitions. Each performs its assigned work directly, preserves its locator, 1-2-file edit, or findings-only contract, and never delegates again. These prompt constraints are not tool-permission isolation.

No installation, publication, deployment, merge, or cleanup authority comes from this entry. T1 preserves compatibility names; it does not reduce the total name count or authorize T2 deletion.
