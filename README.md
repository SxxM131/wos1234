# SVS Reservation

취미 게임 커뮤니티(연맹)의 SVS(관직) 스케줄을 관리하고, **Min-Cost Max-Flow** 알고리즘으로 공정하게 예약·배정하는 모바일 퍼스트 웹앱입니다.

| 항목 | 내용 |
|------|------|
| **상태** | 배포 완료 (Vercel) |
| **유형** | 개인 프로젝트 (1인 풀스택) |
| **저장소** | `wos1234` |

---

## 소개

연맹원이 희망 시간대·관직을 신청하면, 관리자(R4)가 일괄 배정을 실행해 슬롯을 확정하는 시스템입니다. 구글 폼 또는 시크릿 URL(`/r/[token]`)로 신청을 받고, 스피드업·신청 시각을 기준으로 MCMF 알고리즘이 배정합니다.

> 원래 게임 클랜 스케줄 관리 웹사이트로 시작했으며, 이후 연맹 SVS 예약·배정 시스템으로 발전했습니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **예약 신청** | 구글 폼 또는 시크릿 URL로 선호 시간·관직 제출 |
| **일괄 배정** | Min-Cost Max-Flow(MCMF) 알고리즘으로 공정한 슬롯 배정 |
| **대기열** | 슬롯 부족 시 Waitlist, 취소 시 자동 승격 |
| **관리자 대시보드** | 신청자 조회, 배정 실행, 스케줄 그리드, Excel보내기 |
| **예약 수정** | 신청 기간 중 재제출(전체 교체), 배정 후 R4 조정 |
| **Google Forms 연동** | Apps Script → Webhook으로 구글 폼 제출 수신 (선택) |
| **모바일 퍼스트 UI** | 연맹원이 주로 모바일로 접속하는 환경에 맞춘 설계 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Framework** | Next.js 14, React 18, TypeScript |
| **Database** | Supabase (PostgreSQL) |
| **인증** | Iron Session, bcryptjs |
| **배포** | Vercel |
| **알고리즘** | Min-Cost Max-Flow (예약 배정) |
| **기타** | Tailwind CSS, xlsx (Excel보내기), Mermaid |

---

## 시스템 구조

```
플레이어                    관리자 (R4)
   │                           │
   ├── 구글 폼 ──▶ Apps Script ──┐
   └── /r/[token] ──────────────┤
                                 ▼
                         Next.js API Routes
                                 │
                                 ▼
                            Supabase (PostgreSQL)
                                 │
                                 ▼
                         MCMF 일괄 배정 (Run full assignment)
```

---

## 프로젝트 구조

```
wos1234/
├── app/              # Next.js App Router
│   ├── admin/        # 관리자 대시보드
│   ├── api/          # API Routes (google-form-submit 등)
│   └── r/[token]/    # 시크릿 URL 예약 페이지
├── components/       # UI 컴포넌트
├── lib/              # 비즈니스 로직, MCMF 배정
├── supabase/         # schema.sql, migrations
├── scripts/          # 검증·유지보수·개발 스크립트
└── docs/             # 운영 시나리오, 시스템 문서
```

---

## 시작하기

### 사전 요구사항

- Node.js 18+
- Supabase 계정

### 1. 설치

```bash
npm install
cp .env.example .env.local
npm run check-env
```

### 2. Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. Project Settings → API에서 URL, anon key, service_role key 복사

### 3. 로컬 실행

```bash
npm run dev
```

### 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service role key (서버 전용) |
| `IRON_SESSION_SECRET` | ✅ | 32자 이상 랜덤 문자열 |
| `GOOGLE_FORM_WEBHOOK_SECRET` | | 구글 폼 Webhook 시크릿 (선택) |

세션 시크릿 생성:

```bash
npm run setup:secret
```

### 배포 (Vercel)

1. GitHub에 push
2. Vercel Import → 환경 변수 4개 등록
3. 배포 후 `/admin/setup`에서 관리자 비밀번호 설정
4. `/admin`에서 비밀 URL 확인 후 연맹원에게 공유

---

## 예약 배정 흐름

1. 플레이어가 구글 폼 또는 시크릿 URL로 선호 시간 제출
2. 관리자가 구글 폼 응답 중지 + **Close secret URL**
3. 관리자가 **Run full assignment** 실행
4. MCMF 알고리즘: 스피드업 내림차순 → 신청 시각 오름차순으로 배정
5. 배정 성공 → 예약 확정 / 슬롯 없음 → 대기열

> MCMF 도입으로 빈 슬롯+대기자 동시 존재, 스피드업 역전 문제를 해결했습니다.

---

## 유용한 스크립트

| 명령 | 설명 |
|------|------|
| `npm run verify:assignment` | 배정 결과 검증 |
| `npm run run:batch` | 일괄 배정 실행 |
| `npm run audit:reservations` | 예약 감사 |
| `npm run seed:stress` | 스트레스 테스트 데이터 주입 |

---

## 상세 문서

| 문서 | 내용 |
|------|------|
| [docs/RESERVATION_SYSTEM.md](docs/RESERVATION_SYSTEM.md) | 운영 시나리오, 예약 수정, 배정 상세 |
| [docs/RESERVATION_SYSTEM_EN.html](docs/RESERVATION_SYSTEM_EN.html) | English + diagrams |

---

## 참고

- 구글 폼은 대시보드 Open/Close와 무관하게 응답 수락 중일 때 계속 접수됩니다.
- 배정 후 재제출 시 기존 배정이 삭제되므로 의도치 않은 재제출에 주의하세요.
