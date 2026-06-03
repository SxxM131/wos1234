# SVS Reservation - 예약 배정 알고리즘 (Batch Assignment Algorithm)

이 문서는 SVS 예약 시스템의 배정 알고리즘에 대한 구현 기획 및 동작 방식을 설명합니다.

## 1. 개요
현재 시스템은 신청 즉시 슬롯을 배정하지 않고, 사용자의 **선호 블록(Preferences)**만 수집한 뒤 관리자가 **일괄 배정(Run full assignment)** 버튼을 눌렀을 때 전체 배정을 계산하는 **Batch Assignment** 방식을 취하고 있습니다.

## 2. 배정 알고리즘 상세 (Min-Cost Max-Flow)

`lib/assignment.ts`의 `runBatchAssignment` 및 연관 함수들에서 구현되어 있으며, **MCMF(Min-Cost Max-Flow)** 알고리즘을 사용해 최대 배정 인원(Max Flow)과 스피드업 우선순위 배정(Min Cost)을 단일 Phase로 계산합니다. 요일은 **월요일(VP) -> 화요일(VP) -> 목요일(MO)** 순서로 처리됩니다.

### 네트워크 그래프 설계
- **노드 구성:**
  - Source(0), Sink(1)
  - 플레이어 노드들, 슬롯 노드들
- **간선 및 용량(Capacity):**
  - Source $\to$ 플레이어: 용량 1 (한 명당 최대 1개 슬롯만 배정)
  - 플레이어 $\to$ 희망하는 블록의 슬롯: 용량 1
  - 슬롯 $\to$ Sink: 용량 1 (슬롯당 최대 1명만 배정)
- **비용(Cost) 정책:**
  - 스피드업 전체 통합 순위 $R$ (1위=1, 2위=2...)를 매깁니다.
  - **Top-N 자격 통과 간선:** $\text{Cost} = R$
  - **Top-N 자격 미달 간선:** $\text{Cost} = R + 1,000,000$ (용량 한계 도달 시 후순위 백필)
  
> [!NOTE]
> 블록별 Top-N 자격 기준(`computeEligibleByBlock`)은 유지하며, 중복 제약(`countedPlayers`)을 고려해 계산됩니다. 탈락 페널티 비용을 크게 줌으로써, 알고리즘은 전체 배정 인원을 최대화하되(Max Flow), 가능한 한 Top-N 적격자를 먼저 배정하고(Phase 1 역할), 빈자리가 남는 경우에만 후순위 지망자를 스피드업 순으로 채우게 됩니다(Phase 2 역할).

### 배정 마무리 및 대기열 생성
- MCMF 알고리즘을 통해 매칭된 결과(`assigned`)를 데이터베이스의 `reservations` 테이블에 저장합니다.
- 어떠한 슬롯에도 배정되지 못한 신청자들은 `slot_id`가 없는 상태로 `eliminated` 처리되어 **대기열(Waitlist)**에 등록됩니다.

## 3. 사후 동작 (취소 및 승격)

### 슬롯 취소 시 자동 승격 (`promoteOnCancel`)
- 관리자가 특정 예약 슬롯을 취소(`cancelReservation`)하면 해당 요일의 미배정 대기열(`eliminated`)을 확인합니다.
- 취소된 블록을 선호 시간대에 포함한 대기자들 중, 위 배정 자격(Top-N 및 스피드업 기준)에 부합하는 가장 높은 순위의 1명을 선택하여 빈 슬롯으로 자동 승격(`assigned`)시킵니다.
- 연쇄적으로 발생하는 빈 대기열이나 중복 상태는 `healEliminatedReservations`와 `backfillEmptySlotsForDay` 함수를 통해 정리합니다.

## 4. 데이터 플로우
1. **신청(Player)**: `/r/[token]` 접속 -> `players` 업데이트 -> `preferences`에 요일 및 선호 블록 저장. (이 시점에선 `reservations` 생성 안 됨)
2. **배정(Admin)**: `/admin` 접속 -> 'Run full assignment' 실행 -> 기존 `assigned` 슬롯 비우기 -> MCMF 알고리즘 실행 -> `reservations` 테이블에 `assigned` 및 `eliminated` 결과 저장.
3. **결과 확인(Public/Player)**: `/status` 또는 `/r/[token]/check` 에서 본인의 배정 슬롯이나 Waitlist 여부를 확인.
