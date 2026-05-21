"use client";

import { useState, useTransition } from "react";
import { checkReservation } from "../actions";
import { DAY_CONFIG, DayOfWeek } from "@/lib/types";
import { dayLabel, formatBlockRange, formatSlotTime } from "@/lib/utils";

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

export function CheckForm() {
  const [result, setResult] = useState<{
    player: Player;
    reservations: ReservationRow[];
    preferences: { day_of_week: DayOfWeek; block_start_utc: number }[];
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
          preferences: res.preferences as { day_of_week: DayOfWeek; block_start_utc: number }[],
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
        스피드업 보유량에 따라 최종 배정이 변경될 수 있습니다. 관리자가 수동으로
        검토 후 조정할 수 있습니다.
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-600">게임 ID</label>
        <input
          name="game_id"
          type="number"
          required
          className="input-field"
          placeholder="게임 ID 입력"
        />
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "조회 중..." : "예약 조회"}
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
              VP 스피드업: {result.player.speedup_vp}일 · MO 스피드업:{" "}
              {result.player.speedup_mo}일
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

          {result.reservations.length === 0 ? (
            <p className="text-center text-sm text-slate-500">
              현재 사이클 예약이 없습니다.
            </p>
          ) : (
            result.reservations.map((r, i) => (
              <div key={i} className="card">
                {r.status === "assigned" && r.slots ? (
                  <>
                    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      배정 완료
                    </span>
                    <p className="mt-2 font-medium">
                      {dayLabel(r.slots.day_of_week)} ({r.slots.office_type})
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatSlotTime(
                        r.slots.block_start_utc,
                        r.slots.slot_index,
                        tz
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      배정 대기
                    </span>
                    <p className="mt-2 text-sm text-slate-600">
                      현재 배정 대기 중입니다. 다른 예약자 취소 시 자동 승격될 수
                      있습니다.
                    </p>
                    {result.preferences.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        선호:{" "}
                        {result.preferences
                          .map(
                            (p) =>
                              `${dayLabel(p.day_of_week)} ${formatBlockRange(p.block_start_utc, tz)}`
                          )
                          .join(", ")}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
