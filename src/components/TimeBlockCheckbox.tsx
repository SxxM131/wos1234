"use client";

import { formatBlockRange } from "@/lib/utils";

interface Props {
  blockStart: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function TimeBlockCheckbox({
  blockStart,
  checked,
  onChange,
  disabled,
}: Props) {
  return (
    <label
      className={`flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        checked
          ? "border-brand-500 bg-brand-50"
          : "border-slate-200 bg-white"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-5 w-5 shrink-0 rounded accent-brand-600"
      />
      <span className="text-sm leading-snug">
        {formatBlockRange(blockStart)}
      </span>
    </label>
  );
}
