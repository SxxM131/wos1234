"use client";

import { useState, useTransition } from "react";
import { submitReservation } from "./actions";
import { DayOfWeek, DAY_CONFIG, TIME_BLOCKS } from "@/lib/types";
import { TimeBlockCheckbox } from "@/components/TimeBlockCheckbox";

interface Props {
  reservationOpen: boolean;
  token: string;
}

export function ReservationForm({ reservationOpen, token }: Props) {
  const [day, setDay] = useState<DayOfWeek>("mon");
  const [selectedBlocks, setSelectedBlocks] = useState<number[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [tz, setTz] = useState<"UTC" | "KST">("UTC");

  if (!reservationOpen) {
    return (
      <div className="banner-closed py-8 text-base">
        Reservations are closed
      </div>
    );
  }

  const office = DAY_CONFIG[day].office;
  const speedupLabel = office === "VP" ? "VP Speedup (days)" : "MO Speedup (days)";

  function toggleBlock(block: number) {
    setSelectedBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("day_of_week", day);
    selectedBlocks.forEach((b) => fd.append("preferred_blocks", String(b)));

    startTransition(async () => {
      const result = await submitReservation(fd);
      setMessage({
        type: result.success ? "ok" : "err",
        text: result.message,
      });
      if (result.success) {
        setSelectedBlocks([]);
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="card">
        <h2 className="mb-3 text-lg font-bold">Apply for Reservation</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Game ID
            </label>
            <input
              name="game_id"
              type="number"
              required
              className="input-field"
              placeholder="e.g. 12345678"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Name
            </label>
            <input name="name" type="text" required className="input-field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Alliance
            </label>
            <input name="alliance" type="text" required className="input-field" />
          </div>
        </div>
      </div>

      <div className="card">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Select day
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["mon", "tue", "thu"] as DayOfWeek[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDay(d);
                setSelectedBlocks([]);
              }}
              className={`min-h-touch rounded-xl border py-2 text-sm font-medium ${
                day === d
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {DAY_CONFIG[d].label}
              <br />
              <span className="text-xs">{DAY_CONFIG[d].office}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <label className="mb-1 block text-sm font-medium text-slate-600">
          {speedupLabel}
        </label>
        <input
          name="speedup"
          type="number"
          step="1"
          min="0"
          required
          className="input-field"
          placeholder="Whole numbers only"
          onKeyDown={(e) => {
            if (e.key === "." || e.key === "e" || e.key === "-") e.preventDefault();
          }}
        />
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-600">
            Preferred time slots (select multiple)
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
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {TIME_BLOCKS.map((block) => (
            <TimeBlockCheckbox
              key={block}
              blockStart={block}
              checked={selectedBlocks.includes(block)}
              onChange={() => toggleBlock(block)}
              tz={tz}
            />
          ))}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            message.type === "ok"
              ? "bg-green-50 text-green-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || selectedBlocks.length === 0}
        className="btn-primary"
      >
        {pending ? "Submitting..." : "Submit reservation"}
      </button>

      <a
        href={`/r/${token}/check`}
        className="text-center text-sm text-brand-600 underline"
      >
        Check my reservation
      </a>
    </form>
  );
}
