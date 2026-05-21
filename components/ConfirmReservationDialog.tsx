"use client";

import { DayOfWeek, DAY_CONFIG } from "@/lib/types";
import { formatBlockRange } from "@/lib/utils";

export interface DayConfirmSummary {
  day: DayOfWeek;
  speedup: number;
  blocks: number[];
}

interface Props {
  open: boolean;
  summaries: DayConfirmSummary[];
  tz: "UTC" | "KST";
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmReservationDialog({
  open,
  summaries,
  tz,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto shadow-xl"
        role="dialog"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title" className="text-lg font-bold text-brand-900">
          Confirm your reservation?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          After applying, you cannot edit this yourself. Double-check speedup
          and time slots. Assignment results will be announced after the booking
          window closes.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {summaries.map((s) => (
            <li
              key={s.day}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <p className="font-semibold">
                {DAY_CONFIG[s.day].label} ({DAY_CONFIG[s.day].office})
              </p>
              <p className="mt-1 text-slate-600">Speedup: {s.speedup} days</p>
              <p className="mt-1 text-slate-600">
                Time slots ({tz}):
              </p>
              <ul className="mt-1 list-inside list-disc text-slate-700">
                {s.blocks.map((b) => (
                  <li key={b}>{formatBlockRange(b, tz)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="btn-secondary flex-1"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="btn-primary flex-1"
          >
            {pending ? "Submitting..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
