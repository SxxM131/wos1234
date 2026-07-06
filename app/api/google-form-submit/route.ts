import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { submitMultiDayReservationRpc, DaySubmit } from "@/lib/assignment";
import { DayOfWeek, isValidAlliance } from "@/lib/types";

const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

type DayPayload = {
  speedup?: unknown;
  blocks?: unknown;
};

type GoogleFormPayload = {
  player_id?: unknown;
  name?: unknown;
  alliance?: unknown;
  days?: Partial<Record<DayOfWeek, DayPayload>>;
};

function webhookSecretMatches(provided: string | null): boolean {
  const expected = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseBlocks(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => parseInt(String(v), 10))
    .filter((n) => !isNaN(n) && n >= 0);
}

function buildDaySubmits(days: GoogleFormPayload["days"]): DaySubmit[] {
  const submits: DaySubmit[] = [];
  for (const day of ALL_DAYS) {
    const entry = days?.[day];
    const blocks = parseBlocks(entry?.blocks);
    if (blocks.length === 0) continue;
    const speedup = parseInt(String(entry?.speedup ?? ""), 10);
    if (isNaN(speedup) || speedup < 0) {
      throw new Error(`${day}: speedup must be a whole number ≥ 0.`);
    }
    submits.push({ dayOfWeek: day, speedup, preferredBlocks: blocks });
  }
  return submits;
}

export async function POST(request: Request) {
  if (!process.env.GOOGLE_FORM_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Google Form webhook is not configured on the server." },
      { status: 503 }
    );
  }

  const secret = request.headers.get("x-webhook-secret");
  if (!webhookSecretMatches(secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: GoogleFormPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const playerId = parseInt(String(body.player_id ?? ""), 10);
  const name = String(body.name ?? "").trim();
  const alliance = String(body.alliance ?? "").trim();

  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "Invalid player_id." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!isValidAlliance(alliance)) {
    return NextResponse.json({ error: "Invalid alliance." }, { status: 400 });
  }

  let daySubmits: DaySubmit[];
  try {
    daySubmits = buildDaySubmits(body.days);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid day data.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (daySubmits.length === 0) {
    return NextResponse.json(
      { error: "Select at least one day with time slots." },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const result = await submitMultiDayReservationRpc(
    supabase,
    playerId,
    name,
    alliance,
    daySubmits,
    { skipOpenCheck: true }
  );

  return NextResponse.json(result, { status: result.success ? 200 : 409 });
}
