# 백로그 — 나중에 수정할 항목

> 작성 기준: 저장소 `main` 브랜치. 지금 당장 적용하지 않고, 시간 날 때 순서대로 진행.

---

## 권장 작업 순서

1. **용어 통일 (항목 3)** — UI·문서·엑셀 라벨부터 바꿔도 동작 영향 없음
2. **DB `email` 삭제 (항목 1)** — 독립적, 비교적 안전
3. **DB `game_id` → `player_id` (항목 2)** — 마이그레이션 + 코드 전면 수정
4. **구글 폼 안내 문구 (항목 4)** — 실제 폼 수정 + 문서 반영

항목 2와 3은 한꺼번에 진행하는 편이 좋다. DB 컬럼명과 UI/API 필드명을 동시에 맞추면 이중 작업을 줄일 수 있다.

---

## 1. DB `email` 컬럼 삭제

### 현재 상태

- `players.email`, `archived_players.email` 컬럼만 존재
- 앱 코드에서는 읽거나 쓰지 않음 (미사용)
- 구글 폼의 이메일 수집은 구글 측 기능이며 Supabase로 전송되지 않음

### 할 일

| 대상 | 내용 |
|------|------|
| `supabase/migrations/supabase_migration_v6.sql` (신규) | `ALTER TABLE players DROP COLUMN email`, `archived_players`도 동일 |
| `supabase/schema.sql` | `email` 컬럼 및 `archive_and_reset_cycle()` 내 `email` 참조 제거 |
| `supabase/migrations/supabase_migration_v5.sql` | 신규 설치 히스토리용으로 유지, v6에서 DROP |

### 문서 정리 (선택)

- `docs/RESERVATION_SYSTEM.md` 부록 "email + game_id 혼용" — 구버전 설명, 삭제 또는 정리
- 구글 폼 **이메일 수집 설정** 안내는 유지 (응답 수정 링크용, DB와 무관)

---

## 2. DB: `game_id` → `player_id`

### 현재 상태

- `players.game_id` — PK
- `reservations.player_id`, `preferences.player_id` — 이미 `player_id`이며 `players(game_id)`를 FK로 참조
- `players.name` — DB 컬럼명은 `name` (UI/구글 폼에서는 Game Name으로 부르는 경우 있음)

### 할 일

| 대상 | 내용 |
|------|------|
| 마이그레이션 (v6 또는 v7) | `players.game_id` → `player_id` RENAME |
| | `archived_players.game_id` → `player_id` RENAME |
| | FK `REFERENCES players(game_id)` → `players(player_id)` 갱신 |
| | `archive_and_reset_cycle()` 함수 내 컬럼명 수정 |
| `supabase/schema.sql` | 신규 설치 기준 스키마 반영 |

### 결정 필요: `name` 컬럼 rename 여부

- **옵션 A (권장, 범위 작음):** DB 컬럼 `name` 유지, UI·문서·엑셀 헤더만 **Player Name**으로 통일
- **옵션 B:** DB 컬럼도 `name` → `player_name`으로 rename (쿼리·타입·엑셀 매핑 수정 범위 확대)

### 주의

- 운영 Supabase에 마이그레이션 적용 후 로컬 `schema.sql`과 실제 DB 상태를 맞출 것

---

## 3. Excel·사이트·문서 전체 용어 통일

`Game ID` / `game_id` / `gameId` → **Player ID** / `player_id` / `playerId`  
`Game Name` / `Name` → **Player Name**

### 웹 UI

| 파일 | 변경 예시 |
|------|-----------|
| `app/r/[token]/ReservationForm.tsx` | 라벨 `Game ID` → `Player ID`, `Name` → `Player Name`, FormData 키 `game_id` → `player_id` |
| `app/r/[token]/check/CheckForm.tsx` | 동일 |
| `app/r/[token]/actions.ts` | `formData.get("game_id")`, 에러 메시지, Supabase `.eq("game_id", ...)` |
| `app/admin/AdminDashboard.tsx` | 검색 placeholder, `ID:` 표시, `players.game_id` 참조 |
| `components/ConfirmReservationDialog.tsx` | 확인 문구에 ID/이름 표기 있으면 수정 |

### API·서버

| 파일 | 변경 예시 |
|------|-----------|
| `app/api/google-form-submit/route.ts` | payload `game_id` → `player_id`, 에러 메시지 |
| `app/r/[token]/api/existing/route.ts` | 쿼리 파라미터·응답 필드 |
| `lib/assignment.ts` | `gameId` 인자·변수명, `players` upsert 컬럼명 |
| `lib/reservation-guard.ts` | `gameId` → `playerId` |
| `lib/types.ts` | `Player.game_id` → `player_id` |
| `app/admin/actions.ts`, `app/admin/page.tsx` | select/join 필드명 |

### Excel / CSV

| 파일 | 변경 예시 |
|------|-----------|
| `lib/export-grid.ts` | CSV 헤더 `Game ID` → `Player ID`, `Name` → `Player Name`, `gameId` 프로퍼티명 |
| `lib/build-excel-workbook.ts` | 헤더 문자열 참조 있으면 수정 |
| `app/admin/actions.ts` | export 시트 생성 필드 매핑 |

### 스크립트

| 파일 |
|------|
| `scripts/appscript/onFormSubmit.gs` — payload 키, 로그 메시지, row 인덱스 주석 |
| `scripts/dev/inject-random.ts`, `inject-real-test-data.ts` |
| `scripts/maintenance/purge-orphan-players.ts`, `recover-waitlist.ts` |
| `scripts/verify/verify-assignment.ts`, `audit-reservations.ts`, `validate-assignment.ts` |
| `scripts/dev/pastdata.sql`, `inject_jun26_cycle20.sql` |

### 문서 (md 수정 후 html 재생성)

| 파일 | 비고 |
|------|------|
| `docs/RESERVATION_SYSTEM.md` | `npm run build:docs-html` → `RESERVATION_SYSTEM.html` |
| `docs/RESERVATION_SYSTEM_EN.md`, `RESERVATION_SYSTEM_EN.html` | 영문 |
| `docs/ADMIN_GUIDE_QUICKSTART_EN.md` | `/admin/guide`에 노출 |
| `README.md` | 운영 시나리오·중복 방지 설명 |

### 구글 폼 (저장소 밖, 수동)

| 항목 | 변경 |
|------|------|
| 질문 제목 | `Game ID` → `Player ID`, `Game Name` → `Player Name` |
| Apps Script | 질문 순서가 바뀌면 `row[2]`, `row[3]` 인덱스 재확인 |

### 일괄 검색 키워드

작업 시 전역 검색:

```
game_id
gameId
Game ID
Game Name
```

---

## 4. 구글 폼에 "동일 Player ID 중복 제출" 안내 추가

### 실제 동작 (안내 문구에 반영할 내용)

- 같은 **Player ID + 사이클 + 요일** 조합은 **한 번만** 반영됨 (`lib/reservation-guard.ts`)
- 요일이 다르면(월/화/목) 각각 반영됨
- 구글 폼 "응답 1회 제한"은 **구글 계정 기준**
- "응답 수정 허용" 기간에는 **수정 제출**로 내용 갱신 (새 Player ID로 또 넣는 것과 다름)

코드 변경은 불필요. 사용자-facing 설명만 추가.

### 할 일

| 대상 | 내용 |
|------|------|
| **실제 구글 폼** (수동) | 폼 상단 설명에 안내 문구 추가 (아래 예시) |
| `docs/RESERVATION_SYSTEM.md` §구글 폼 | "폼 항목 구성" 위에 안내 섹션 추가 |
| `docs/RESERVATION_SYSTEM_EN.md` | 영문 동일 |
| `docs/ADMIN_GUIDE_QUICKSTART_EN.md` | Player Quick Reference에 한 줄 추가 |
| `README.md` §구글 폼 연동 | 중복 방지 표 보강 |

### 폼 설명 예시 (한글)

> 동일한 Player ID로 같은 요일을 여러 번 제출해도 **해당 요일은 1회만** 반영됩니다.  
> 월·화·목은 각각 별도로 신청할 수 있습니다.  
> 내용을 바꾸려면 제출 확인 이메일의 **응답 수정 링크**를 사용하세요.

### 폼 설명 예시 (영문)

> Submitting the same Player ID for the same day more than once will only count **once per day**.  
> Monday, Tuesday, and Thursday can each be applied for separately.  
> To change your answers, use the **edit response link** in your confirmation email.

---

## 작업 완료 체크리스트

- [ ] Supabase 마이그레이션 적용 (운영 DB)
- [ ] `schema.sql` 동기화
- [ ] TypeScript 전역 검색: `game_id`, `gameId`, `Game ID`, `Game Name`
- [ ] 구글 폼 질문 제목·설명·Apps Script `row[]` 인덱스 확인
- [ ] `npm run build:docs-html` 후 `/admin/guide`에서 문서 확인
- [ ] Admin Excel export 헤더·데이터 확인
- [ ] 시크릿 링크 예약 / check / 구글 폼 웹훅 각각 스모크 테스트
- [ ] `scripts/verify/*` 스크립트 실행

---

## 범위·리스크 요약

| 항목 | 대략적 규모 | 리스크 |
|------|-------------|--------|
| 1. email 삭제 | SQL 2~3곳 | 낮음 |
| 2. DB rename | 마이그레이션 + 함수 | 중간 (운영 DB) |
| 3. 용어 통일 | 코드 ~20파일 + 문서 5개 + 구글 폼 | 중간 (누락 시 혼란) |
| 4. 구글 폼 안내 | 폼 수동 + 문서 | 낮음 |
