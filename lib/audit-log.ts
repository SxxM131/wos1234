import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentCycleId, getLastAssignmentRun } from "./assignment";

export type AuditResubmitSource = "secret_url" | "google_form";

export async function getActorIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (!forwarded) return null;
    return forwarded.split(",")[0]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * If the player already has preferences in the current cycle (resubmit),
 * snapshot them to audit_log before the RPC replaces them.
 * Failures are logged only — never blocks submission.
 */
export async function logResubmitPreferenceIfNeeded(
  supabase: SupabaseClient,
  playerId: number,
  source: AuditResubmitSource,
  actorIp: string | null
): Promise<void> {
  try {
    const cycleId = await getCurrentCycleId(supabase);

    const { data: existing, error: selectError } = await supabase
      .from("preferences")
      .select("*")
      .eq("player_id", playerId)
      .eq("cycle_id", cycleId);

    if (selectError) {
      console.error(
        "audit_log resubmit preference select failed:",
        selectError
      );
      return;
    }

    // First-time application this cycle — no replace, skip audit
    if (!existing?.length) return;

    const lastRun = await getLastAssignmentRun(supabase);
    const wasLocked = !!lastRun;

    const { error: auditError } = await supabase.from("audit_log").insert({
      action: "resubmit_preference",
      player_id: playerId,
      day_of_week: null,
      cycle_id: cycleId,
      snapshot: existing,
      source,
      was_locked: wasLocked,
      actor_ip: actorIp,
    });

    if (auditError) {
      console.error(
        "audit_log insert failed (resubmit_preference):",
        auditError
      );
      return;
    }

    if (wasLocked) {
      console.warn(
        `[AUDIT] Resubmission after assignment: player_id=${playerId}, cycle_id=${cycleId}`
      );
    }
  } catch (err) {
    console.error("audit_log insert failed (resubmit_preference):", err);
  }
}
