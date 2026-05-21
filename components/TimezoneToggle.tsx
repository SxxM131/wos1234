"use client";

interface Props {
  tz: "UTC" | "KST";
  onChange: (tz: "UTC" | "KST") => void;
}

export function TimezoneToggle({ tz, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-sm">
      <button
        type="button"
        onClick={() => onChange("UTC")}
        className={`rounded-md px-3 py-1.5 font-medium ${
          tz === "UTC" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"
        }`}
      >
        UTC
      </button>
      <button
        type="button"
        onClick={() => onChange("KST")}
        className={`rounded-md px-3 py-1.5 font-medium ${
          tz === "KST" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"
        }`}
      >
        KST
      </button>
    </div>
  );
}
