"use client";

import { DayOfWeek, DAY_CONFIG } from "@/lib/types";

interface Props {
  active: DayOfWeek;
  onChange: (day: DayOfWeek) => void;
}

const DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export function DayTabs({ active, onChange }: Props) {
  return (
    <div className="flex border-b border-slate-200">
      {DAYS.map((day) => (
        <button
          key={day}
          type="button"
          onClick={() => onChange(day)}
          className={`flex-1 py-3 text-center text-sm ${
            active === day ? "tab-active" : "tab-inactive"
          }`}
        >
          {DAY_CONFIG[day].label}
          <span className="ml-1 text-xs text-slate-400">
            ({DAY_CONFIG[day].office})
          </span>
        </button>
      ))}
    </div>
  );
}
