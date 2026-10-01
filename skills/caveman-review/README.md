# caveman-review

T1에서 기존 `/caveman-review` 이름을 유지하는 명시 호출 전용 compatibility entry입니다. 독립 리뷰 절차 대신 `review-diff` 리뷰 한 번에 간결한 문체 기준을 적용합니다.

## 사용 방법

```text
/caveman-review
```

리뷰할 diff, 파일, 계획 또는 문서를 전달합니다. 일반적인 리뷰 대화만으로 자동 활성화하지 않습니다. `review-diff`가 없거나 사용할 계약이 준비되지 않았다면 해당 위임을 BLOCKED로 보고합니다. 이 저장소의 source만으로 외부 skill 설치나 모델 준수를 보장하지 않습니다.

## 유지하는 기준

- 심각도, 정확한 위치와 심볼, 증거, 불확실성, 수정안을 보존합니다.
- 보안 위험과 설계 근거는 의미가 분명한 문장으로 설명합니다.
- 추가 reviewer나 수정·재리뷰 연쇄를 자동 실행하지 않습니다.
- 코드 수정, 리뷰 승인 제출, publication, merge 권한을 부여하지 않습니다.

T1은 이름을 보존합니다. 실제 삭제와 전체 이름 수 감소는 별도 T2 범위입니다.

## 참고

- [`SKILL.md`](./SKILL.md)
- [Caveman README](../../README.md)
