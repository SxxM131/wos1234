import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { loadAdminGuideHtml } from "@/lib/admin-guide";
import { GuideView } from "./GuideView";

export const dynamic = "force-dynamic";

export default async function AdminGuidePage() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    redirect("/admin/login");
  }

  const html = loadAdminGuideHtml();

  return <GuideView html={html} />;
}
