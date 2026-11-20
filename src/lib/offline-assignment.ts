import {
  solveDayAssignmentMCMF,
  type BatchApplicant,
  type DaySlotRow,
} from "./assignment";
import {
  allianceSummaryToExcelRows,
  buildAllianceSummaryByDay,
  buildDayWaitlistRows,
  buildSlotExportRow,
  EXPORT_DAY_ORDER,
  exportDayLabel,
  slotExportRowToExcelRecord,
  waitlistExportRowToExcelRecord,
  type ExcelExportData,
} from "./export-grid";
import type { FormApplicant } from "./parse-google-form-excel";
import {
  TIME_BLOCKS,
  type AssignmentMode,
  type DayOfWeek,
  type OfficeType,
} from "./types";
import { formatBlockRange } from "./utils";

export type SlotRecord = {
  id: number;
  day_of_week: DayOfWeek;
  office_type: OfficeType;
  block_start_utc: number;
  slot_index: number;
  is_active: boolean;
};

export type OfflineDayResult = {
  assigned: number;
  waitlist: number;
};

export const V2_TUE_ONLY_TITLE = "Tuesday only (no Monday blocks)";

/** v2: this submission's Mon + Tue speedup (see `FormApplicant.v2Speedup`). */
export function v2CombinedSpeedup(a: FormApplicant): number {
  return (a.v2Speedup?.mon ?? 0) + (a.v2Speedup?.tue ?? 0);
}

/** v2 display text, e.g. "100+200=300" (blank cells shown as 0). */
export function v2CombinedText(a: FormApplicant): string {
  const mon = a.v2Speedup?.mon ?? 0;
  const tue = a.v2Speedup?.tue ?? 0;
  return `${mon}+${tue}=${mon + tue}`;
}

/** v2 Monday rank: combined desc → appliedAt asc → player_id asc. */
export function compareV2MondayApplicants(
  a: BatchApplicant,
  b: BatchApplicant
): number {
  if (b.speedup !== a.speedup) return b.speedup - a.speedup;
  const t = new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
  if (t !== 0) return t;
  return a.playerId - b.playerId;
}

/**
 * Speedup used to rank `a` on `day`. The only place v1 and v2 differ:
 * v2 ranks Monday by combined Mon + Tue speedup.
 * Blank speedup that day (`speedupMissing`) is always 0.
 */
export function assignmentSpeedup(
  a: FormApplicant,
  day: DayOfWeek,
  mode: AssignmentMode
): number {
  const dayPref = a.days.find((d) => d.dayOfWeek === day);
  if (dayPref?.speedupMissing) return 0;
  if (mode === "v2" && day === "mon") return v2CombinedSpeedup(a);
  return dayPref?.speedup ?? 0;
}

/** Blocks chosen on `day` but speedup cell left blank. */
export function isSpeedupMissing(a: FormApplicant, day: DayOfWeek): boolean {
  return a.days.some((d) => d.dayOfWeek === day && d.speedupMissing);
}

/** Blank-speedup rank: appliedAt asc → player_id asc. */
function compareByAppliedAt(a: BatchApplicant, b: BatchApplicant): number {
  const t = new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
  if (t !== 0) return t;
  return a.playerId - b.playerId;
}

/** Same slot grid as `supabase/schema.sql` INSERT INTO slots. */
export function buildDefaultSlots(): SlotRecord[] {
  const days: { day: DayOfWeek; office: OfficeType }[] = [
    { day: "mon", office: "VP" },
    { day: "tue", office: "VP" },
    { day: "thu", office: "MO" },
  ];
  const slots: SlotRecord[] = [];
  let id = 1;
  for (const { day, office } of days) {
    for (const bs of TIME_BLOCKS) {
      for (let si = 0; si < 4; si++) {
        slots.push({
          id: id++,
          day_of_week: day,
          office_type: office,
          block_start_utc: bs,
          slot_index: si,
          is_active: true,
        });
      }
    }
  }
  return slots;
}

export function runOfflineAssignment(
  applicants: FormApplicant[],
  options?: { mode?: AssignmentMode }
): {
  data: ExcelExportData;
  results: Record<DayOfWeek, OfflineDayResult>;
  slots: SlotRecord[];
  assignments: { player_id: number; slot_id: number }[];
} {
  const mode = options?.mode ?? "v1";
  const slots = buildDefaultSlots();
  const assignedBySlot = new Map<
    number,
    {
      player_id: number;
      status: "assigned";
      players: {
        player_id: number;
        name: string;
        alliance: string;
        speedup_mon: number;
        speedup_tue: number;
        speedup_thu: number;
      };
    }
  >();

  const playerById = new Map(
    applicants.map((a) => {
      const speedup = { speedup_mon: 0, speedup_tue: 0, speedup_thu: 0 };
      for (const d of a.days) {
        if (d.dayOfWeek === "mon") speedup.speedup_mon = d.speedup;
        else if (d.dayOfWeek === "tue") speedup.speedup_tue = d.speedup;
        else speedup.speedup_thu = d.speedup;
      }
      return [
        a.playerId,
        {
          player_id: a.playerId,
          name: a.name,
          alliance: a.alliance,
          ...speedup,
        },
      ];
    })
  );

  const results = {
    mon: { assigned: 0, waitlist: 0 },
    tue: { assigned: 0, waitlist: 0 },
    thu: { assigned: 0, waitlist: 0 },
  } as Record<DayOfWeek, OfflineDayResult>;

  for (const day of EXPORT_DAY_ORDER) {
    const daySlots: DaySlotRow[] = slots
      .filter((s) => s.day_of_week === day && s.is_active)
      .map((s) => ({
        id: s.id,
        block_start_utc: s.block_start_utc,
        slot_index: s.slot_index,
      }));

    // Blank speedup that day → separate pool, only offered leftover slots
    const applicantMap = new Map<number, BatchApplicant>();
    const missingSpeedupPool: BatchApplicant[] = [];
    for (const a of applicants) {
      const dayPref = a.days.find((d) => d.dayOfWeek === day);
      if (!dayPref) continue;
      const candidate = {
        playerId: a.playerId,
        speedup: assignmentSpeedup(a, day, mode),
        appliedAt: a.appliedAt,
        blocks: new Set(dayPref.preferredBlocks),
      };
      if (dayPref.speedupMissing) missingSpeedupPool.push(candidate);
      else applicantMap.set(a.playerId, candidate);
    }

    // v2 Monday: explicit total order, and candidates fed to MCMF in rank
    // order so slot positions do not depend on form row order either.
    const matching =
      mode === "v2" && day === "mon"
        ? solveDayAssignmentMCMF(
            new Map(
              Array.from(applicantMap.values())
                .sort(compareV2MondayApplicants)
                .map((x) => [x.playerId, x])
            ),
            daySlots,
            undefined,
            compareV2MondayApplicants
          )
        : solveDayAssignmentMCMF(applicantMap, daySlots);

    const usedSlotIds = new Set(matching.values());
    const leftoverMatching = solveDayAssignmentMCMF(
      new Map(
        missingSpeedupPool
          .sort(compareByAppliedAt)
          .map((x) => [x.playerId, x])
      ),
      daySlots.filter((s) => !usedSlotIds.has(s.id)),
      undefined,
      compareByAppliedAt
    );
    for (const [playerId, slotId] of Array.from(leftoverMatching)) {
      matching.set(playerId, slotId);
    }

    results[day] = {
      assigned: matching.size,
      waitlist: applicantMap.size + missingSpeedupPool.length - matching.size,
    };

    for (const [playerId, slotId] of matching) {
      const p = playerById.get(playerId);
      if (!p) continue;
      assignedBySlot.set(slotId, {
        player_id: playerId,
        status: "assigned",
        players: p,
      });
    }
  }

  const prefsForWaitlist = applicants.flatMap((a) => {
    const p = playerById.get(a.playerId)!;
    return a.days.flatMap((d) =>
      Array.from(new Set(d.preferredBlocks)).map((block) => ({
        player_id: a.playerId,
        day_of_week: d.dayOfWeek,
        block_start_utc: block,
        players: p,
      }))
    );
  });

  const assignedByDay = new Map<DayOfWeek, Set<number>>();
  for (const d of EXPORT_DAY_ORDER) assignedByDay.set(d, new Set());
  const slotDayById = new Map(slots.map((s) => [s.id, s.day_of_week]));
  for (const [slotId, r] of assignedBySlot) {
    const day = slotDayById.get(slotId);
    if (!day) continue;
    assignedByDay.get(day)!.add(r.player_id);
  }

  const byId = new Map(applicants.map((a) => [a.playerId, a]));
  const missingIdsByDay = new Map(
    EXPORT_DAY_ORDER.map((d) => [
      d,
      applicants.filter((a) => isSpeedupMissing(a, d)).map((a) => a.playerId),
    ])
  );
  // Waitlist order kept, except blank-speedup rows go last (appliedAt asc)
  const missingLast =
    (day: DayOfWeek) =>
    (a: Record<string, string | number>, b: Record<string, string | number>) => {
      const pa = byId.get(Number(a["Player ID"]));
      const pb = byId.get(Number(b["Player ID"]));
      const ma = pa ? isSpeedupMissing(pa, day) : false;
      const mb = pb ? isSpeedupMissing(pb, day) : false;
      if (ma !== mb) return ma ? 1 : -1;
      if (!ma || !pa || !pb) return 0;
      const t = new Date(pa.appliedAt).getTime() - new Date(pb.appliedAt).getTime();
      return t || pa.playerId - pb.playerId;
    };

  const days: ExcelExportData["days"] = {};
  for (const d of EXPORT_DAY_ORDER) {
    const daySlots = slots
      .filter((s) => s.day_of_week === d)
      .sort((a, b) =>
        a.block_start_utc !== b.block_start_utc
          ? a.block_start_utc - b.block_start_utc
          : a.slot_index - b.slot_index
      );

    const schedule = daySlots.map((s) => {
      const r = assignedBySlot.get(s.id);
      const row = buildSlotExportRow(s, r);
      return slotExportRowToExcelRecord(row);
    });

    const waitlist = buildDayWaitlistRows(
      d,
      prefsForWaitlist,
      assignedByDay.get(d) ?? new Set()
    )
      .map(waitlistExportRowToExcelRecord)
      .sort(missingLast(d));

    days[exportDayLabel(d)] = {
      schedule,
      waitlist,
      missingSpeedupPlayerIds: missingIdsByDay.get(d),
    };
  }

  if (mode === "v2") {
    const monLabel = exportDayLabel("mon");
    const mon = days[monLabel];
    const combinedOf = (r: Record<string, string | number>) =>
      byId.get(Number(r["Player ID"]));
    // Speedup cell → "mon+tue=combined" text (empty slots stay blank)
    const withCombinedText = (r: Record<string, string | number>) => {
      const a = r["Player ID"] === "" ? undefined : combinedOf(r);
      return a ? { ...r, "Speedup (days)": v2CombinedText(a) } : r;
    };
    const combinedNum = (r: Record<string, string | number>) => {
      const a = combinedOf(r);
      return a ? v2CombinedSpeedup(a) : 0;
    };

    // Not in Monday competition: Tuesday blocks but no Monday blocks
    const tueSlotById = new Map(
      slots.filter((s) => s.day_of_week === "tue").map((s) => [s.id, s])
    );
    const tueSlotByPlayer = new Map<number, SlotRecord>();
    for (const [slotId, r] of Array.from(assignedBySlot.entries())) {
      const s = tueSlotById.get(slotId);
      if (s) tueSlotByPlayer.set(r.player_id, s);
    }
    const tueOnly = applicants
      .filter(
        (a) =>
          !a.days.some((d) => d.dayOfWeek === "mon") &&
          a.days.some((d) => d.dayOfWeek === "tue")
      )
      .sort(
        (a, b) =>
          v2CombinedSpeedup(b) - v2CombinedSpeedup(a) || a.playerId - b.playerId
      );

    days[monLabel] = {
      ...mon,
      schedule: mon.schedule.map(withCombinedText),
      waitlist: [...mon.waitlist]
        .sort(
          (a, b) =>
            missingLast("mon")(a, b) ||
            combinedNum(b) - combinedNum(a) ||
            Number(a["Player ID"]) - Number(b["Player ID"])
        )
        .map(withCombinedText),
      footer: {
        title: V2_TUE_ONLY_TITLE,
        missingSpeedupPlayerIds: tueOnly
          .filter((a) => isSpeedupMissing(a, "tue"))
          .map((a) => a.playerId),
        rows: tueOnly.map((a) => {
          const tue = a.days.find((d) => d.dayOfWeek === "tue")!;
          const slot = tueSlotByPlayer.get(a.playerId);
          const slotRow = slot ? buildSlotExportRow(slot, undefined) : null;
          return {
            player_id: a.playerId,
            name: a.name,
            alliance: a.alliance,
            speedup_mon: a.v2Speedup?.mon ?? 0,
            speedup_tue: a.v2Speedup?.tue ?? 0,
            combined: v2CombinedText(a),
            "Tue preferred time (UTC)": Array.from(new Set(tue.preferredBlocks))
              .sort((x, y) => x - y)
              .map((b) => formatBlockRange(b).replace(/ UTC$/, ""))
              .join(", "),
            "Tue result": slotRow
              ? `assigned ${slotRow.slotStartUtc} (${slotRow.blockUtc})`
              : "waitlist",
          };
        }),
      },
    };
  }

  const assignedForSummary = Array.from(assignedBySlot.entries()).map(
    ([slotId, r]) => ({
      player_id: r.player_id,
      slot_id: slotId,
      players: r.players,
    })
  );

  let summary = allianceSummaryToExcelRows(
    buildAllianceSummaryByDay(slots, assignedForSummary)
  );
  if (mode === "v2") {
    // day1 Speedup = combined Mon + Tue; Total Speedup keeps each day's own
    // speedup (from `summary` above) so Tue is not counted twice.
    const combinedSummary = allianceSummaryToExcelRows(
      buildAllianceSummaryByDay(
        slots,
        assignedForSummary.map((r) => {
          const a = byId.get(r.player_id);
          return slotDayById.get(r.slot_id) === "mon" && a
            ? { ...r, players: { ...r.players, speedup_mon: v2CombinedSpeedup(a) } }
            : r;
        })
      )
    );
    const totalByAlliance = new Map(
      summary.map((row) => [row.Alliance, row["Total Speedup"]])
    );
    const from = `${exportDayLabel("mon")} Speedup`;
    const to = `${from} (v2: mon+tue)`;
    summary = combinedSummary.map((row) => ({
      ...Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k === from ? to : k, v])
      ),
      "Total Speedup": totalByAlliance.get(row.Alliance) ?? row["Total Speedup"],
      Note:
        row.Alliance === "Total"
          ? "day1에는 tue가 포함되어 있어 day1~day4의 합은 Total과 다름"
          : "",
    }));
  }

  return {
    data: {
      days,
      summary,
    },
    results,
    slots,
    assignments: Array.from(assignedBySlot.entries()).map(([slotId, r]) => ({
      player_id: r.player_id,
      slot_id: slotId,
    })),
  };
}
