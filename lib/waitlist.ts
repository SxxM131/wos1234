import { DayOfWeek } from "./types";

export type WaitlistSpeedupPlayer = {
  speedup_mon: number;
  speedup_tue: number;
  speedup_thu: number;
};

export type WaitlistPlayerInfo = WaitlistSpeedupPlayer & {
  name: string;
  alliance: string;
};

export type WaitlistPrefRow = {
  player_id: number;
  day_of_week: string;
  block_start_utc: number;
  applied_at?: string | null;
  players: WaitlistSpeedupPlayer | null;
};

export type WaitlistPrefRowWithInfo = Omit<WaitlistPrefRow, "players"> & {
  players: WaitlistPlayerInfo | null;
};

/** Candidate for day waitlist / promote / backfill (prefs that day, not assigned that day). */
export type DayWaitlistCandidate = {
  playerId: number;
  speedup: number;
  appliedAt: string;
  blocks: Set<number>;
};

/** UI row for Admin/Status waitlist lists. */
export type DayWaitlistEntry = {
  playerId: number;
  name: string;
  alliance: string;
  speedup: number;
  preferredBlocks: number[];
  appliedAt: string;
};

export function speedupForDay(
  player: WaitlistSpeedupPlayer | null | undefined,
  day: DayOfWeek
): number {
  if (!player) return 0;
  if (day === "mon") return player.speedup_mon;
  if (day === "tue") return player.speedup_tue;
  return player.speedup_thu;
}

/**
 * Shared waitlist definition: has preferences for `day` and is not assigned that day.
 * Does not require an `eliminated` reservation row.
 */
export function buildDayWaitlistCandidates(
  day: DayOfWeek,
  preferences: WaitlistPrefRow[],
  assignedPlayerIdsOnDay: Set<number>,
  fallbackAppliedAt: string
): Map<number, DayWaitlistCandidate> {
  const byPlayer = new Map<number, DayWaitlistCandidate>();

  for (const row of preferences) {
    if (row.day_of_week !== day) continue;
    if (assignedPlayerIdsOnDay.has(row.player_id)) continue;

    const appliedAt = row.applied_at ?? fallbackAppliedAt;
    const existing = byPlayer.get(row.player_id);
    if (existing) {
      existing.blocks.add(row.block_start_utc);
      if (new Date(appliedAt).getTime() < new Date(existing.appliedAt).getTime()) {
        existing.appliedAt = appliedAt;
      }
      continue;
    }

    byPlayer.set(row.player_id, {
      playerId: row.player_id,
      speedup: speedupForDay(row.players, day),
      appliedAt,
      blocks: new Set([row.block_start_utc]),
    });
  }

  return byPlayer;
}

export function sortWaitlistCandidates<
  T extends { speedup: number; appliedAt: string }
>(list: T[]): T[] {
  return list.sort((a, b) => {
    if (b.speedup !== a.speedup) return b.speedup - a.speedup;
    return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
  });
}

/** Prefs-based waitlist rows for UI (Admin / Status). Sorted by speedup desc. */
export function buildDayWaitlistEntries(
  day: DayOfWeek,
  preferences: WaitlistPrefRowWithInfo[],
  assignedPlayerIdsOnDay: Set<number>,
  fallbackAppliedAt = "1970-01-01T00:00:00.000Z"
): DayWaitlistEntry[] {
  const candidates = buildDayWaitlistCandidates(
    day,
    preferences,
    assignedPlayerIdsOnDay,
    fallbackAppliedAt
  );
  const infoByPlayer = new Map<number, WaitlistPlayerInfo | null>();
  for (const row of preferences) {
    if (row.day_of_week !== day) continue;
    if (!infoByPlayer.has(row.player_id)) {
      infoByPlayer.set(row.player_id, row.players);
    }
  }

  return sortWaitlistCandidates(
    Array.from(candidates.values()).map((c) => {
      const info = infoByPlayer.get(c.playerId);
      return {
        playerId: c.playerId,
        name: info?.name ?? "(data error)",
        alliance: info?.alliance ?? "(data error)",
        speedup: c.speedup,
        preferredBlocks: Array.from(c.blocks).sort((a, b) => a - b),
        appliedAt: c.appliedAt,
      };
    })
  );
}
