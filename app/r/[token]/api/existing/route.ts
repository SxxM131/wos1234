import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getReservedDaysForPlayer } from "@/lib/reservation-guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  await params;
  const searchParams = new URL(request.url).searchParams;
  const gameId = parseInt(searchParams.get("gameId") ?? "", 10);
  const email = searchParams.get("email")?.trim() || null;
  if (!gameId || isNaN(gameId)) {
    return NextResponse.json({ reservedDays: [] });
  }

  const supabase = createServiceClient();
  const reservedDays = await getReservedDaysForPlayer(supabase, gameId, email);
  return NextResponse.json({ reservedDays });
}
