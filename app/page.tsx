import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-bold text-brand-900">관직 예약 시스템</h1>
      <p className="text-sm text-slate-600">
        예약 신청은 운영자가 공유한 비밀 URL로 접속하세요.
      </p>
      <div className="flex w-full flex-col gap-3">
        <Link href="/status" className="btn-primary text-center">
          예약 현황 조회
        </Link>
        <Link href="/admin/login" className="btn-secondary text-center">
          운영자 로그인
        </Link>
      </div>
    </div>
  );
}
