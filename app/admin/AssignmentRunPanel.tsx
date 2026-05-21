"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getAssignmentPreviewForAdmin,
  runFullBatchAssignment,
} from "./actions";

interface Preview {
  applicants: { mon: number; tue: number; thu: number };
  lastRun: string | null;
  cycleId: number;
}

function formatLastRun(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AssignmentRunPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadPreview = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getAssignmentPreviewForAdmin();
        setPreview(data);
      } catch {
        /* ignore */
      }
    });
  }, []);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  function handleRun() {
    if (
      !confirm(
        "Run full batch assignment for the current cycle? Existing assignments for Mon/Tue/Thu will be cleared and recalculated."
      )
    ) {
      return;
    }
    setResultLine(null);
    setErrorLine(null);
    startTransition(async () => {
      try {
        const data = await runFullBatchAssignment();
        if (!data.success) {
          setErrorLine("An error occurred while processing assignments.");
          return;
        }
        setResultLine(
          `Assignment complete (cycle #${preview?.cycleId ?? "?"}) — Mon ${data.mon.assigned} assigned / ${data.mon.eliminated} waitlist · Tue ${data.tue.assigned} assigned / ${data.tue.eliminated} waitlist · Thu ${data.thu.assigned} assigned / ${data.thu.eliminated} waitlist`
        );
        const next = await getAssignmentPreviewForAdmin();
        setPreview(next);
      } catch {
        setErrorLine("An error occurred while processing assignments.");
      }
    });
  }

  const a = preview?.applicants;

  return (
    <div className="card border-amber-300 bg-amber-50/40">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">Full batch assignment</h2>
        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          R4+ only
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Assigns all applicants for the current cycle in one pass (Mon → Tue →
        Thu). Re-running replaces existing assignments for this cycle.
      </p>

      {preview && (
        <p className="mt-2 text-xs text-slate-500">
          Current cycle: <strong>#{preview.cycleId}</strong>
        </p>
      )}

      {a && (
        <p className="mt-3 text-sm text-slate-700">
          Applicants: Mon {a.mon} · Tue {a.tue} · Thu {a.thu}
        </p>
      )}
      <p className="mt-1 text-sm text-slate-600">
        {preview?.lastRun
          ? `Last run: ${formatLastRun(preview.lastRun)}`
          : "Assignment status: not run yet"}
      </p>

      <button
        type="button"
        className="btn-gold mt-4"
        disabled={pending}
        onClick={handleRun}
      >
        {pending ? "Running assignment..." : "Run full assignment"}
      </button>

      {pending && (
        <p className="mt-2 text-xs text-slate-500">Processing assignments...</p>
      )}

      {resultLine && (
        <p className="mt-3 text-sm font-medium text-green-800">{resultLine}</p>
      )}
      {errorLine && (
        <p className="mt-3 text-sm font-medium text-red-700">{errorLine}</p>
      )}

      <p className="mt-4 border-t border-amber-200/80 pt-3 text-xs text-slate-500">
        Recommended: ① Close reservations → ② Verify speedups → ③ Run full
        assignment → ④ Check /status and announce
      </p>
    </div>
  );
}
