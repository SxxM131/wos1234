"use client";

import { useEffect, useState, useCallback } from "react";
import { createAnonClient, fetchAllPages } from "@/lib/supabase";
import { DayOfWeek, DAY_CONFIG, TIME_BLOCKS } from "@/lib/types";
import { DayTabs } from "@/components/DayTabs";
import { formatSlotTime, formatBlockRange } from "@/lib/utils";
import {
  buildDayWaitlistEntries,
  type WaitlistPrefRowWithInfo,
} from "@/lib/waitlist";

interface SlotData {
  id: number;
  day_of_week: DayOfWeek;
  block_start_utc: number;
  slot_index: number;
  is_active: boolean;
}

interface ReservationData {
  slot_id: number;
  player_id: number;
  status: string;
  players: {
    name: string;
    alliance: string;
    speedup_mon: number;
    speedup_tue: number;
    speedup_thu: number;
  };
  slots?: { day_of_week: DayOfWeek } | null;
}

interface PreferenceData {
  player_id: number;
  day_of_week: string;
  block_start_utc: number;
  players: {
    name: string;
    alliance: string;
    speedup_mon: number;
    speedup_tue: number;
    speedup_thu: number;
  } | null;
}

interface Props {
  initialSlots: SlotData[];
  initialReservations: ReservationData[];
  initialPreferences: PreferenceData[];
  reservationOpen: boolean;
  cycleId: number;
  assignmentPending: boolean;
}

export function StatusView({
  initialSlots,
  initialReservations,
  initialPreferences,
  reservationOpen,
  cycleId,
  assignmentPending,
}: Props) {
  const [day, setDay] = useState<DayOfWeek>("mon");
  const [slots] = useState(initialSlots);
  const [reservations, setReservations] = useState(initialReservations);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [closed, setClosed] = useState(!reservationOpen);

  const refresh = useCallback(async () => {
    const supabase = createAnonClient();
    const { data: openData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "reservation_open")
      .single();
    setClosed(openData?.value === "false");

    const { data: resData } = await supabase
      .from("reservations")
      .select(
        "slot_id, player_id, status, players(name, alliance, speedup_mon, speedup_tue, speedup_thu), slots(day_of_week)"
      )
      .eq("cycle_id", cycleId)
      .eq("status", "assigned");

    if (resData) setReservations(resData as unknown as ReservationData[]);

    const { data: prefData, error: prefError } = await fetchAllPages(
      async (from, to) =>
        await supabase
          .from("preferences")
          .select(
            "player_id, day_of_week, block_start_utc, players(name, alliance, speedup_mon, speedup_tue, speedup_thu)"
          )
          .eq("cycle_id", cycleId)
          .order("player_id")
          .order("day_of_week")
          .order("block_start_utc")
          .range(from, to)
    );
    if (!prefError) {
      setPreferences((prefData ?? []) as unknown as PreferenceData[]);
    }
  }, [cycleId]);

  useEffect(() => {
    refresh();

    const supabase = createAnonClient();
    const channel = supabase
      .channel("reservations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const daySlots = slots.filter((s) => s.day_of_week === day);
  const config = DAY_CONFIG[day];

  const resBySlot = new Map<number, ReservationData>();
  reservations.forEach((r) => {
    if (r.slot_id) resBySlot.set(r.slot_id, r);
  });

  const slotDayById = new Map(slots.map((s) => [s.id, s.day_of_week]));
  const assignedPlayerIdsOnDay = new Set(
    reservations
      .filter((r) => slotDayById.get(r.slot_id) === day)
      .map((r) => r.player_id)
  );

  const dayWaitlist = assignmentPending
    ? []
    : buildDayWaitlistEntries(
        day,
        preferences as WaitlistPrefRowWithInfo[],
        assignedPlayerIdsOnDay
      );

  return (
    <div>
      {closed && (
        <div className="banner-closed mb-4">Secret URL applications closed</div>
      )}

      {assignmentPending && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">
          Assignment results are not published yet. The schedule below will
          update after the admin runs batch assignment.
        </div>
      )}

      <h1 className="mb-3 text-xl font-bold text-brand-900">Schedule (UTC)</h1>

      <DayTabs active={day} onChange={setDay} />

      <div className="mt-4 flex flex-col gap-3">
        {TIME_BLOCKS.map((block) => {
          const blockSlots = daySlots
            .filter((s) => s.block_start_utc === block)
            .sort((a, b) => a.slot_index - b.slot_index);

          return (
            <div key={block} className="card !p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                {formatBlockRange(block)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {blockSlots.map((slot) => {
                  const res = resBySlot.get(slot.id);
                  const inactive = !slot.is_active;
                  return (
                    <div
                      key={slot.id}
                      className={`rounded-lg px-2 py-2 text-sm ${
                        inactive
                          ? "bg-slate-100 text-slate-400"
                          : res
                            ? "bg-brand-50 text-brand-900"
                            : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <p className="text-xs text-slate-500">
                        {formatSlotTime(block, slot.slot_index)}
                      </p>
                      {inactive ? (
                        <p className="font-medium">Inactive</p>
                      ) : res ? (
                        <>
                          <p className="font-medium truncate">
                            {res.players.name}
                          </p>
                          <p className="text-xs truncate text-slate-500">
                            {res.players.alliance}
                          </p>
                        </>
                      ) : (
                        <p>Available</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {dayWaitlist.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Waitlist ({config.office})
          </h2>
          <div className="flex flex-col gap-2">
            {dayWaitlist.map((e) => {
              const prefs = e.preferredBlocks
                .map((b) => formatBlockRange(b))
                .join(", ");
              return (
                <div key={e.playerId} className="card !py-2 text-sm">
                  <p className="font-medium">
                    {e.name}{" "}
                    <span className="text-slate-500">({e.alliance})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {day === "mon"
                      ? "Monday Speedup"
                      : day === "tue"
                        ? "Tuesday Speedup"
                        : "Thursday Speedup"}
                    : {e.speedup}d · Preferred {prefs || "-"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
