import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import {
  getCurrentCycleId,
  runBatchAssignmentForCycle,
} from "@/lib/assignment";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "run_batch_assignment") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const cycleId = await getCurrentCycleId(supabase);
    const results = await runBatchAssignmentForCycle(supabase, cycleId);

    revalidatePath("/admin");
    revalidatePath("/status");

    return NextResponse.json({
      success: true,
      mon: results.mon,
      tue: results.tue,
      thu: results.thu,
    });
  } catch (e) {
    console.error("run_batch_assignment failed:", e);
    return NextResponse.json(
      { success: false, error: "Assignment run failed." },
      { status: 500 }
    );
  }
}
