import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import {
  getCurrentCycleId,
  getLastAssignmentRun,
  getAssignmentApplicantCounts,
} from "@/lib/assignment";

export async function GET() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);
  const applicants = await getAssignmentApplicantCounts(supabase, cycleId);
  const lastRun = await getLastAssignmentRun(supabase);

  return NextResponse.json({ applicants, lastRun });
}
