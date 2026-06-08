# SVS Reservation

Next.js 14 + Supabase + Vercel 기반의 연맹 SVS(성) 예약·배정 웹앱입니다. Mobile-first UI.

---

## 로컬 개발

```bash
npm install
cp .env.example .env.local   # 또는 이미 있는 .env.local 수정
npm run check-env             # 환경 변수 검증
npm run dev
```

**상세 설정 가이드:** [docs/SETUP.md](docs/SETUP.md)

---

## 환경 변수

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (예: `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key — **서버 전용, 절대 클라이언트 노출 금지** |
| `IRON_SESSION_SECRET` | 32자 이상 랜덤 문자열 |

세션 시크릿 생성:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. SQL Editor에서 `supabase/migrations/v5.sql` 실행 (email 컬럼 등 추가)
4. Project Settings → API에서 URL, anon key, service_role key 복사

---

## 배포 (Vercel)

1. GitHub에 push
2. Vercel에서 Import → 환경 변수 4개 등록
3. 배포 후 `/admin/setup`에서 관리자 비밀번호 설정
4. `/admin`에서 비밀 URL 확인 후 연맹원에게 공유

---

## 예약 배정 알고리즘

현재 시스템은 즉시 배정이 아닌 **일괄 배정(Batch Assignment)** 방식을 사용합니다.

1. 플레이어는 비밀 URL(`/r/[token]`) 또는 **구글 폼**에서 **선호 시간(preferences)만** 제출합니다.
2. 마감 후 관리자가 `/admin`에서 **Run full assignment**를 실행하면, **Min-Cost Max-Flow (MCMF)** 알고리즘이 스피드업 내림차순 → 신청 시각 오름차순 기준으로 자동 배정합니다.
3. 배정받지 못한 인원은 대기열(Waitlist)로 이동하며, 기존 예약 취소 시 대기열 1순위가 빈 자리에 자동 승격됩니다.

> **MCMF 교체 이유:** 이전 Hopcroft-Karp 방식에서 발생하던 ① 빈 슬롯 + 대기자 동시 존재(V1), ② 스피드업 역전(V4) 문제를 해결했습니다. `verify:assignment` 기준 에러 0건·경고 0건.

상세 동작은 [docs/RESERVATION_SYSTEM.md](docs/RESERVATION_SYSTEM.md)를 참고하세요.

---

## 구글 폼 연동 (선택)

Vercel 콜드스타트 우회 목적으로 구글 폼을 통한 신청을 병행 운영할 수 있습니다.

```
구글 폼 제출 → Apps Script (onFormSubmit) → Supabase players / preferences
시크릿 링크 (/r/[token]) → Server Action → Supabase players / preferences
```

- 두 경로 모두 **동일한 DB 테이블**에 저장되며 배정 알고리즘은 그대로 적용됩니다.
- 중복 방지: 구글 폼 응답 1회 제한 + Apps Script에서 `game_id + cycle_id + day_of_week` 기준 체크
- cycle_id는 Supabase settings 테이블에서 동적 조회하므로 **Reset cycle 후 코드 수정 불필요**

설정 방법은 [docs/RESERVATION_SYSTEM.md §17](docs/RESERVATION_SYSTEM.md#17-구글-폼-연동-apps-script-파이프라인)을 참고하세요.

---

## npm 스크립트

| 스크립트 | 위치 | 설명 |
|----------|------|------|
| `npm run dev` | — | 로컬 개발 서버 |
| `npm run check-env` | `scripts/admin/` | 환경 변수 검증 |
| `npm run set-admin-password` | `scripts/admin/` | Admin 비밀번호 설정 |
| `npm run inject:random -- N` | `scripts/dev/` | N명 무작위 신청 주입 (기본 120) |
| `npm run inject:test` | `scripts/dev/` | 실제 테스트 데이터 주입 |
| `npm run clear:assignments` | `scripts/dev/` | 현재 사이클 배정 결과만 삭제 |
| `npm run seed:stress` | `scripts/dev/` | clear + 120명 주입 |
| `npm run run:batch` | `scripts/maintenance/` | Admin 버튼과 동일한 일괄 배정 실행 |
| `npm run verify:assignment` | `scripts/verify/` | 배정 결과 검증 (V1~V5) — 에러 시 exit(1) |
| `npm run audit:reservations` | `scripts/verify/` | 사이클 전체 감사 |
| `npm run validate:assignment` | `scripts/verify/` | 배정 유효성 검사 |
| `npm run recover:waitlist` | `scripts/maintenance/` | 대기열 복구 |
| `npm run backfill:slots` | `scripts/maintenance/` | 빈 슬롯 백필 |
| `npm run reconcile:waitlist` | `scripts/maintenance/` | eliminated 정합성 정리 |
| `npm run purge:orphans` | `scripts/maintenance/` | 고아 players 삭제 |

**배정 테스트 플로우:**

```bash
npm run inject:random -- 10
npm run run:batch
npm run verify:assignment
```

---

## 페이지

| 경로 | 설명 |
|------|------|
| `/r/[token]` | 예약 신청 (비밀 URL) |
| `/r/[token]/check` | 본인 예약 확인 |
| `/status` | 공개 현황 조회 |
| `/admin` | 운영자 관리 |

---

## 폴더 구조

```
wos1234/
├── README.md
├── middleware.ts
├── package.json
├── app/                   # Next.js 페이지·API
│   ├── admin/
│   ├── r/[token]/
│   ├── status/
│   └── api/
├── lib/                   # 공유 로직 (assignment, reservation-guard 등)
├── components/            # UI 컴포넌트
├── docs/                  # 문서
│   ├── RESERVATION_SYSTEM.md
│   ├── SETUP.md
│   └── implementation_plan.md
├── scripts/
│   ├── dev/               # inject-random, clear-cycle-assignments 등
│   ├── verify/            # verify-assignment, audit-reservations 등
│   ├── maintenance/       # run-batch-assignment, recover-waitlist 등
│   └── admin/             # check-env, set-admin-password
└── supabase/
    ├── schema.sql
    └── migrations/        # v4.sql, v5.sql
```

---

## 기술 스택

- Next.js 14 (App Router, Server Actions)
- Supabase (PostgreSQL + Realtime)
- Tailwind CSS
- iron-session + bcryptjs
- Min-Cost Max-Flow (MCMF) 배정 알고리즘
