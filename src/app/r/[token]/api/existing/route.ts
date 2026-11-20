import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getReservedDaysForPlayer } from "@/lib/reservation-guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  await params;
  const searchParams = new URL(request.url).searchParams;
  const playerId = parseInt(searchParams.get("playerId") ?? "", 10);
  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ reservedDays: [] });
  }

  const supabase = createServiceClient();
  const reservedDays = await getReservedDaysForPlayer(supabase, playerId);
  return NextResponse.json({ reservedDays });
}
