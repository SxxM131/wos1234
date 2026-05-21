"use client";

import { useEffect, useState, useCallback } from "react";
import { createAnonClient } from "@/lib/supabase";
import { DayOfWeek, DAY_CONFIG, TIME_BLOCKS } from "@/lib/types";
import { DayTabs } from "@/components/DayTabs";
import { TimezoneToggle } from "@/components/TimezoneToggle";
import { formatSlotTime, formatBlockRange } from "@/lib/utils";

interface SlotData {
  id: number;
  day_of_week: DayOfWeek;
  block_start_utc: number;
  slot_index: number;
  is_active: boolean;
}

interface ReservationData {
  slot_id: number;
  status: string;
  players: { name: string; alliance: string; speedup_vp: number; speedup_mo: number };
}

interface EliminatedData {
  player_id: number;
  players: {
    name: string;
    alliance: string;
    speedup_vp: number;
    speedup_mo: number;
  };
  preferences: { block_start_utc: number }[];
}

interface Props {
  initialSlots: SlotData[];
  initialReservations: ReservationData[];
  initialEliminated: EliminatedData[];
  reservationOpen: boolean;
  cycleId: number;
}

export function StatusView({
  initialSlots,
  initialReservations,
  initialEliminated,
  reservationOpen,
  cycleId,
}: Props) {
  const [day, setDay] = useState<DayOfWeek>("mon");
  const [tz, setTz] = useState<"UTC" | "KST">("UTC");
  const [slots, setSlots] = useState(initialSlots);
  const [reservations, setReservations] = useState(initialReservations);
  const [eliminated, setEliminated] = useState(initialEliminated);
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
      .select("slot_id, status, players(name, alliance, speedup_vp, speedup_mo)")
      .eq("cycle_id", cycleId)
      .eq("status", "assigned");

    if (resData) setReservations(resData as unknown as ReservationData[]);

    const { data: elimData } = await supabase
      .from("reservations")
      .select("player_id, players(name, alliance, speedup_vp, speedup_mo)")
      .eq("cycle_id", cycleId)
      .eq("status", "eliminated");

    if (elimData) {
      const withPrefs = await Promise.all(
        elimData.map(async (e) => {
          const { data: prefs } = await supabase
            .from("preferences")
            .select("block_start_utc, day_of_week")
            .eq("player_id", e.player_id)
            .eq("cycle_id", cycleId)
            .eq("day_of_week", day);
          return { ...e, preferences: prefs ?? [] };
        })
      );
      setEliminated(withPrefs as unknown as EliminatedData[]);
    }
  }, [cycleId, day]);

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

  const dayEliminated = eliminated.filter((e) =>
    e.preferences?.some(
      (p) => (p as { day_of_week?: string }).day_of_week === day
    )
  );

  return (
    <div>
      {closed && (
        <div className="banner-closed mb-4">Reservations closed</div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">Schedule</h1>
        <TimezoneToggle tz={tz} onChange={setTz} />
      </div>

      <DayTabs active={day} onChange={setDay} />

      <div className="mt-4 flex flex-col gap-3">
        {TIME_BLOCKS.map((block) => {
          const blockSlots = daySlots
            .filter((s) => s.block_start_utc === block)
            .sort((a, b) => a.slot_index - b.slot_index);

          return (
            <div key={block} className="card !p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                {formatBlockRange(block, tz)}
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
                        {formatSlotTime(block, slot.slot_index, tz)}
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

      {dayEliminated.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Waitlist ({config.office})
          </h2>
          <div className="flex flex-col gap-2">
            {dayEliminated.map((e, i) => {
              const speedup =
                config.speedupKey === "speedup_vp"
                  ? e.players.speedup_vp
                  : e.players.speedup_mo;
              const prefs = e.preferences
                ?.map((p) => formatBlockRange(p.block_start_utc, tz))
                .join(", ");
              return (
                <div key={i} className="card !py-2 text-sm">
                  <p className="font-medium">
                    {e.players.name}{" "}
                    <span className="text-slate-500">({e.players.alliance})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Speedup {speedup}d · Preferred {prefs || "-"}
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
