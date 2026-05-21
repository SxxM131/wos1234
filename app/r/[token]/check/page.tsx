import Link from "next/link";
import { CheckForm } from "./CheckForm";

export default async function CheckPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-brand-900">내 예약 확인</h1>
      </header>
      <CheckForm />
      <Link
        href={`/r/${token}`}
        className="mt-6 block text-center text-sm text-brand-600 underline"
      >
        예약 신청으로 돌아가기
      </Link>
    </div>
  );
}
