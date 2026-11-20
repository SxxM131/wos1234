import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminGuideKoPage() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    redirect("/admin/login");
  }

  redirect("/admin/guide?tab=technical");
}
