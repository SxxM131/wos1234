import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { isGuideTab, loadGuideSections } from "@/lib/admin-guide";
import { GuideView } from "./GuideView";

export const dynamic = "force-dynamic";

export default async function AdminGuidePage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    redirect("/admin/login");
  }

  const sections = loadGuideSections();
  const initialTab = isGuideTab(searchParams.tab) ? searchParams.tab : "admin";

  return <GuideView sections={sections} initialTab={initialTab} />;
}
