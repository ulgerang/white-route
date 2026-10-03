# 데이터 구조와 플레이 계측 제안

## 주요 데이터 객체

```yaml
Expedition:
  id: EXP_01
  chapter: CH01
  segmentSequence: [CH01_SEG01, CH01_SEG02]
  objectives: [OBJ_RESCUE_SUPPLIES]
  checkpointPolicy: segment

Segment:
  id: CH01_SEG01
  timeLimit: 120 # 프로토타입 placeholder; 밸런스 테스트 필요
  routeChoices: [ROUTE_SAFE, ROUTE_FAST]
  patternSet: PATTERNSET_COAST_01
  weather: WEATHER_CLEAR
  scoreRules: SCORE_ARCADE_V1

HazardPattern:
  id: CH01_SEG01_PAT01
  hazards: [{type: SMALL_GAP, lane: 2, leadTime: 2.0, visualClass: HAZARD_GAP_BLUE}]
  safeLanes: [1, 3]
  minimumLandingSpace: 1
  targetDifficulty: 1

InteractiveObject:
  id: OBJ_FISH_01
  class: COLLECTIBLE # HAZARD / COLLECTIBLE / DECORATION
  silhouetteId: FISH_SIDE_01
  motionCue: POP_FROM_HOLE
  telegraphSeconds: 1.0 # placeholder; tune in playtests
  feedbackId: PICKUP_FISH_SCORE
```

위 값은 스키마 설명용 플레이스홀더이며 실제 밸런스 확정치가 아니다. 시간 단위는 초, 위치 단위는 구간 정규화 좌표로 정의한다.

프레임 분석에서 작은 객체 종류가 격자 표본만으로 모호했던 점을 방지하기 위해, 객체 데이터는 게임플레이 기능(`class`)과 시각 식별자(`silhouetteId`, `motionCue`)를 분리한다. `DECORATION`은 충돌/수집 이벤트를 발생시키지 않는다.

## 플레이 로그 이벤트

| 이벤트 | 속성 | 질문 |
|---|---|---|
| `segment_start` | segment_id, difficulty, assist_flags | 어디서 시도를 시작했나? |
| `hazard_shown` | hazard_id, lead_time, weather | 위험이 충분히 예고됐나? |
| `object_classified` | object_id, class, shown_duration, player_response | 플레이어가 위험/수집/장식을 구분했나? |
| `action_used` | action, speed_band, lane | 각 행동이 실제 선택지인가? |
| `action_phase` | action, phase (anticipation/air/landing/recovery), duration | 점프/회복 상태가 읽히고 판정이 적절한가? |
| `jump_started` / `jump_landed` | run_id, hazard_id?, speed, lane, landing_lane, airborne_duration | 점프 시점과 착지 가능성은 적절했나? |
| `near_miss` | hazard_id, closest_distance, speed, lane | 접촉 없이 통과한 위험의 여유와 판독은 적절했나? |
| `pickup_collected` | object_id, reward_type, score_delta, objective_delta | 획득 피드백과 보상 갱신이 같은 대상에 연결됐나? |
| `collision` | hazard_id, speed, lane, contact_type, recover_time | 근접 통과와 실제 접촉, 회복 비용은 어떤가? |
| `route_selected` | route_id, displayed_tradeoff | 선택 정보가 이해됐나? |
| `segment_end` | result, time_left, objective_state, score | 난이도와 보상은 적정한가? |
| `retry` | failed_segment, retry_delay | 재도전이 얼마나 빠른가? |

계측은 최소 수집, 가명 세션 ID, 개인정보 미수집을 기본으로 한다. 온라인 순위표를 만들기 전 별도 데이터 보존/동의 정책을 검토한다.

## 재현성

시드, 빌드 버전, 코스 패턴 버전, 입력 타임스탬프를 저장하면 실패 사례의 재현과 난이도 비교가 쉬워진다. 기록 모드 결과에는 시드와 규칙 버전을 포함한다.
