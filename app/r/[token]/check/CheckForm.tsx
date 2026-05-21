"use client";

import { useState, useTransition } from "react";
import { checkReservation } from "../actions";
import { DAY_CONFIG, DayOfWeek } from "@/lib/types";
import { dayLabel, formatBlockRange } from "@/lib/utils";
import { SUBMIT_SUCCESS_MESSAGE } from "@/lib/reservation-guard";

interface ReservationRow {
  status: string;
  slots: {
    day_of_week: DayOfWeek;
    block_start_utc: number;
    slot_index: number;
    office_type: string;
  } | null;
}

interface Player {
  game_id: number;
  name: string;
  alliance: string;
  speedup_vp: number;
  speedup_mo: number;
}

const CHECK_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export function CheckForm() {
  const [result, setResult] = useState<{
    player: Player;
    reservations: ReservationRow[];
    preferences: { day_of_week: DayOfWeek; block_start_utc: number }[];
    assignmentCompleted: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tz, setTz] = useState<"UTC" | "KST">("UTC");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const gameId = parseInt(
      new FormData(e.currentTarget).get("game_id") as string,
      10
    );
    startTransition(async () => {
      const res = await checkReservation(gameId);
      if ("error" in res && res.error) {
        setError(res.error);
        setResult(null);
      } else if ("player" in res && res.player) {
        setError(null);
        setResult({
          player: res.player,
          reservations: res.reservations as ReservationRow[],
          preferences: res.preferences as {
            day_of_week: DayOfWeek;
            block_start_utc: number;
          }[],
          assignmentCompleted: res.assignmentCompleted ?? false,
        });
      }
    });
  }

  function dayStatus(
    day: DayOfWeek,
    reservations: ReservationRow[],
    preferences: { day_of_week: DayOfWeek; block_start_utc: number }[],
    assignmentCompleted: boolean
  ) {
    const dayPrefs = preferences.filter((p) => p.day_of_week === day);
    if (!dayPrefs.length) return null;

    const assigned = reservations.find(
      (r) => r.status === "assigned" && r.slots?.day_of_week === day
    );

    if (assigned?.slots) {
      return {
        kind: "assigned" as const,
        block: assigned.slots.block_start_utc,
        office: assigned.slots.office_type,
      };
    }

    if (!assignmentCompleted) {
      return {
        kind: "pending" as const,
        prefs: Array.from(
          new Set(dayPrefs.map((p) => p.block_start_utc))
        ).sort((a, b) => a - b),
      };
    }

    return {
      kind: "waitlist" as const,
      prefs: Array.from(new Set(dayPrefs.map((p) => p.block_start_utc))).sort(
        (a, b) => a - b
      ),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Assignment results are published after the booking window closes and the
        admin runs batch assignment.
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-600">Game ID</label>
        <input
          name="game_id"
          type="number"
          required
          className="input-field"
          placeholder="Enter Game ID"
        />
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Looking up..." : "Check reservation"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="card">
            <p className="font-semibold">{result.player.name}</p>
            <p className="text-sm text-slate-500">
              {result.player.alliance} · ID {result.player.game_id}
            </p>
            <p className="mt-2 text-sm">
              VP Speedup: {result.player.speedup_vp}d · MO Speedup:{" "}
              {result.player.speedup_mo}d
            </p>
          </div>

          <div className="flex justify-end">
            <div className="inline-flex rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setTz("UTC")}
                className={`px-2 py-1 ${tz === "UTC" ? "bg-brand-600 text-white rounded-l-lg" : ""}`}
              >
                UTC
              </button>
              <button
                type="button"
                onClick={() => setTz("KST")}
                className={`px-2 py-1 ${tz === "KST" ? "bg-brand-600 text-white rounded-r-lg" : ""}`}
              >
                KST
              </button>
            </div>
          </div>

          {CHECK_DAYS.map((day) => {
            const status = dayStatus(
              day,
              result.reservations,
              result.preferences,
              result.assignmentCompleted
            );
            if (!status) return null;

            return (
              <div key={day} className="card">
                {status.kind === "assigned" ? (
                  <>
                    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Assigned
                    </span>
                    <p className="mt-2 font-medium">
                      {dayLabel(day)} ({DAY_CONFIG[day].office})
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatBlockRange(status.block, tz)}
                    </p>
                  </>
                ) : status.kind === "pending" ? (
                  <>
                    <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      Application received
                    </span>
                    <p className="mt-2 font-medium">
                      {dayLabel(day)} ({DAY_CONFIG[day].office})
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {SUBMIT_SUCCESS_MESSAGE}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Preferred:{" "}
                      {status.prefs
                        .map((b) => formatBlockRange(b, tz))
                        .join(", ")}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      On waitlist
                    </span>
                    <p className="mt-2 font-medium">
                      {dayLabel(day)} ({DAY_CONFIG[day].office})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Preferred:{" "}
                      {status.prefs
                        .map((b) => formatBlockRange(b, tz))
                        .join(", ")}
                    </p>
                  </>
                )}
              </div>
            );
          })}

          {CHECK_DAYS.every(
            (d) =>
              !dayStatus(
                d,
                result.reservations,
                result.preferences,
                result.assignmentCompleted
              )
          ) && (
            <p className="text-center text-sm text-slate-500">
              No applications in the current cycle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
