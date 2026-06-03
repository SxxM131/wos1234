# SVS Reservation - 예약 배정 알고리즘 (Batch Assignment Algorithm)

이 문서는 SVS 예약 시스템의 현재 배정 알고리즘에 대한 구현 기획 및 동작 방식을 설명합니다.

## 1. 개요
현재 시스템은 신청 즉시 슬롯을 배정하지 않고, 사용자의 **선호 블록(Preferences)**만 수집한 뒤 관리자가 **일괄 배정(Run full assignment)** 버튼을 눌렀을 때 전체 배정을 계산하는 **Batch Assignment** 방식을 취하고 있습니다.

## 2. 배정 알고리즘 상세 (이분 매칭)

`lib/assignment.ts`의 `runBatchAssignment` 및 연관 함수들에서 구현되어 있으며, 크게 **Two-Pass Matching** 전략을 사용합니다. 요일은 **월요일(VP) -> 화요일(VP) -> 목요일(MO)** 순서로 처리됩니다.

### Phase 1: Top-N 제한 전역 최대 매칭 (Hopcroft-Karp)
- **자격 산정 (`computeEligibleByBlock`)**: 각 2시간 블록마다, 해당 블록을 선호에 넣은 신청자들을 **스피드업(내림차순) -> 신청 시각(오름차순)** 순으로 정렬합니다. 그 후 해당 블록의 활성 슬롯 개수(최대 4개)만큼만 상위 인원(Top-N)을 잘라 매칭 자격을 부여합니다.
- **간선 생성 (`buildMatchingEdges`)**: 자격을 얻은 플레이어와 해당 블록의 슬롯 간에 이분 그래프의 간선을 생성합니다.
- **최대 매칭 (`hopcroftKarp`)**: Hopcroft-Karp 알고리즘을 수행하여 전역적으로 가장 많은 인원이 배정될 수 있는 최적의 매칭을 찾습니다.

### Phase 2: 미배정자 빈자리 채우기 (`runSecondPassMatching`)
- Phase 1에서 매칭되지 못하고 남은 **빈 슬롯**과 **미배정 신청자**들을 대상으로 2차 배정을 시도합니다.
- 미배정 신청자를 전체 **스피드업 내림차순 -> 신청 시각 오름차순**으로 정렬하여 순회합니다.
- 각 신청자의 선호 블록 중 비어있는 슬롯이 있다면 DFS 방식으로 할당하며, 필요 시 다른 플레이어가 차지한 슬롯을 양보(Augmenting Path)시켜 빈자리에 끼워넣습니다.
- 이 단계는 Top-N 제약 없이 스피드업이 높은 사람이 남는 자리를 확실하게 가져갈 수 있도록 보장합니다.

### 배정 마무리 및 대기열 생성
- 위 두 단계(Phase 1, 2)를 거쳐 매칭된 결과(`assigned`)를 데이터베이스의 `reservations` 테이블에 저장합니다.
- 어떠한 슬롯에도 배정되지 못한 신청자들은 `slot_id`가 없는 상태로 `eliminated` 처리되어 **대기열(Waitlist)**에 등록됩니다.

## 3. 사후 동작 (취소 및 승격)

### 슬롯 취소 시 자동 승격 (`promoteOnCancel`)
- 관리자가 특정 예약 슬롯을 취소(`cancelReservation`)하면 해당 요일의 미배정 대기열(`eliminated`)을 확인합니다.
- 취소된 블록을 선호 시간대에 포함한 대기자들 중, 위 배정 자격(Top-N 및 스피드업 기준)에 부합하는 가장 높은 순위의 1명을 선택하여 빈 슬롯으로 자동 승격(`assigned`)시킵니다.
- 연쇄적으로 발생하는 빈 대기열이나 중복 상태는 `healEliminatedReservations`와 `backfillEmptySlotsForDay` 함수를 통해 정리합니다.

## 4. 데이터 플로우
1. **신청(Player)**: `/r/[token]` 접속 -> `players` 업데이트 -> `preferences`에 요일 및 선호 블록 저장. (이 시점에선 `reservations` 생성 안 됨)
2. **배정(Admin)**: `/admin` 접속 -> 'Run full assignment' 실행 -> 기존 `assigned` 슬롯 비우기 -> 이분 매칭 알고리즘 실행 -> `reservations` 테이블에 `assigned` 및 `eliminated` 결과 저장.
3. **결과 확인(Public/Player)**: `/status` 또는 `/r/[token]/check` 에서 본인의 배정 슬롯이나 Waitlist 여부를 확인.
