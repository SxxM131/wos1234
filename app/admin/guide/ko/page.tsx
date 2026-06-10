import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/session";
import { loadKoreanGuideHtml } from "@/lib/admin-guide";
import { GuideView } from "../GuideView";

export const dynamic = "force-dynamic";

export default async function AdminGuideKoPage() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    redirect("/admin/login");
  }

  const html = loadKoreanGuideHtml();

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/guide" className="text-sm text-blue-600 underline">
            ← English guide
          </Link>
          <span className="text-sm font-semibold text-slate-700">
            기술 문서 (한국어)
          </span>
        </div>
      </div>
      <GuideView html={html} hideHeader />
    </div>
  );
}
