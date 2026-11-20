import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { loadMobileGuideHtml } from "@/lib/admin-guide";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const embed = request.nextUrl.searchParams.get("embed") === "1";
  const html = loadMobileGuideHtml({ embed });
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
    },
  });
}
