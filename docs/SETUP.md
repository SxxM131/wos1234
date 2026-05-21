# 배포·설정 가이드 (5분)

## 1단계: Supabase 프로젝트 만들기

1. [https://supabase.com](https://supabase.com) 로그인 → **New project**
2. 프로젝트 이름·비밀번호 설정 후 생성 (1~2분 대기)
3. 왼쪽 **SQL Editor** → **New query**
4. 이 저장소의 `supabase/schema.sql` 파일 내용 **전체 복사** → 붙여넣기 → **Run**
5. 왼쪽 **Project Settings** → **API** 메뉴에서 아래 3개 복사:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (Reveal) → `SUPABASE_SERVICE_ROLE_KEY`  
     ⚠ service_role은 절대 공개·커밋하지 마세요.

## 2단계: 로컬 환경 변수

프로젝트 루트에서:

```bash
cp .env.example .env.local
```

`.env.local`을 열고 Supabase에서 복사한 3개 값을 붙여넣습니다.  
`IRON_SESSION_SECRET`는 이미 생성되어 있으면 그대로 두세요.

검증:

```bash
node scripts/check-env.mjs
```

## 3단계: 로컬 실행

```bash
npm install
npm run dev
```

브라우저(또는 핸드폰 같은 Wi‑Fi):

| URL | 용도 |
|-----|------|
| http://localhost:3000/admin/setup | 최초 관리자 비밀번호 |
| http://localhost:3000/admin | 운영 대시보드·비밀 URL |
| http://localhost:3000/status | 예약 현황 |

핸드폰 테스트: PC IP로 접속 (예: `http://192.168.0.10:3000/status`)

## 4단계: Vercel 배포

1. GitHub에 이 저장소 push
2. [https://vercel.com](https://vercel.com) → **Add New Project** → 저장소 Import
3. **Environment Variables**에 `.env.local`과 동일한 4개 추가
4. Deploy 완료 후 `https://your-app.vercel.app/admin/setup` 에서 비밀번호 설정
5. `/admin`에서 비밀 URL 복사 → 연맹원에게 공유

### Vercel 환경 변수 (복사용)

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `IRON_SESSION_SECRET` | 로컬과 동일한 64자 hex |

## 문제 해결

- **404 on /r/xxx** → `/admin`에서 토큰 재생성 후 새 URL 사용
- **예약 실패** → Supabase SQL이 실행됐는지, `slots` 테이블에 144행 있는지 확인
- **Realtime 안 됨** → Supabase Dashboard → Database → Replication에서 `reservations` 활성화
