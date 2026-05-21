"use client";

import { useState, useTransition, useEffect } from "react";
import {
  regenerateToken,
  toggleReservationOpen,
  resetCycle,
  cancelReservation,
  exportCsv,
  exportExcelData,
  logoutAdmin,
} from "./actions";
import * as XLSX from "xlsx";
import { DAY_CONFIG, DayOfWeek, TIME_BLOCKS } from "@/lib/types";
import { dayLabel, formatSlotTime, formatBlockRange } from "@/lib/utils";
import { DayTabs } from "@/components/DayTabs";
import { TimezoneToggle } from "@/components/TimezoneToggle";
import { AssignmentRunPanel } from "./AssignmentRunPanel";

interface ReservationRow {
  id: string;
  status: string;
  player_id: number;
  slot_id: number;
  players: {
    game_id: number;
    name: string;
    alliance: string;
    speedup_vp: number;
    speedup_mo: number;
  };
  slots: {
    id: number;
    day_of_week: DayOfWeek;
    block_start_utc: number;
    slot_index: number;
    office_type: string;
    is_active: boolean;
  };
}

interface SlotRow {
  id: number;
  day_of_week: DayOfWeek;
  block_start_utc: number;
  slot_index: number;
  office_type: string;
  is_active: boolean;
}

interface Props {
  reservations: ReservationRow[];
  eliminated: {
    id: string;
    player_id: number;
    players: ReservationRow["players"];
    preferences: { day_of_week: string; block_start_utc: number }[];
  }[];
  slots: SlotRow[];
  accessToken: string;
  reservationOpen: boolean;
  cycleId: number;
  baseUrl: string;
}

export function AdminDashboard({
  reservations,
  eliminated,
  slots,
  accessToken,
  reservationOpen,
  cycleId,
  baseUrl,
}: Props) {
  const [token, setToken] = useState(accessToken);
  const [open, setOpen] = useState(reservationOpen);
  const [activeDay, setActiveDay] = useState<DayOfWeek>("mon");
  const [tz, setTz] = useState<"UTC" | "KST">("UTC");
  const [searchTerm, setSearchTerm] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const currentOrigin = origin || baseUrl;
  const secretUrl = `${currentOrigin}/r/${token}`;

  // Filter reservations by slot_id and activeDay (for assigned ones)
  const daySlots = slots.filter((s) => s.day_of_week === activeDay);
  const resBySlot = new Map<number, ReservationRow>();
  reservations.forEach((r) => {
    if (r.slot_id && r.status === "assigned") {
      resBySlot.set(r.slot_id, r);
    }
  });

  const assignedPlayerIdsOnDay = new Set(
    reservations
      .filter(
        (r) =>
          r.status === "assigned" &&
          r.slots?.day_of_week === activeDay
      )
      .map((r) => r.player_id)
  );

  // Waitlist = has prefs this day, not already assigned this day
  const dayEliminated = eliminated.filter(
    (e) =>
      e.preferences?.some(
        (p) => (p as { day_of_week?: string }).day_of_week === activeDay
      ) && !assignedPlayerIdsOnDay.has(e.player_id)
  );

  // Search logic across all reservations and waitlist
  const term = searchTerm.trim().toLowerCase();
  const searchResultsRes = reservations.filter((r) => {
    if (!term || !r.players) return false;
    const nameMatch = r.players.name?.toLowerCase().includes(term);
    const allianceMatch = r.players.alliance?.toLowerCase().includes(term);
    const idMatch = String(r.players.game_id ?? "").includes(term);
    return nameMatch || allianceMatch || idMatch;
  });

  const searchResultsElim = eliminated.filter((e) => {
    if (!term || !e.players) return false;
    const nameMatch = e.players.name?.toLowerCase().includes(term);
    const allianceMatch = e.players.alliance?.toLowerCase().includes(term);
    const idMatch = String(e.players.game_id ?? "").includes(term);
    return nameMatch || allianceMatch || idMatch;
  });

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-slate-500 underline">
            Log out
          </button>
        </form>
      </div>

      {!open && <div className="banner-closed">Reservations closed</div>}

      <div className="card text-sm">
        <p>
          Cycle <strong>#{cycleId}</strong>
          {open ? (
            <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 font-semibold">
              Open
            </span>
          ) : (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 font-semibold">
              Closed
            </span>
          )}
        </p>
      </div>

      {/* Secret URL */}
      <div className="card">
        <p className="mb-2 text-sm font-medium">Secret URL</p>
        <p className="break-all text-xs text-slate-600">{secretUrl}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-secondary !min-h-0 flex-1 py-2 text-sm"
            onClick={() => navigator.clipboard.writeText(secretUrl)}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn-primary !min-h-0 flex-1 py-2 text-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await regenerateToken();
                setToken(res.token);
                setMessage("Token regenerated. Previous URLs are now invalid.");
              })
            }
          >
            Regenerate token
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-xl border py-3 text-sm font-medium transition ${
            open
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
          }`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await toggleReservationOpen();
              setOpen(res.open);
            })
          }
        >
          {open ? "Close reservations" : "Open reservations"}
        </button>
        <button
          type="button"
          className="btn-secondary !min-h-0 py-3 text-sm hover:bg-slate-100"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const data = await exportExcelData();
              const wb = XLSX.utils.book_new();

              Object.entries(data).forEach(([sheetName, rows]) => {
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
              });

              const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
              const blob = new Blob([wbout], { type: "application/octet-stream" });
              const url = URL.createObjectURL(blob);
              
              const a = document.createElement("a");
              a.href = url;
              const today = new Date();
              const yyyy = today.getFullYear();
              const mm = String(today.getMonth() + 1).padStart(2, "0");
              const dd = String(today.getDate()).padStart(2, "0");
              const formattedDate = `${yyyy}${mm}${dd}`;
              a.download = `reservation_cycle${cycleId}_${formattedDate}.xlsx`;
              a.click();
            })
          }
        >
          Export Excel
        </button>
      </div>

      <AssignmentRunPanel />

      {/* Reset */}
      <div className="card border-red-200">
        <p className="mb-2 text-sm font-medium text-red-700">Reset cycle</p>
        <p className="mb-2 text-xs text-slate-500">
          This cannot be undone. Type RESET below to confirm.
        </p>
        <input
          value={resetConfirm}
          onChange={(e) => setResetConfirm(e.target.value)}
          placeholder="RESET"
          className="input-field mb-2"
        />
        <button
          type="button"
          disabled={pending || resetConfirm !== "RESET"}
          className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-red-700 transition"
          onClick={() =>
            startTransition(async () => {
              const res = await resetCycle(resetConfirm);
              if (res.error) setMessage(res.error);
              else {
                setMessage(`Cycle reset to #${res.cycleId}.`);
                setResetConfirm("");
              }
            })
          }
        >
          Reset cycle
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {message}
        </div>
      )}

      <hr className="border-slate-200 my-2" />

      {/* Search Bar */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-bold text-slate-700">Search Reservations</label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by Game ID, name, or alliance..."
          className="input-field w-full"
        />
      </div>

      {/* Search Results */}
      {term && (
        <div className="card border-brand-200 bg-brand-50/20">
          <h2 className="mb-3 text-sm font-bold text-brand-900">
            Search Results ({searchResultsRes.length + searchResultsElim.length})
          </h2>
          {searchResultsRes.length === 0 && searchResultsElim.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No matches found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {searchResultsRes.map((r) => {
                const config = DAY_CONFIG[r.slots.day_of_week as DayOfWeek];
                const speedup =
                  config?.speedupKey === "speedup_vp"
                    ? r.players?.speedup_vp ?? 0
                    : r.players?.speedup_mo ?? 0;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-b-0 last:pb-0 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {r.players?.name ?? "Unknown"}{" "}
                        <span className="text-xs text-slate-500 font-normal">
                          ({r.players?.alliance ?? "Unknown"}) · ID: {r.players?.game_id ?? "Unknown"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {dayLabel(r.slots.day_of_week as DayOfWeek)} ·{" "}
                        {formatSlotTime(
                          r.slots.block_start_utc,
                          r.slots.slot_index,
                          tz
                        )}{" "}
                        · Speedup: {speedup}d · Status:{" "}
                        <span
                          className={`font-semibold ${
                            r.status === "assigned"
                              ? "text-green-600"
                              : r.status === "cancelled"
                                ? "text-red-500"
                                : "text-slate-400"
                          }`}
                        >
                          {r.status}
                        </span>
                      </p>
                    </div>
                    {r.status === "assigned" && (
                      <button
                        type="button"
                        className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 font-medium transition"
                        onClick={() => {
                          if (
                            confirm(`Cancel reservation for ${r.players?.name ?? "Unknown"}?`)
                          ) {
                            startTransition(() => cancelReservation(r.id));
                          }
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })}
              {searchResultsElim.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-b-0 last:pb-0 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {e.players?.name ?? "Unknown"}{" "}
                      <span className="text-xs text-slate-500 font-normal">
                        ({e.players?.alliance ?? "Unknown"}) · ID: {e.players?.game_id ?? "Unknown"}
                      </span>
                    </p>
                    <p className="text-xs text-amber-600 font-semibold mt-0.5">
                      Status: Waitlist (VP: {e.players?.speedup_vp ?? 0}d / MO:{" "}
                      {e.players?.speedup_mo ?? 0}d)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Table View */}
      <div className="mt-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Schedule Grid</h2>
          <TimezoneToggle tz={tz} onChange={setTz} />
        </div>

        <DayTabs active={activeDay} onChange={setActiveDay} />

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
                        className={`rounded-lg px-3 py-3 text-sm flex flex-col justify-between transition min-h-[110px] ${
                          inactive
                            ? "bg-slate-100 text-slate-400"
                            : res
                              ? "bg-brand-50 text-brand-900 border border-brand-200"
                              : "bg-slate-50 text-slate-400 border border-dashed border-slate-200"
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-semibold text-slate-500">
                              {formatSlotTime(block, slot.slot_index, tz)}
                            </span>
                            {res && res.players && (
                              <span className="text-[9px] bg-brand-100 px-1 py-0.5 rounded text-brand-800 font-medium">
                                SU{" "}
                                {slot.office_type === "VP"
                                  ? res.players.speedup_vp
                                  : res.players.speedup_mo}
                                d
                              </span>
                            )}
                          </div>
                          {inactive ? (
                            <p className="font-semibold mt-1">Inactive</p>
                          ) : res ? (
                            <>
                              <p className="font-bold truncate mt-1">
                                {res.players?.name ?? "Unknown"}
                              </p>
                              <p className="text-[11px] truncate text-slate-500">
                                {res.players?.alliance ?? "Unknown"} (ID: {res.players?.game_id ?? "Unknown"})
                              </p>
                            </>
                          ) : (
                            <p className="italic text-xs mt-1">Available</p>
                          )}
                        </div>
                        {res && (
                          <button
                            type="button"
                            className="mt-3 w-full rounded bg-red-50 hover:bg-red-100 border border-red-200 py-1 text-[11px] text-red-600 font-semibold transition"
                            onClick={() => {
                              if (
                                confirm(
                                  `Cancel reservation for ${res.players?.name ?? "Unknown"}?`
                                )
                              ) {
                                startTransition(() => cancelReservation(res.id));
                              }
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Waitlist (Eliminated) */}
      {dayEliminated.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Waitlist ({DAY_CONFIG[activeDay].office})
          </h2>
          <div className="flex flex-col gap-2">
            {dayEliminated.map((e, i) => {
              const speedup =
                DAY_CONFIG[activeDay].speedupKey === "speedup_vp"
                  ? e.players?.speedup_vp ?? 0
                  : e.players?.speedup_mo ?? 0;
              const prefs = Array.from(
                new Set(
                  e.preferences
                    ?.filter(
                      (p) =>
                        (p as { day_of_week?: string }).day_of_week ===
                        activeDay
                    )
                    .map((p) => p.block_start_utc) ?? []
                )
              )
                .sort((a, b) => a - b)
                .map((b) => formatBlockRange(b, tz))
                .join(", ");
              return (
                <div key={i} className="card !py-2.5 !px-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    {e.players?.name ?? "Unknown"}{" "}
                    <span className="text-xs text-slate-500 font-normal">
                      ({e.players?.alliance ?? "Unknown"}) · ID {e.players?.game_id ?? "Unknown"}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
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
