"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { submitReservation } from "./actions";
import { DayOfWeek, DAY_CONFIG, TIME_BLOCKS, ALLIANCE_OPTIONS } from "@/lib/types";
import { TimeBlockCheckbox } from "@/components/TimeBlockCheckbox";
import {
  ConfirmReservationDialog,
  DayConfirmSummary,
} from "@/components/ConfirmReservationDialog";

interface Props {
  reservationOpen: boolean;
  token: string;
}

type Step = "info" | "mon" | "tue" | "thu";

const DAY_STEPS: { step: Step; day: DayOfWeek }[] = [
  { step: "mon", day: "mon" },
  { step: "tue", day: "tue" },
  { step: "thu", day: "thu" },
];

interface DayFormState {
  speedup: string;
  blocks: number[];
}

function emptyDayState(): Record<DayOfWeek, DayFormState> {
  return {
    mon: { speedup: "", blocks: [] },
    tue: { speedup: "", blocks: [] },
    thu: { speedup: "", blocks: [] },
  };
}

function speedupLabelFor(day: DayOfWeek): string {
  if (day === "mon") return "Monday Speedup (days)";
  if (day === "tue") return "Tuesday Speedup (days)";
  return "Thursday Speedup (days)";
}

interface DayStepContentProps {
  day: DayOfWeek;
  speedup: string;
  blocks: number[];
  isReserved: boolean;
  pending: boolean;
  onSpeedupChange: (value: string) => void;
  onToggleBlock: (block: number) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

function DayStepContent({
  day,
  speedup,
  blocks,
  isReserved,
  pending,
  onSpeedupChange,
  onToggleBlock,
  onBack,
  onNext,
  onSubmit,
}: DayStepContentProps) {
  const office = DAY_CONFIG[day].office;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Step {day === "mon" ? 1 : day === "tue" ? 2 : 3} of 3</span>
        <span>
          {DAY_CONFIG[day].label} · {office}
        </span>
      </div>

      {isReserved && (
        <p className="text-sm text-amber-800">
          You already applied for {DAY_CONFIG[day].label}. Submitting again will
          replace your entire application for this cycle.
        </p>
      )}

      <p className="text-sm text-slate-600">
        Set speedup and time slots for {DAY_CONFIG[day].label}, or leave blank to
        skip.
      </p>

      <div className="card">
            <label className="mb-1 block text-sm font-medium text-slate-600">
              {speedupLabelFor(day)}
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={speedup}
              onChange={(e) => onSpeedupChange(e.target.value)}
              className="input-field"
              placeholder="Whole numbers only"
              onKeyDown={(e) => {
                if (e.key === "." || e.key === "e" || e.key === "-")
                  e.preventDefault();
              }}
            />
          </div>

          <div className="card">
            <label className="mb-3 block text-sm font-medium text-slate-600">
              Preferred time slots (UTC)
            </label>
            <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
              {TIME_BLOCKS.map((block) => (
                <TimeBlockCheckbox
                  key={block}
                  blockStart={block}
                  checked={blocks.includes(block)}
                  onChange={() => onToggleBlock(block)}
                />
              ))}
            </div>
          </div>

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">
          Back
        </button>
        {day === "thu" ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="btn-primary flex-1"
          >
            Submit
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="btn-primary flex-1"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

export function ReservationForm({ reservationOpen, token }: Props) {
  const [step, setStep] = useState<Step>("info");
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [alliance, setAlliance] = useState("");
  const [dayState, setDayState] = useState(emptyDayState);
  const [reservedDays, setReservedDays] = useState<DayOfWeek[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stepIndex =
    step === "info" ? 0 : step === "mon" ? 1 : step === "tue" ? 2 : 3;

  const fetchReservedDays = useCallback(
    async (id: string) => {
      const parsed = parseInt(id, 10);
      if (!id.trim() || isNaN(parsed)) {
        setReservedDays([]);
        return;
      }
      try {
        const query = new URLSearchParams({ playerId: String(parsed) });
        const res = await fetch(`/r/${token}/api/existing?${query}`);
        const data = await res.json();
        setReservedDays((data.reservedDays ?? []) as DayOfWeek[]);
      } catch {
        setReservedDays([]);
      }
    },
    [token]
  );

  useEffect(() => {
    const t = setTimeout(() => fetchReservedDays(playerId), 400);
    return () => clearTimeout(t);
  }, [playerId, fetchReservedDays]);

  useEffect(() => {
    if (step !== "info" && playerId.trim()) {
      fetchReservedDays(playerId);
    }
  }, [step, playerId, fetchReservedDays]);

  const setSpeedupForDay = useCallback((day: DayOfWeek, value: string) => {
    setDayState((prev) => ({
      ...prev,
      [day]: { ...prev[day], speedup: value },
    }));
  }, []);

  function clearDay(day: DayOfWeek) {
    setDayState((prev) => ({
      ...prev,
      [day]: { speedup: "", blocks: [] },
    }));
  }

  function toggleBlock(day: DayOfWeek, block: number) {
    setDayState((prev) => {
      const blocks = prev[day].blocks.includes(block)
        ? prev[day].blocks.filter((b) => b !== block)
        : [...prev[day].blocks, block];
      return { ...prev, [day]: { ...prev[day], blocks } };
    });
  }

  function validateDay(day: DayOfWeek): string | null {
    const d = dayState[day];
    const hasBlocks = d.blocks.length > 0;
    const hasSpeedup = d.speedup !== "" && !isNaN(parseInt(d.speedup, 10));

    if (!hasBlocks && !hasSpeedup) return null;

    if (!hasSpeedup) {
      return `${DAY_CONFIG[day].label}: enter speedup.`;
    }
    const speedup = parseInt(d.speedup, 10);
    if (speedup < 0 || !Number.isInteger(speedup)) {
      return `${DAY_CONFIG[day].label}: speedup must be a whole number ≥ 0.`;
    }
    if (!hasBlocks) {
      return `${DAY_CONFIG[day].label}: select at least one time slot.`;
    }
    return null;
  }

  function getSelectedDays(): DayOfWeek[] {
    return (["mon", "tue", "thu"] as DayOfWeek[]).filter(
      (day) =>
        dayState[day].blocks.length > 0 && dayState[day].speedup !== ""
    );
  }

  function nextStepAfter(day: DayOfWeek): Step {
    if (day === "mon") return "tue";
    if (day === "tue") return "thu";
    return "thu";
  }

  function goNextFromDay(day: DayOfWeek) {
    const err = validateDay(day);
    if (err) {
      setMessage({ type: "err", text: err });
      return;
    }
    setMessage(null);
    if (day === "thu") return;
    setStep(nextStepAfter(day));
  }

  function goBack() {
    setMessage(null);
    if (step === "mon") setStep("info");
    else if (step === "tue") setStep("mon");
    else if (step === "thu") setStep("tue");
  }

  function handleInfoNext() {
    if (!playerId.trim() || !name.trim() || !alliance) {
      setMessage({
        type: "err",
        text: "Please fill in Player ID, Player Name, and select an alliance.",
      });
      return;
    }
    setMessage(null);
    setStep("mon");
  }

  function buildConfirmSummaries(): DayConfirmSummary[] {
    return getSelectedDays().map((day) => ({
      day,
      speedup: parseInt(dayState[day].speedup, 10),
      blocks: [...dayState[day].blocks].sort((a, b) => a - b),
    }));
  }

  function openConfirmDialog() {
    for (const { day } of DAY_STEPS) {
      const err = validateDay(day);
      if (err) {
        setMessage({ type: "err", text: err });
        setStep(day);
        return;
      }
    }

    const selected = getSelectedDays();
    if (selected.length === 0) {
      setMessage({
        type: "err",
        text: "Select at least one day.",
      });
      return;
    }

    setMessage(null);
    setConfirmOpen(true);
  }

  function submitConfirmed() {
    const selected = getSelectedDays();
    const fd = new FormData();
    fd.set("player_id", playerId);
    fd.set("name", name);
    fd.set("alliance", alliance);

    selected.forEach((day) => {
      fd.append("days", day);
      fd.set(`speedup_${day}`, dayState[day].speedup);
      dayState[day].blocks.forEach((b) =>
        fd.append(`preferred_blocks_${day}`, String(b))
      );
    });

    startTransition(async () => {
      const result = await submitReservation(fd);
      setConfirmOpen(false);
      setMessage({
        type: result.success ? "ok" : "err",
        text: result.message,
      });
      if (result.success) {
        setStep("info");
        setPlayerId("");
        setName("");
        setAlliance("");
        setDayState(emptyDayState());
        setReservedDays([]);
      } else {
        await fetchReservedDays(playerId);
      }
    });
  }

  if (!reservationOpen) {
    return (
      <div className="banner-closed py-8 text-base">
        Secret URL applications are closed
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        {(["info", "mon", "tue", "thu"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-brand-600" : "bg-slate-200"
              }`}
          />
        ))}
      </div>

      {step === "info" && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <h2 className="mb-3 text-lg font-bold">Your info</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  Player ID
                </label>
                <input
                  type="number"
                  required
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  onBlur={() => fetchReservedDays(playerId)}
                  className="input-field"
                  placeholder="e.g. 12345678"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  Player Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-slate-600">
                  Alliance
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ALLIANCE_OPTIONS.map((code) => (
                    <label
                      key={code}
                      className={`flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        alliance === code
                          ? "border-brand-500 bg-brand-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="alliance"
                        value={code}
                        checked={alliance === code}
                        onChange={() => setAlliance(code)}
                        className="h-5 w-5 shrink-0 accent-brand-600"
                      />
                      <span className="text-sm font-semibold">{code}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {reservedDays.length > 0 && (
            <p className="text-sm text-amber-800">
              You already applied for:{" "}
              {reservedDays.map((d) => DAY_CONFIG[d].label).join(", ")}.
              Submitting again replaces your entire application for this cycle.
            </p>
          )}
          <p className="text-sm text-slate-500">
            Monday → Tuesday → Thursday. You can resubmit to update your
            application before assignment runs.
          </p>
          <button type="button" onClick={handleInfoNext} className="btn-primary">
            Next — Monday
          </button>
        </div>
      )}

      {step === "mon" && (
        <DayStepContent
          day="mon"
          speedup={dayState.mon.speedup}
          blocks={dayState.mon.blocks}
          isReserved={reservedDays.includes("mon")}
          pending={pending}
          onSpeedupChange={(value) => setSpeedupForDay("mon", value)}
          onToggleBlock={(block) => toggleBlock("mon", block)}
          onBack={goBack}
          onNext={() => goNextFromDay("mon")}
          onSubmit={openConfirmDialog}
        />
      )}

      {step === "tue" && (
        <DayStepContent
          day="tue"
          speedup={dayState.tue.speedup}
          blocks={dayState.tue.blocks}
          isReserved={reservedDays.includes("tue")}
          pending={pending}
          onSpeedupChange={(value) => setSpeedupForDay("tue", value)}
          onToggleBlock={(block) => toggleBlock("tue", block)}
          onBack={goBack}
          onNext={() => goNextFromDay("tue")}
          onSubmit={openConfirmDialog}
        />
      )}

      {step === "thu" && (
        <DayStepContent
          day="thu"
          speedup={dayState.thu.speedup}
          blocks={dayState.thu.blocks}
          isReserved={reservedDays.includes("thu")}
          pending={pending}
          onSpeedupChange={(value) => setSpeedupForDay("thu", value)}
          onToggleBlock={(block) => toggleBlock("thu", block)}
          onBack={goBack}
          onNext={() => goNextFromDay("thu")}
          onSubmit={openConfirmDialog}
        />
      )}

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm whitespace-pre-line ${
            message.type === "ok"
              ? "bg-green-50 text-green-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <ConfirmReservationDialog
        open={confirmOpen}
        summaries={buildConfirmSummaries()}
        pending={pending}
        onConfirm={submitConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      <a
        href={`/r/${token}/check`}
        className="text-center text-sm text-brand-600 underline"
      >
        Check my reservation
      </a>
    </div>
  );
}
