"use client";

import { useState, useTransition } from "react";
import { submitReservation } from "./actions";
import { DayOfWeek, DAY_CONFIG, TIME_BLOCKS } from "@/lib/types";
import { TimeBlockCheckbox } from "@/components/TimeBlockCheckbox";

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

export function ReservationForm({ reservationOpen, token }: Props) {
  const [step, setStep] = useState<Step>("info");
  const [gameId, setGameId] = useState("");
  const [name, setName] = useState("");
  const [alliance, setAlliance] = useState("");
  const [dayState, setDayState] = useState(emptyDayState);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [tz, setTz] = useState<"UTC" | "KST">("UTC");

  const stepIndex =
    step === "info" ? 0 : step === "mon" ? 1 : step === "tue" ? 2 : 3;

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

    if (!hasBlocks && !hasSpeedup) return null; // skip day

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
      (day) => dayState[day].blocks.length > 0
    );
  }

  function goNextFromDay(day: DayOfWeek) {
    const err = validateDay(day);
    if (err) {
      setMessage({ type: "err", text: err });
      return;
    }
    setMessage(null);
    if (day === "mon") setStep("tue");
    else if (day === "tue") setStep("thu");
  }



  function goBack() {
    setMessage(null);
    if (step === "mon") setStep("info");
    else if (step === "tue") setStep("mon");
    else if (step === "thu") setStep("tue");
  }

  function handleInfoNext() {
    if (!gameId.trim() || !name.trim() || !alliance.trim()) {
      setMessage({ type: "err", text: "Please fill in Game ID, Name, and Alliance." });
      return;
    }
    setMessage(null);
    setStep("mon");
  }

  function handleSubmit() {
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
        text: "Apply for at least one day, or go back and select time slots.",
      });
      return;
    }

    const fd = new FormData();
    fd.set("game_id", gameId);
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
      setMessage({
        type: result.success ? "ok" : "err",
        text: result.message,
      });
      if (result.success) {
        setStep("info");
        setGameId("");
        setName("");
        setAlliance("");
        setDayState(emptyDayState());
      }
    });
  }

  if (!reservationOpen) {
    return (
      <div className="banner-closed py-8 text-base">
        Reservations are closed
      </div>
    );
  }

  function DayStepContent({ day }: { day: DayOfWeek }) {
    const office = DAY_CONFIG[day].office;
    const speedupLabel =
      office === "VP" ? "VP Speedup (days)" : "MO Speedup (days)";

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Step {day === "mon" ? 1 : day === "tue" ? 2 : 3} of 3
          </span>
          <span>{DAY_CONFIG[day].label} · {office}</span>
        </div>

        <p className="text-sm text-slate-600">
          Set speedup and time slots for {DAY_CONFIG[day].label}, or leave them blank to skip.
        </p>

        <div className="card">
          <label className="mb-1 block text-sm font-medium text-slate-600">
            {speedupLabel}
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={dayState[day].speedup}
            onChange={(e) =>
              setDayState((prev) => ({
                ...prev,
                [day]: { ...prev[day], speedup: e.target.value },
              }))
            }
            className="input-field"
            placeholder="Whole numbers only"
            onKeyDown={(e) => {
              if (e.key === "." || e.key === "e" || e.key === "-")
                e.preventDefault();
            }}
          />
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-600">
              Preferred time slots
            </label>
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
          <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
            {TIME_BLOCKS.map((block) => (
              <TimeBlockCheckbox
                key={block}
                blockStart={block}
                checked={dayState[day].blocks.includes(block)}
                onChange={() => toggleBlock(day, block)}
                tz={tz}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={goBack} className="btn-secondary flex-1">
            Back
          </button>
          {day === "thu" ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="btn-primary flex-1"
            >
              {pending ? "Submitting..." : "Submit"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goNextFromDay(day)}
              className="btn-primary flex-1"
            >
              Next
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex gap-1">
        {(["info", "mon", "tue", "thu"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              i <= stepIndex ? "bg-brand-600" : "bg-slate-200"
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
                  Game ID
                </label>
                <input
                  type="number"
                  required
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                  className="input-field"
                  placeholder="e.g. 12345678"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  Name
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
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  Alliance
                </label>
                <input
                  type="text"
                  required
                  value={alliance}
                  onChange={(e) => setAlliance(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Go through Monday → Tuesday → Thursday. Skip any day you don&apos;t
            need.
          </p>
          <button type="button" onClick={handleInfoNext} className="btn-primary">
            Next — Monday
          </button>
        </div>
      )}

      {step === "mon" && <DayStepContent day="mon" />}
      {step === "tue" && <DayStepContent day="tue" />}
      {step === "thu" && <DayStepContent day="thu" />}

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

      <a
        href={`/r/${token}/check`}
        className="text-center text-sm text-brand-600 underline"
      >
        Check my reservation
      </a>
    </div>
  );
}
