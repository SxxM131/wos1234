"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  regenerateToken,
  toggleReservationOpen,
  resetCycle,
  cancelReservation,
  exportExcelData,
  logoutAdmin,
  getAssignmentPreviewForAdmin,
  runFullBatchAssignment,
  deletePreferenceByDay,
} from "./actions";
import * as XLSX from "xlsx";
import { DAY_CONFIG, DayOfWeek, TIME_BLOCKS } from "@/lib/types";
import { dayLabel, formatSlotTime, formatBlockRange } from "@/lib/utils";
import { DayTabs } from "@/components/DayTabs";

interface ReservationRow {
  id: string;
  status: string;
  player_id: number;
  slot_id: number;
  players: {
    game_id: number;
    name: string;
    alliance: string;
    speedup_mon: number;
    speedup_tue: number;
    speedup_thu: number;
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

interface ApplicantRow {
  player_id: number;
  players: ReservationRow["players"];
  preferences: { day_of_week: string; block_start_utc: number }[];
}

interface Props {
  reservations: ReservationRow[];
  eliminated: {
    id: string;
    player_id: number;
    players: ReservationRow["players"];
    preferences: { day_of_week: string; block_start_utc: number }[];
  }[];
  applicants: ApplicantRow[];
  assignmentPublished: boolean;
  slots: SlotRow[];
  accessToken: string;
  reservationOpen: boolean;
  cycleId: number;
  baseUrl: string;
}

export function AdminDashboard({
  reservations,
  eliminated,
  applicants,
  assignmentPublished,
  slots,
  accessToken,
  reservationOpen,
  cycleId,
  baseUrl,
}: Props) {
  const [token, setToken] = useState(accessToken);
  const [open, setOpen] = useState(reservationOpen);
  const [activeDay, setActiveDay] = useState<DayOfWeek>("mon");
  const [searchTerm, setSearchTerm] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [assignPending, startAssignTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");
  const router = useRouter();
  const [assignPreview, setAssignPreview] = useState<{
    applicants: { mon: number; tue: number; thu: number };
    lastRun: string | null;
    cycleId: number;
  } | null>(null);
  const [assignResult, setAssignResult] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deletingPref, setDeletingPref] = useState<string | null>(null); // "playerId-day"

  const loadAssignPreview = useCallback(() => {
    startAssignTransition(async () => {
      try {
        setAssignPreview(await getAssignmentPreviewForAdmin());
        setAssignError(null);
      } catch {
        setAssignError("Could not load assignment status.");
      }
    });
  }, []);

  useEffect(() => {
    loadAssignPreview();
  }, [loadAssignPreview]);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCancelReservation = useCallback(
    async (id: string, playerName: string) => {
      if (!confirm(`Cancel ${playerName}'s reservation?`)) return;
      setCancellingId(id);
      try {
        await cancelReservation(id);
        showToast("success", "Cancelled. Waitlisted players will be promoted automatically.");
        router.refresh();
      } catch {
        showToast("error", "Cancellation failed. Please try again.");
      } finally {
        setCancellingId(null);
      }
    },
    [showToast, router]
  );

  function handleRunFullAssignment() {
    if (
      !confirm(
        "Run full batch assignment for Mon/Tue/Thu? Existing assignments for this cycle will be replaced."
      )
    ) {
      return;
    }
    setAssignResult(null);
    setAssignError(null);
    startAssignTransition(async () => {
      try {
        const data = await runFullBatchAssignment();
        if (!data.success) {
          setAssignError("Assignment failed.");
          return;
        }
        setAssignResult(
          `Done — Mon ${data.mon.assigned}/${data.mon.eliminated} waitlist · Tue ${data.tue.assigned}/${data.tue.eliminated} · Thu ${data.thu.assigned}/${data.thu.eliminated}`
        );
        setAssignPreview(await getAssignmentPreviewForAdmin());
        router.refresh();
      } catch {
        setAssignError("Assignment failed.");
      }
    });
  }
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

  const speedupKey = DAY_CONFIG[activeDay].speedupKey;

  // Waitlist = has prefs this day, not already assigned this day
  const dayEliminated = eliminated
    .filter(
      (e) =>
        e.preferences?.some(
          (p) => (p as { day_of_week?: string }).day_of_week === activeDay
        ) && !assignedPlayerIdsOnDay.has(e.player_id)
    )
    .sort(
      (a, b) => (b.players?.[speedupKey] ?? 0) - (a.players?.[speedupKey] ?? 0)
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

  const dayApplicants = applicants
    .filter((a) =>
      a.preferences.some((p) => p.day_of_week === activeDay)
    )
    .sort(
      (a, b) =>
        (b.players?.[speedupKey] ?? 0) - (a.players?.[speedupKey] ?? 0)
    );

  const searchResultsApplicants = applicants.filter((a) => {
    if (!term || !a.players) return false;
    const nameMatch = a.players.name?.toLowerCase().includes(term);
    const allianceMatch = a.players.alliance?.toLowerCase().includes(term);
    const idMatch = String(a.players.game_id ?? "").includes(term);
    return nameMatch || allianceMatch || idMatch;
  });

  const showGrid = assignmentPublished || !!assignPreview?.lastRun;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/guide"
            className="text-sm text-slate-500 underline"
          >
            How to use
          </Link>
          <form action={logoutAdmin}>
            <button type="submit" className="text-sm text-slate-500 underline">
              Log out
            </button>
          </form>
        </div>
      </div>

      {!open && <div className="banner-closed">Reservations closed</div>}

      <div className="card text-sm">
        <p>
          Cycle <strong>#{cycleId}</strong>
          {open ? (
            <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              Open
            </span>
          ) : (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
              Closed
            </span>
          )}
        </p>
      </div>

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
              const blob = new Blob([wbout], {
                type: "application/octet-stream",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const today = new Date();
              const formattedDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
              a.download = `reservation_cycle${cycleId}_${formattedDate}.xlsx`;
              a.click();
            })
          }
        >
          Export Excel
        </button>
      </div>

      <div className="card border-red-200">
        <p className="mb-2 text-sm font-medium text-red-700">Reset cycle</p>
        <p className="mb-2 text-xs text-slate-500">
          Clears all players, applications, and assignments, then starts a new
          cycle. Type RESET below to confirm.
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
                setMessage(res.message ?? `Cycle reset to #${res.cycleId}.`);
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

      <section
        id="run-full-assignment"
        className="rounded-2xl border-4 border-amber-500 bg-amber-50 p-4 shadow-md"
        aria-label="Run full assignment"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            Run full assignment
          </h2>
          <span className="rounded-full bg-brand-700 px-2.5 py-1 text-xs font-bold text-white">
            R4+ only
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Close reservations and verify speedups first. Assigns all applicants
          for this cycle (Mon → Tue → Thu). Re-run replaces current assignments.
        </p>
        {assignPreview && (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Cycle <strong>#{assignPreview.cycleId}</strong> · Applicants: Mon{" "}
              {assignPreview.applicants.mon} · Tue {assignPreview.applicants.tue}{" "}
              · Thu {assignPreview.applicants.thu}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {assignPreview.lastRun
                ? `Last run: ${new Date(assignPreview.lastRun).toLocaleString()}`
                : "Not run yet for this cycle"}
            </p>
          </>
        )}
        <button
          type="button"
          className="btn-gold mt-4 w-full min-h-[52px] text-base font-bold"
          disabled={assignPending}
          onClick={handleRunFullAssignment}
        >
          {assignPending ? "Running assignment…" : "Run full assignment"}
        </button>
        {assignResult && (
          <p className="mt-3 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-900">
            {assignResult}
          </p>
        )}
        {assignError && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
            {assignError}
          </p>
        )}
      </section>

      {!showGrid && (
        <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Assignment has not been run yet. Review applicants below, then use{" "}
          <strong>Run full assignment</strong> to fill the schedule and waitlist.
        </div>
      )}

      {/* Search Bar */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-bold text-slate-700">
          {showGrid ? "Search Reservations" : "Search Applicants"}
        </label>
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
            Search Results (
            {showGrid
              ? searchResultsRes.length + searchResultsElim.length
              : searchResultsApplicants.length}
            )
          </h2>
          {!showGrid ? (
            searchResultsApplicants.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No matches found.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {searchResultsApplicants.map((a) => {
                  const dayOrder = ["mon", "tue", "thu"];
                  const appliedDays = Array.from(
                    new Set(a.preferences.map((p) => p.day_of_week))
                  ).sort((x, y) => dayOrder.indexOf(x) - dayOrder.indexOf(y)) as string[];

                  return (
                    <div
                      key={a.player_id}
                      className="border-b border-slate-100 pb-2.5 text-sm last:border-b-0 last:pb-0"
                    >
                      <p className="font-semibold text-slate-900">
                        {a.players?.name ?? "Unknown"}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          ({a.players?.alliance ?? "?"}) · ID{" "}
                          {a.players?.game_id ?? "?"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Mon {a.players?.speedup_mon ?? 0}d · Tue{" "}
                        {a.players?.speedup_tue ?? 0}d · Thu{" "}
                        {a.players?.speedup_thu ?? 0}d
                      </p>
                      {/* Day-level delete buttons (pre-assignment only) */}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {appliedDays.map((day) => {
                          const prefKey = `${a.player_id}-${day}`;
                          const isDeleting = deletingPref === prefKey;
                          return (
                            <button
                              key={day}
                              type="button"
                              disabled={isDeleting}
                              className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 font-medium transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                              onClick={async () => {
                                if (!confirm(`Delete ${a.players?.name ?? "this player"}'s ${day.toUpperCase()} application?`)) return;
                                setDeletingPref(prefKey);
                                try {
                                  const result = await deletePreferenceByDay(a.player_id, day, cycleId);
                                  if (result.success) {
                                    showToast("success", `${day.toUpperCase()} application deleted.`);
                                    router.refresh();
                                  } else {
                                    showToast("error", result.error ?? "Deletion failed. Please try again.");
                                  }
                                } catch {
                                  showToast("error", "An error occurred while deleting.");
                                } finally {
                                  setDeletingPref(null);
                                }
                              }}
                            >
                              {isDeleting ? (
                                <>
                                  <svg className="animate-spin h-3 w-3 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                  </svg>
                                  Deleting…
                                </>
                              ) : `Delete ${day}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : searchResultsRes.length === 0 && searchResultsElim.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No matches found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {searchResultsRes.map((r) => {
                const config = DAY_CONFIG[r.slots.day_of_week as DayOfWeek];
                const speedup = r.players
                  ? r.players[config?.speedupKey] ?? 0
                  : 0;
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
                          r.slots.slot_index
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
                        disabled={cancellingId === r.id}
                        className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 font-medium transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                        onClick={() => handleCancelReservation(r.id, r.players?.name ?? "Unknown")}
                      >
                        {cancellingId === r.id ? (
                          <>
                            <svg className="animate-spin h-3 w-3 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Cancelling…
                          </>
                        ) : "Cancel"}
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
                      Status: Waitlist (Mon: {e.players?.speedup_mon ?? 0}d / Tue:{" "}
                      {e.players?.speedup_tue ?? 0}d / Thu:{" "}
                      {e.players?.speedup_thu ?? 0}d)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!showGrid ? (
        <div className="mt-2">
          <h2 className="mb-3 text-sm font-bold text-slate-800">
            Applicants ({DAY_CONFIG[activeDay].office}) — {dayApplicants.length}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Applications only (preferences). Schedule slots stay empty until you
            run full assignment.
          </p>
          <DayTabs active={activeDay} onChange={setActiveDay} />
          <div className="mt-4 flex flex-col gap-2">
            {dayApplicants.length === 0 ? (
              <p className="text-sm italic text-slate-500">
                No applicants for this day.
              </p>
            ) : (
              dayApplicants.map((a) => {
                const prefs = Array.from(
                  new Set(
                    a.preferences
                      .filter((p) => p.day_of_week === activeDay)
                      .map((p) => p.block_start_utc)
                  )
                )
                  .sort((x, y) => x - y)
                  .map((b) => formatBlockRange(b))
                  .join(", ");
                return (
                  <div key={a.player_id} className="card !px-3 !py-2.5 text-sm">
                    <p className="font-semibold text-slate-900">
                      {a.players?.name ?? "Unknown"}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({a.players?.alliance ?? "?"}) · ID{" "}
                        {a.players?.game_id ?? "?"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Speedup {a.players?.[speedupKey] ?? 0}d · Preferred{" "}
                      {prefs || "—"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2">
            <h2 className="mb-3 text-sm font-bold text-slate-800">
              Schedule Grid (UTC)
            </h2>

            <DayTabs active={activeDay} onChange={setActiveDay} />

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
                              {formatSlotTime(block, slot.slot_index)}
                            </span>
                            {res && res.players && (
                              <span className="text-[9px] bg-brand-100 px-1 py-0.5 rounded text-brand-800 font-medium">
                                SU{" "}
                                {res.players[DAY_CONFIG[activeDay].speedupKey]}
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
                            disabled={cancellingId === res.id}
                            className="mt-3 w-full rounded bg-red-50 hover:bg-red-100 border border-red-200 py-1 text-[11px] text-red-600 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                            onClick={() => handleCancelReservation(res.id, res.players?.name ?? "Unknown")}
                          >
                            {cancellingId === res.id ? (
                              <>
                                <svg className="animate-spin h-3 w-3 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Cancelling…
                              </>
                            ) : "Cancel"}
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

          {dayEliminated.length > 0 && (
            <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Waitlist ({DAY_CONFIG[activeDay].office})
          </h2>
          <div className="flex flex-col gap-2">
            {dayEliminated.map((e, i) => {
              const speedup = e.players
                ? e.players[DAY_CONFIG[activeDay].speedupKey] ?? 0
                : 0;
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
                .map((b) => formatBlockRange(b))
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
        </>
      )}
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl transition-all animate-fade-in ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.type === "success" ? (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
