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
3. Project Settings → API에서 URL, anon key, service_role key 복사

## 환경 변수

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (서버 전용) |
| `IRON_SESSION_SECRET` | 32자 이상 랜덤 문자열 |

세션 시크릿 생성:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 배포 (Vercel)

1. GitHub에 push
2. Vercel에서 Import → 환경 변수 등록
3. 배포 후 `/admin/setup`에서 관리자 비밀번호 설정
4. `/admin`에서 비밀 URL 확인 후 연맹원에게 공유

## 예약 배정 알고리즘 (Batch Assignment)

현재 시스템은 즉시 배정이 아닌 **일괄 배정(Batch Assignment)** 방식을 사용합니다.

1. 사용자는 비밀 URL에서 **선호 시간(Preferences)**만 제출합니다.
2. 마감 후 관리자가 `/admin`에서 **Run full assignment**를 실행하면, **스피드업(내림차순) -> 신청 시각(오름차순)**을 기준으로 **Min-Cost Max-Flow (MCMF) 최소 비용 최대 유량 알고리즘**을 통해 자동 배정됩니다.
3. 배정받지 못한 인원은 대기열(Waitlist)로 이동하며, 기존 예약을 취소하면 대기열 1순위가 해당 빈자리에 자동으로 승격됩니다.

상세한 매칭 동작은 [implementation_plan.md](implementation_plan.md) 및 [docs/RESERVATION_SYSTEM.md](docs/RESERVATION_SYSTEM.md)를 참고하세요.

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
