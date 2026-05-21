"use client";

import { useState, useTransition } from "react";
import {
  regenerateToken,
  toggleReservationOpen,
  resetCycle,
  cancelReservation,
  updatePlayerSpeedup,
  toggleSlotActive,
  exportCsv,
  logoutAdmin,
} from "./actions";
import { DAY_CONFIG, DayOfWeek } from "@/lib/types";
import { dayLabel, formatSlotTime } from "@/lib/utils";

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

interface Props {
  reservations: ReservationRow[];
  eliminated: {
    id: string;
    player_id: number;
    players: ReservationRow["players"];
    preferences: { day_of_week: string; block_start_utc: number }[];
  }[];
  accessToken: string;
  reservationOpen: boolean;
  cycleId: number;
  baseUrl: string;
}

export function AdminDashboard({
  reservations,
  eliminated,
  accessToken,
  reservationOpen,
  cycleId,
  baseUrl,
}: Props) {
  const [token, setToken] = useState(accessToken);
  const [open, setOpen] = useState(reservationOpen);
  const [filterDay, setFilterDay] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [resetConfirm, setResetConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const secretUrl = `${baseUrl}/r/${token}`;

  const filtered = reservations.filter((r) => {
    if (filterDay !== "all" && r.slots?.day_of_week !== filterDay) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">운영자 관리</h1>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-slate-500 underline">
            로그아웃
          </button>
        </form>
      </div>

      {!open && (
        <div className="banner-closed">예약 마감</div>
      )}

      <div className="card text-sm">
        <p>
          사이클 <strong>#{cycleId}</strong>
          {open ? (
            <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
              접수 중
            </span>
          ) : (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
              마감
            </span>
          )}
        </p>
      </div>

      {/* Secret URL */}
      <div className="card">
        <p className="mb-2 text-sm font-medium">비밀 URL</p>
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
                setMessage("토큰이 재생성되었습니다. 기존 URL은 무효화됩니다.");
              })
            }
          >
            토큰 재생성
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-xl border py-3 text-sm font-medium ${
            open
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-green-300 bg-green-50 text-green-700"
          }`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await toggleReservationOpen();
              setOpen(res.open);
            })
          }
        >
          {open ? "예약 마감" : "예약 오픈"}
        </button>
        <button
          type="button"
          className="btn-secondary !min-h-0 py-3 text-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const csv = await exportCsv();
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `reservations-cycle-${cycleId}.csv`;
              a.click();
            })
          }
        >
          CSV보내기
        </button>
      </div>

      {/* Reset */}
      <div className="card border-red-200">
        <p className="mb-2 text-sm font-medium text-red-700">예약 초기화</p>
        <p className="mb-2 text-xs text-slate-500">
          되돌릴 수 없습니다. 아래에 &apos;초기화&apos;를 입력하세요.
        </p>
        <input
          value={resetConfirm}
          onChange={(e) => setResetConfirm(e.target.value)}
          placeholder="초기화"
          className="input-field mb-2"
        />
        <button
          type="button"
          disabled={pending || resetConfirm !== "초기화"}
          className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          onClick={() =>
            startTransition(async () => {
              const res = await resetCycle(resetConfirm);
              if (res.error) setMessage(res.error);
              else {
                setMessage(`사이클이 #${res.cycleId}로 초기화되었습니다.`);
                setResetConfirm("");
              }
            })
          }
        >
          예약 초기화 실행
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto">
        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">전체 요일</option>
          <option value="mon">월</option>
          <option value="tue">화</option>
          <option value="thu">목</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">전체 상태</option>
          <option value="assigned">배정</option>
          <option value="cancelled">취소</option>
        </select>
      </div>

      {/* Reservations table - mobile cards */}
      <div>
        <h2 className="mb-2 text-sm font-bold">
          예약 목록 ({filtered.length})
        </h2>
        <div className="flex flex-col gap-2">
          {filtered.map((r) => {
            const config = DAY_CONFIG[r.slots.day_of_week as DayOfWeek];
            const speedup =
              config?.speedupKey === "speedup_vp"
                ? r.players.speedup_vp
                : r.players.speedup_mo;
            return (
              <div key={r.id} className="card !p-3 text-sm">
                <div className="flex justify-between">
                  <p className="font-medium">
                    {r.players.name}{" "}
                    <span className="text-slate-500">({r.players.alliance})</span>
                  </p>
                  <span
                    className={`text-xs ${
                      r.status === "assigned"
                        ? "text-green-600"
                        : "text-slate-400"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {dayLabel(r.slots.day_of_week as DayOfWeek)}{" "}
                  {formatSlotTime(
                    r.slots.block_start_utc,
                    r.slots.slot_index,
                    "UTC"
                  )}{" "}
                  · SU {speedup}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600"
                    onClick={() =>
                      startTransition(() => cancelReservation(r.id))
                    }
                  >
                    취소
                  </button>
                  <SpeedupEdit
                    gameId={r.players.game_id}
                    vp={r.players.speedup_vp}
                    mo={r.players.speedup_mo}
                  />
                  <button
                    type="button"
                    className="rounded-lg border px-2 py-1 text-xs"
                    onClick={() =>
                      startTransition(() =>
                        toggleSlotActive(r.slots.id, !r.slots.is_active)
                      )
                    }
                  >
                    슬롯 {r.slots.is_active ? "비활성" : "활성"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Eliminated */}
      {eliminated.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold">
            탈락자 ({eliminated.length})
          </h2>
          <div className="flex flex-col gap-2">
            {eliminated.map((e) => (
              <div key={e.id} className="card !p-3 text-sm">
                <p className="font-medium">
                  {e.players.name} ({e.players.alliance})
                </p>
                <p className="text-xs text-slate-500">
                  VP {e.players.speedup_vp} / MO {e.players.speedup_mo}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeedupEdit({
  gameId,
  vp,
  mo,
}: {
  gameId: number;
  vp: number;
  mo: number;
}) {
  const [editing, setEditing] = useState(false);
  const [vpVal, setVpVal] = useState(vp);
  const [moVal, setMoVal] = useState(mo);
  const [, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        className="rounded-lg border px-2 py-1 text-xs"
        onClick={() => setEditing(true)}
      >
        SU 수정
      </button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1">
      <input
        type="number"
        value={vpVal}
        onChange={(e) => setVpVal(parseInt(e.target.value, 10) || 0)}
        className="w-14 rounded border px-1 text-xs"
        title="VP"
      />
      <input
        type="number"
        value={moVal}
        onChange={(e) => setMoVal(parseInt(e.target.value, 10) || 0)}
        className="w-14 rounded border px-1 text-xs"
        title="MO"
      />
      <button
        type="button"
        className="rounded bg-brand-600 px-2 py-1 text-xs text-white"
        onClick={() =>
          startTransition(async () => {
            await updatePlayerSpeedup(gameId, vpVal, moVal);
            setEditing(false);
          })
        }
      >
        저장
      </button>
    </div>
  );
}
