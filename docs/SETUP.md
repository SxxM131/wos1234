# 배포·설정 가이드 (5분)

## 1단계: Supabase 프로젝트 만들기

> ⚠ 키는 **GitHub**([SxxMWolf/wos1234](https://github.com/SxxMWolf/wos1234))가 아니라 **Supabase 웹사이트**에서만 나옵니다.

### A. 프로젝트가 아직 없다면

1. [https://supabase.com/dashboard](https://supabase.com/dashboard) 접속 (GitHub 계정으로 로그인 가능)
2. **New project** 클릭
3. Organization 선택 → Name 입력 → Database Password 설정 → Region 선택 → **Create new project**
4. 상태가 **Active** 될 때까지 1~2분 대기

### B. API 키 찾기 (화면별 경로)

프로젝트를 연 뒤, 아래 **둘 중 하나**로 들어가면 됩니다.

**방법 1 (가장 흔함)**  
1. 왼쪽 맨 아래 **⚙ Project Settings** (톱니바퀴)  
2. 왼쪽 메뉴에서 **API** 클릭  
3. 페이지 상단 **Project URL** 복사  
4. 아래 **Project API keys** 표에서:
   - `anon` `public` → **복사** (눈 아이콘으로 보이기)
   - `service_role` `secret` → **Reveal** 누른 뒤 복사  

**방법 2 (새 UI)**  
1. 프로젝트 홈 왼쪽 **Connect** 버튼  
2. **App Frameworks** → Next.js 선택  
3. 나오는 **Project URL**, **anon key** 확인  
4. `service_role`은 여전히 **Project Settings → API**에 있음  

### C. `.env.local`에 넣을 이름

| Supabase 화면에 보이는 이름 | `.env.local` 변수명 |
|---------------------------|---------------------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon · public | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role · secret | `SUPABASE_SERVICE_ROLE_KEY` |

예시 (값은 본인 프로젝트 것으로 교체):

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- URL은 반드시 `https://xxxx.supabase.co` 형태  
- 키는 `eyJ`로 시작하는 긴 문자열  
- ⚠ `service_role`은 GitHub·채팅에 올리지 마세요  

### D. DB 테이블 만들기

1. 왼쪽 **SQL Editor** → **New query**
2. `supabase/schema.sql` 내용 **전체** 붙여넣기 → **Run**
3. 왼쪽 **Table Editor**에서 `players`, `slots`, `settings` 테이블이 보이면 성공

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
