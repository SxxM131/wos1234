# 백로그 — 나중에 수정할 항목

> 작성 기준: 저장소 `main` 브랜치. 지금 당장 적용하지 않고, 시간 날 때 순서대로 진행.

---

## 권장 작업 순서

1. **용어 통일 (항목 3)** — UI·문서·엑셀 라벨부터 바꿔도 동작 영향 없음
2. **DB `email` 삭제 (항목 1)** — 독립적, 비교적 안전
3. **DB `game_id` → `player_id` (항목 2)** — 마이그레이션 + 코드 전면 수정
4. **구글 폼 안내 문구 (항목 4)** — 실제 폼 수정 + 문서 반영
5. **구글 폼 이메일 수집 정책 (항목 5)** — 항목 4·문서와 함께 결정 (항목 1 DB `email` 삭제와 별개)

항목 2와 3은 한꺼번에 진행하는 편이 좋다. DB 컬럼명과 UI/API 필드명을 동시에 맞추면 이중 작업을 줄일 수 있다.

항목 4와 5는 같이 정한다. 이메일 수집을 끄면 폼 설명·가이드에서 "응답 수정 링크" 안내를 빼고, 대안 경로를 명시해야 한다.

---

## 1. DB `email` 컬럼 삭제 ✅

> **완료** — `supabase_migration_v6.sql`, `schema.sql` 반영. 운영 Supabase에는 v6 마이그레이션을 SQL Editor에서 직접 실행 필요.

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
- 구글 폼 이메일 수집 안내는 **항목 5 정책**에 따라 유지·수정·삭제 (DB `email` 컬럼과 무관)

---

## 2. DB: `game_id` → `player_id` ✅

> **완료** — `supabase_migration_v7.sql`, `schema.sql` 반영. **운영 Supabase에 v7 마이그레이션 실행 필요** (v6 이후).

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

## 3. Excel·사이트·문서 전체 용어 통일 ✅

> **완료** — 코드·스크립트·문서·엑셀 헤더 반영. DB 컬럼 `name`은 유지, UI/엑셀/구글 폼 라벨만 **Player Name**으로 통일.

`Player ID` / `player_id` / `playerId`  
`Player Name` (DB 컬럼 `name` 유지)

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
- "응답 수정 허용" 기간에는 **수정 제출**로 내용 갱신 (새 Player ID로 또 넣는 것과 다름) — **이메일 수집이 켜져 있을 때만** 확인 메일·수정 링크 이용 가능 (항목 5 참고)

코드 변경은 불필요. 사용자-facing 설명만 추가. 이메일 수집 정책에 따라 문구는 항목 5 분기 사용.

### 할 일

| 대상 | 내용 |
|------|------|
| **실제 구글 폼** (수동) | 폼 상단 설명에 안내 문구 추가 (아래 예시) |
| `docs/RESERVATION_SYSTEM.md` §구글 폼 | "폼 항목 구성" 위에 안내 섹션 추가 |
| `docs/RESERVATION_SYSTEM_EN.md` | 영문 동일 |
| `docs/ADMIN_GUIDE_QUICKSTART_EN.md` | Player Quick Reference에 한 줄 추가 |
| `README.md` §구글 폼 연동 | 중복 방지 표 보강 |

### 폼 설명 예시 (한글) — 이메일 수집 **켜기** (항목 5-A)

> 동일한 Player ID로 같은 요일을 여러 번 제출해도 **해당 요일은 1회만** 반영됩니다.  
> 월·화·목은 각각 별도로 신청할 수 있습니다.  
> 내용을 바꾸려면 제출 확인 이메일의 **응답 수정 링크**를 사용하세요.

### 폼 설명 예시 (영문) — 이메일 수집 **켜기** (항목 5-A)

> Submitting the same Player ID for the same day more than once will only count **once per day**.  
> Monday, Tuesday, and Thursday can each be applied for separately.  
> To change your answers, use the **edit response link** in your confirmation email.

### 폼 설명 예시 (한글) — 이메일 수집 **끄기** (항목 5-B)

> 동일한 Player ID로 같은 요일을 여러 번 제출해도 **해당 요일은 1회만** 반영됩니다.  
> 월·화·목은 각각 별도로 신청할 수 있습니다.  
> 제출 후 내용을 바꿀 수 없습니다. 수정이 필요하면 **시크릿 링크**로 다시 신청하거나 운영진(r4)에게 문의하세요.

### 폼 설명 예시 (영문) — 이메일 수집 **끄기** (항목 5-B)

> Submitting the same Player ID for the same day more than once will only count **once per day**.  
> Monday, Tuesday, and Thursday can each be applied for separately.  
> You cannot edit your form response after submission. To make changes, use the **secret link** or contact ops (r4).

---

## 5. 구글 폼 이메일 수집 여부 (응답 수정 가능 여부)

### 배경

- 구글 폼 설정 → **응답** → **이메일 주소 수집**을 끄면, 제출자에게 **응답 확인·수정 링크가 발송되지 않음**
- "응답 수정 허용"을 켜도, 이메일 수집이 꺼져 있으면 실질적으로 **구글 폼 경로로는 제출 후 수정 불가**
- 이 앱(Supabase)은 구글 폼 이메일을 저장하지 않음 → **항목 1(DB `email` 삭제)과 독립적인 운영 정책**

### 현재 문서·가이드 전제

다음은 **이메일 수집 켜짐**을 가정하고 있음:

- `docs/RESERVATION_SYSTEM.md` — 폼 설정 "이메일 주소 수집: 켜기", `row[1]` 이메일, 시나리오 A "제출 이메일의 응답 수정 링크"
- `docs/RESERVATION_SYSTEM_EN.md`, `.html` 파일들
- `docs/ADMIN_GUIDE_QUICKSTART_EN.md` — "Edit via email response link"
- `README.md` — 구글 폼 수정 흐름

### 정책 선택

| | **5-A: 이메일 수집 켜기** (현재 문서 기준) | **5-B: 이메일 수집 끄기** |
|---|-------------------------------------------|---------------------------|
| 구글 폼 제출 후 수정 | 확인 메일의 **응답 수정 링크** | **불가** (구글 폼으로는) |
| 수정 대안 | 수정 링크 + 시크릿 링크 + Admin | **시크릿 링크** (`/r/[token]`) 또는 Admin |
| 개인정보 | 구글이 이메일을 시트 `row[1]`에 보관 (앱 DB에는 없음) | 이메일 미수집 |
| 로그인 | 구글 계정 로그인 필요 (폼 설정에 따름) | 동일 |

### 5-B 선택 시 할 일

| 대상 | 내용 |
|------|------|
| **실제 구글 폼** (수동) | 설정에서 이메일 수집 **끄기** — "응답 수정 허용"만으로는 수정 링크가 오지 않음을 인지 |
| `docs/RESERVATION_SYSTEM.md` | "이메일 주소 수집: 켜기" → **끄기** 또는 선택 사항으로 정리; `row[1]` 설명 삭제·수정; 시나리오 A를 시크릿 링크/Admin 중심으로 변경 |
| `docs/RESERVATION_SYSTEM_EN.md` + html | 동일 |
| `docs/ADMIN_GUIDE_QUICKSTART_EN.md` | "email response link" 문구 제거, 시크릿 링크 안내로 대체 |
| `README.md` | 운영 시나리오 표에서 구글 폼 수정 경로 수정 |
| 항목 4 폼 설명 | 위 **5-B 예시 문구** 사용 |

### 5-B 선택 시 주의 (운영)

- 구글 폼으로만 신청한 사용자는 **제출 후 스스로 수정할 수 없음**
- 같은 Player ID·요일을 시크릿 링크로 다시 넣으면 중복 거부 (`DUPLICATE_DAY_MESSAGE`) — Admin이 preferences 삭제하거나 시크릿 링크에서 해당 요일만 다시 신청하도록 안내 필요
- 배정 전: Admin 대시보드에서 preferences 삭제 가능 (문서에 이미 있음)
- 배정 후: Admin 슬롯 이동 등 기존 운영 절차

### Apps Script / 코드

- `scripts/appscript/onFormSubmit.gs`는 `row[1]`(이메일)을 **읽지 않음** — 이메일 수집 on/off와 무관하게 동작
- 이메일 수집을 끄면 시트 `row[]` 인덱스가 **한 칸 당겨질 수 있음** — `row[2]` Game ID가 `row[1]`로 바뀌는지 **반드시 테스트 후** Apps Script 인덱스 수정

### 체크 (5-B 적용 전)

- [ ] 테스트 제출 후 시트에서 각 컬럼이 어느 `row[n]`에 들어가는지 확인
- [ ] 필요 시 `onFormSubmit.gs`의 `row[2]`~`row[10]` 인덱스 조정
- [ ] 문서·폼 설명·가이드에서 "응답 수정 링크" 문구 일괄 제거 또는 조건부 표기

---

## 작업 완료 체크리스트

- [x] ~~Supabase 마이그레이션 v7 적용 (운영 DB)~~ — v6 완료, **v7 직접 실행 필요**
- [x] ~~`schema.sql` 동기화~~ — 항목 1·2 완료
- [x] ~~TypeScript 전역 검색: `game_id`, `gameId`, `Game ID`, `Game Name`~~ — 항목 2·3 완료
- [ ] 구글 폼 이메일 수집 정책 확정 (항목 5-A vs 5-B)
- [ ] 구글 폼 질문 제목·설명·Apps Script `row[]` 인덱스 확인 (이메일 수집 off 시 인덱스 변경 여부)
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
| 5. 이메일 수집 정책 | 폼 설정 + 문서 대량 수정 (5-B 시) | 중간 (5-B: 응답 수정 불가, row 인덱스) |
