# cavecrew

T1 명시 호출 전용 compatibility guide입니다. 요청한 locate, 좁은 수정, review 중 한 경로만 선택합니다. 자동 연쇄나 병렬 scout는 실행하지 않습니다.

## What it does

locate는 직접 검색 또는 built-in Explore 한 번, 수정은 현재 writer의 직접 수정 또는 필요한 경우 patch-bug, review는 review-diff 한 번으로 연결합니다. 필요한 target이 없으면 해당 위임만 BLOCKED로 보고합니다.

아래 세 agent 이름과 실제 정의는 명시 호출 호환성을 위해 보존합니다. 각 agent는 고유 계약으로 직접 수행하며 중첩 위임하지 않습니다. 이 문서의 제약은 tool 권한 격리를 뜻하지 않습니다. 이름 수 감소나 보편적인 token 절감률을 주장하지 않습니다.

Three subagents:

| Subagent | Job | Use when |
|----------|-----|----------|
| `cavecrew-investigator` | Locate code (read-only) | "Where is X defined / what calls Y / list uses of Z" |
| `cavecrew-builder` | Surgical edit, 1-2 files | Scope is obvious, ≤2 files. Refuses 3+ file scope. |
| `cavecrew-reviewer` | Diff/file review | One-line findings with severity emoji |

## 사용 방법

`/cavecrew`를 명시 호출하거나, 필요한 compatibility agent 이름을 직접 요청합니다. 일반적인 delegation 대화만으로 자동 활성화하지 않습니다.

예를 들어 locate만 요청했다면 위치와 증거를 반환하고 멈춥니다. 이어서 builder와 reviewer를 자동 호출하지 않습니다. 3개 이상 파일을 수정해야 한다면 cavecrew-builder는 기존대로 범위를 거절하고 caller에 반환합니다.

T1은 호환 이름을 유지합니다. 실제 제거는 별도 T2 범위입니다.

## Model overrides

By default, `cavecrew-reviewer` and `cavecrew-investigator` pin `model: haiku` in their frontmatter; `cavecrew-builder` has no `model:` line (uses the API session default). Set env vars in your shell before launching Claude Code to override per-agent:

| Env var | Agent |
|---|---|
| `CAVECREW_REVIEWER_MODEL` | `cavecrew-reviewer` |
| `CAVECREW_BUILDER_MODEL` | `cavecrew-builder` |
| `CAVECREW_INVESTIGATOR_MODEL` | `cavecrew-investigator` |

Example: run reviewer on sonnet and keep others on default.

```sh
export CAVECREW_REVIEWER_MODEL=sonnet
```

Use the same model name strings you'd use in any Claude Code agent frontmatter (e.g. `haiku`, `sonnet`, `opus`).

Overrides patch only `model:` line in installed agent frontmatter; prompt body
stays untouched and continues receiving upstream updates. Only plugin installs
have local agent files to patch. Empty variables do nothing. Patch persists until
plugin update or reinstall.

## See also

- [`SKILL.md`](./SKILL.md): full decision matrix and output contracts
- [`agents/cavecrew-investigator.md`](../../agents/cavecrew-investigator.md)
- [`agents/cavecrew-builder.md`](../../agents/cavecrew-builder.md)
- [`agents/cavecrew-reviewer.md`](../../agents/cavecrew-reviewer.md)
- [Caveman README](../../README.md): repo overview
