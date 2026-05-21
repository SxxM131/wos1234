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
  const [adminTab, setAdminTab] = useState<"settings" | "reservations">(
    "settings"
  );

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

      {!open && adminTab === "settings" && (
        <div className="banner-closed">예약 마감됨 — 신청 불가</div>
      )}

      <div className="flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
            adminTab === "settings"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => setAdminTab("settings")}
        >
          설정
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
            adminTab === "reservations"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => setAdminTab("reservations")}
        >
          예약 목록
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {message}
        </div>
      )}

      {adminTab === "settings" && (
        <>
          <div className="card text-sm">
            <p className="mb-3 font-bold text-slate-800">운영 순서</p>
            <ol className="list-decimal space-y-2 pl-5 text-slate-700">
              <li>
                <strong>신청 기간</strong> — 플레이어가 비밀 URL에서 신청 (선호만
                저장, 배정 없음)
              </li>
              <li>
                <strong>예약 마감</strong> — 아래 토글로 신청 마감
              </li>
              <li>
                <strong>스피드업 검증</strong> — 「예약 목록」탭에서 수치 확인·수정
              </li>
              <li>
                <strong>배정 실행</strong> — 아래 「배정 실행」버튼 (R4+)
              </li>
              <li>
                <strong>결과 공지</strong> — /status 링크 공유
              </li>
            </ol>
          </div>

          <div className="card text-sm">
            <p>
              사이클 <strong>#{cycleId}</strong>
              {open ? (
                <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                  신청 접수 중
                </span>
              ) : (
                <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  마감됨
                </span>
              )}
            </p>
          </div>

          <div className="card border-2 border-slate-300">
            <p className="mb-2 text-sm font-bold text-slate-800">
              ② 예약 마감
            </p>
            <button
              type="button"
              className={`w-full rounded-xl border py-3.5 text-sm font-semibold transition ${
                open
                  ? "border-red-400 bg-red-50 text-red-800 hover:bg-red-100"
                  : "border-green-400 bg-green-50 text-green-800 hover:bg-green-100"
              }`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await toggleReservationOpen();
                  setOpen(res.open);
                  setMessage(
                    res.open ? "신청을 다시 받습니다." : "신청이 마감되었습니다."
                  );
                })
              }
            >
              {open ? "예약 마감하기" : "예약 다시 열기"}
            </button>
          </div>

          <AssignmentRunPanel />

          <div className="card">
            <p className="mb-2 text-sm font-medium">신청 링크 (Secret URL)</p>
            <p className="break-all text-xs text-slate-600">{secretUrl}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn-secondary !min-h-0 flex-1 py-2 text-sm"
                onClick={() => navigator.clipboard.writeText(secretUrl)}
              >
                복사
              </button>
              <button
                type="button"
                className="btn-primary !min-h-0 flex-1 py-2 text-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await regenerateToken();
                    setToken(res.token);
                    setMessage("토큰이 재발급되었습니다.");
                  })
                }
              >
                토큰 재발급
              </button>
            </div>
          </div>

          <div className="card border-red-200">
            <p className="mb-2 text-sm font-medium text-red-700">사이클 초기화</p>
            <p className="mb-2 text-xs text-slate-500">
              플레이어·신청·배정 전부 삭제 후 새 사이클. RESET 입력 후 실행.
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
                    setMessage(
                      res.message ?? `사이클 #${res.cycleId}로 초기화되었습니다.`
                    );
                    setResetConfirm("");
                  }
                })
              }
            >
              Reset cycle
            </button>
          </div>
        </>
      )}

      {adminTab === "reservations" && (
        <>
          <p className="text-sm text-slate-600">
            ③ 스피드업 검증 — 검색·그리드·대기열에서 확인. 배정 후 결과도 여기서
            봅니다.
          </p>

          <button
            type="button"
            className="btn-secondary !min-h-0 py-3 text-sm"
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
            Excel보내기
          </button>

          <hr className="border-slate-200" />

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
        </>
      )}
    </div>
  );
}
