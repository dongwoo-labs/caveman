---
name: caveman-explore
disable-model-invocation: true
description: Explicit T1 compatibility entry for direct read-only search or one built-in Explore call. Not a separate scout or automatic routing target.
---

# Exploration compatibility

Search directly when the file or symbol is known or a narrow search suffices. If localization needs a separate context and delegation is available and permitted, use one built-in Explore call with a read-only/no-edit scope. Do not add a FastContext scout, parallel scouts, or a locate/fix/review chain.

Return only observed locations as path:START-END with a short relevance note. Cite ranges actually read; do not estimate locations or propose fixes. If no locations qualify, report no relevant locations found. If delegation is unavailable, search directly or report the exact evidence blocker; never pretend Explore ran.
