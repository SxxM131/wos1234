# SVS Reservation

Next.js 14 + Supabase + Vercel based SVS reservation web app. Mobile-first UI.

## 로컬 개발

```bash
npm install
cp .env.example .env.local   # 또는 이미 있는 .env.local 수정
# .env.local에 Supabase 3개 키 입력 (IRON_SESSION_SECRET는 npm run setup:secret 으로 생성)
npm run check-env            # 환경 변수 검증
npm run dev
```

**상세 설정 가이드:** [docs/SETUP.md](docs/SETUP.md)

## Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. 최신 마이그레이션(`supabase/migrations/supabase_migration_v5.sql`) 순서대로 실행
4. Project Settings → API에서 URL, anon key, service_role key 복사

## 환경 변수

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (서버 전용) |
| `IRON_SESSION_SECRET` | 32자 이상 랜덤 문자열 |

세션 시크릿 생성:

```bash
npm run setup:secret
```

## 배포 (Vercel)

1. GitHub에 push
2. Vercel에서 Import → 환경 변수 등록
3. 배포 후 `/admin/setup`에서 관리자 비밀번호 설정
4. `/admin`에서 비밀 URL 확인 후 연맹원에게 공유

## 예약 배정 알고리즘 (Batch Assignment)

현재 시스템은 즉시 배정이 아닌 **일괄 배정(Batch Assignment)** 방식을 사용합니다.

1. 사용자는 비밀 URL(`/r/[token]`) 또는 **구글 폼**에서 **선호 시간(Preferences)**만 제출합니다.
2. 마감 후 관리자가 `/admin`에서 **Run full assignment**를 실행하면, **스피드업(내림차순) → 신청 시각(오름차순)**을 기준으로 **Min-Cost Max-Flow (MCMF) 최소 비용 최대 유량 알고리즘**을 통해 자동 배정됩니다.
3. 배정받지 못한 인원은 대기열(Waitlist)로 이동하며, 기존 예약을 취소하면 대기열 1순위가 해당 빈자리에 자동으로 승격됩니다.

> **알고리즘 교체 이유:** 이전 Hopcroft-Karp 방식에서 발생하던 ① 빈 슬롯 + 대기자 동시 존재(V1) 및 ② 스피드업 역전(V4) 문제를 MCMF로 해결했습니다. (`verify:assignment` 기준 에러 0건·경고 0건)

상세한 매칭 동작은 [docs/RESERVATION_SYSTEM.md](docs/RESERVATION_SYSTEM.md)를 참고하세요.

## 구글 폼 연동 (선택)

Vercel 콜드스타트 우회 목적으로 구글 폼을 통한 신청을 병행 운영할 수 있습니다.

- 구글 폼 제출 → Apps Script 트리거 → Supabase `players` / `preferences` 직접 INSERT
- 기존 시크릿 링크(`/r/[token]`)와 **동시 운영** 가능
- 중복 방지: 구글 폼 응답 1회 제한 + Apps Script에서 `email + cycle_id + day_of_week` 기준 중복 체크

설정 방법은 [docs/RESERVATION_SYSTEM.md](docs/RESERVATION_SYSTEM.md) §16을 참고하세요.

## npm 스크립트

| 스크립트 | 설명 |
|----------|------|
| `npm run dev` | 로컬 개발 서버 |
| `npm run check-env` | 환경 변수 검증 |
| `npm run setup:secret` | IRON_SESSION_SECRET 생성 |
| `npm run set-admin-password` | Admin 비밀번호 설정 |
| `npm run inject:random -- N` | N명 무작위 신청 주입 (기본 120, preferences만) |
| `npm run clear:assignments` | 현재 사이클 배정 결과만 삭제 |
| `npm run seed:stress` | clear + 120명 주입 |
| `npm run run:batch` | Admin 버튼과 동일한 일괄 배정 실행 |
| `npm run verify:assignment` | 배정 결과 검증 (V1~V5 체크) |
| `npm run purge:orphans` | preferences 없는 고아 players 삭제 |
| `npm run inject:test` | 실제 테스트 데이터 주입 |
| `npm run recover:waitlist` | 대기열 복구 |
| `npm run backfill:slots` | 빈 슬롯 백필 |
| `npm run reconcile:waitlist` | eliminated 정합성 정리 |

**로컬에서 버튼과 동일하게 배정 테스트:**

```bash
npm run inject:random -- 10
npm run run:batch
npm run verify:assignment   # 배정 결과 검증
```

## 페이지

| 경로 | 설명 |
|------|------|
| `/r/[token]` | 예약 신청 (비밀 URL) |
| `/r/[token]/check` | 본인 예약 확인 |
| `/status` | 공개 현황 조회 |
| `/admin` | 운영자 관리 |

## 기술 스택

- Next.js 14 (App Router, Server Actions)
- Supabase (PostgreSQL + Realtime)
- Tailwind CSS
- iron-session + bcryptjs
