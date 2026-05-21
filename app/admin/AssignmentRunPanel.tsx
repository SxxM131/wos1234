"use client";

import { useCallback, useEffect, useState } from "react";

interface Preview {
  applicants: { mon: number; tue: number; thu: number };
  lastRun: string | null;
}

interface BatchResult {
  assigned: number;
  eliminated: number;
}

interface RunResponse {
  success: boolean;
  mon?: BatchResult;
  tue?: BatchResult;
  thu?: BatchResult;
  error?: string;
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
  const [running, setRunning] = useState(false);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/assignment-preview");
      if (!res.ok) return;
      const data = (await res.json()) as Preview;
      setPreview(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  async function handleRun() {
    setRunning(true);
    setResultLine(null);
    setErrorLine(null);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_batch_assignment" }),
      });
      const data = (await res.json()) as RunResponse;
      if (!res.ok || !data.success || !data.mon) {
        setErrorLine("An error occurred while processing assignments.");
        return;
      }
      setResultLine(
        `Assignment complete — Mon ${data.mon.assigned} assigned / ${data.mon.eliminated} waitlist · Tue ${data.tue!.assigned} assigned / ${data.tue!.eliminated} waitlist · Thu ${data.thu!.assigned} assigned / ${data.thu!.eliminated} waitlist`
      );
      await loadPreview();
    } catch {
      setErrorLine("An error occurred while processing assignments.");
    } finally {
      setRunning(false);
    }
  }

  const a = preview?.applicants;

  return (
    <div className="card border-amber-200 bg-amber-50/30">
      <h2 className="text-sm font-bold text-slate-800">Run assignment</h2>
      <p className="mt-2 text-xs text-slate-600">
        Run only after reservations are closed and speedups have been verified.
        All applicants are assigned by speedup in one pass. Re-running clears
        existing assignments for this cycle and recalculates.
      </p>

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
        disabled={running}
        onClick={handleRun}
      >
        {running ? "Running assignment..." : "Run assignment"}
      </button>

      {running && (
        <p className="mt-2 text-xs text-slate-500">Processing assignments...</p>
      )}

      {resultLine && (
        <p className="mt-3 text-sm font-medium text-green-800">{resultLine}</p>
      )}
      {errorLine && (
        <p className="mt-3 text-sm font-medium text-red-700">{errorLine}</p>
      )}

      <p className="mt-4 border-t border-amber-200/80 pt-3 text-xs text-slate-500">
        Recommended order: ① Close reservations → ② Verify and fix speedups →
        ③ Run assignment → ④ Review results and announce
      </p>
    </div>
  );
}
