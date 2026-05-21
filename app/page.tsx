import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-bold text-brand-900">Office Reservation</h1>
      <p className="text-sm text-slate-600">
        Use the secret URL shared by your alliance officer to apply.
      </p>
      <div className="flex w-full flex-col gap-3">
        <Link href="/status" className="btn-primary text-center">
          View Schedule
        </Link>
        <Link href="/admin/login" className="btn-secondary text-center">
          r4+ only
        </Link>
      </div>
    </div>
  );
}
