# 《하얀 대륙: 펭귄 익스프레스》 기획 문서

> 프로젝트 코드명: **WHITE ROUTE** · 문서 기준: 2026-10-03 · 상태: 콘셉트 기획 v0.1

## 한 문장 피치

빙판 위를 질주하는 펭귄 탐험대가 제한된 시간과 체온으로 남극 기지를 잇고, 매번 달라지는 날씨와 갈림길을 읽어 구조 임무를 완수하는 3D 아케이드 탐험 레이서.

## 문서 안내

| 경로 | 목적 |
|---|---|
| [00_product/vision.md](00_product/vision.md) | 비전, 타깃, 차별점, 성공 기준 |
| [01_research/source-analysis.md](01_research/source-analysis.md) | 제공 영상과 원작 근거의 관찰 및 해석 |
| [01_research/design-pillars.md](01_research/design-pillars.md) | 역기획에서 도출한 원칙과 개선 방향 |
| [02_game-design/gdd.md](02_game-design/gdd.md) | 전체 게임 디자인 개요 |
| [02_game-design/core-loop.md](02_game-design/core-loop.md) | 순간·스테이지·캠페인 루프 |
| [02_game-design/player-controls.md](02_game-design/player-controls.md) | 입력, 이동, 조작 피드백 |
| [02_game-design/gameplay-systems.md](02_game-design/gameplay-systems.md) | 위험물, 날씨, 체온, 수집품, 점수 |
| [03_content/world-and-levels.md](03_content/world-and-levels.md) | 세계관, 경로, 스테이지 구성 |
| [03_content/content-plan.md](03_content/content-plan.md) | 출시 콘텐츠와 확장 기준 |
| [04_ux/ux-flow.md](04_ux/ux-flow.md) | 화면 흐름과 정보 우선순위 |
| [05_art-audio/visual-audio-direction.md](05_art-audio/visual-audio-direction.md) | 아트·애니메이션·사운드 가이드 |
| [05_art-audio/asset-list.md](05_art-audio/asset-list.md) | 단계별 에셋 목록, 우선순위, 제작·검수 기준 |
| [06_technical/data-and-telemetry.md](06_technical/data-and-telemetry.md) | 데이터 경계와 플레이 계측 |
| [07_production/roadmap-and-risks.md](07_production/roadmap-and-risks.md) | 단계별 제작 범위, 의존성, 위험 |
| [08_qa/acceptance-criteria.md](08_qa/acceptance-criteria.md) | 프로토타입과 기능 승인 기준 |
| [09_appendix/glossary-and-decisions.md](09_appendix/glossary-and-decisions.md) | 용어와 미결정 사항 |

## 핵심 방향

- 원작의 핵심 감정인 **빠른 전진, 즉시 판독되는 장애물, 시간 압박, 경쾌한 펭귄 캐릭터**를 계승한다.
- 좌우 회피에 더해 **속도 조절·점프·짧은 대시**를 서로 다른 상황에 쓰도록 설계한다.
- 단순 점수 주행을 **구조 임무, 경로 선택, 날씨 대응**으로 확장하되, 한 구간은 2~4분 안에 완결한다.
- 생존 요소는 의사결정을 만들 정도로만 사용한다. 체온·장비는 루트 선택과 회복 기회를 구성하며, 잦은 관리 메뉴나 파밍은 지양한다.
- 아래 제안은 독립 게임을 위한 콘셉트 설계다. 원작의 명칭·캐릭터·음악·아트 자산을 복제하지 않는다.

## 상태와 사용법

이 문서는 검증 전 기획 가설을 포함한다. 영상에서 직접 확인한 사실, 원작 매뉴얼에서 가져온 사실, 새 게임을 위한 제안을 각 조사 문서에서 구분했다. 플레이테스트 결과에 따라 수치와 범위를 갱신한다.

## 영상 분석 에셋

00:30–00:50 구간의 0.3초 샘플과 0.1초 정밀 샘플을 모두 3×3 이미지 시트로 정리했다. 샘플링 방법, 이벤트 타임라인, 각 시트 링크는 [영상·원작 분석](01_research/source-analysis.md)에서 확인한다. 0.1초 표본은 짧은 동작 전환을 확인하기 위한 자료이며 원본 60fps 전체 프레임 분석을 뜻하지 않는다.
