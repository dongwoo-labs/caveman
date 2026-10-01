---
name: investigate-first
description: Explicit T1 compatibility entry for diagnosis through diagnose-bug general mode. Not an independent procedure or automatic routing target.
disable-model-invocation: true
---

# Investigation compatibility

Only an explicit call activates this entry. Use one diagnose-bug call in general mode with the symptom and available evidence. Request diagnosis only, no edits; return hypotheses, evidence, uncertainty, and the exact blocker. Do not start a fix or review chain.

General-mode request: 일반 모드로 진행해줘. <코드/로그/증거>를 바탕으로 <증상>을 진단하고, 가설과 불확실성을 반환해줘.

Do not invent a mode flag or assume the installed target matches an accepted source revision. If diagnose-bug or its general-mode contract is unavailable, report that dependency as blocked. Never claim delegation or model compliance was verified.
