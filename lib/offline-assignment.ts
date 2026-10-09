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
import { TIME_BLOCKS, type DayOfWeek, type OfficeType } from "./types";

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

export function runOfflineAssignment(applicants: FormApplicant[]): {
  data: ExcelExportData;
  results: Record<DayOfWeek, OfflineDayResult>;
} {
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

    const applicantMap = new Map<number, BatchApplicant>();
    for (const a of applicants) {
      const dayPref = a.days.find((d) => d.dayOfWeek === day);
      if (!dayPref) continue;
      applicantMap.set(a.playerId, {
        playerId: a.playerId,
        speedup: dayPref.speedup,
        appliedAt: a.appliedAt,
        blocks: new Set(dayPref.preferredBlocks),
      });
    }

    const matching = solveDayAssignmentMCMF(applicantMap, daySlots);
    results[day] = {
      assigned: matching.size,
      waitlist: applicantMap.size - matching.size,
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
    ).map(waitlistExportRowToExcelRecord);

    days[exportDayLabel(d)] = { schedule, waitlist };
  }

  const assignedForSummary = Array.from(assignedBySlot.entries()).map(
    ([slotId, r]) => ({
      player_id: r.player_id,
      slot_id: slotId,
      players: r.players,
    })
  );

  return {
    data: {
      days,
      summary: allianceSummaryToExcelRows(
        buildAllianceSummaryByDay(slots, assignedForSummary)
      ),
    },
    results,
  };
}
