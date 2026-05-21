"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AssignmentRunPanel() {
  const router = useRouter();
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
        setErrorLine("Could not load assignment status. Log in again.");
      }
    });
  }, []);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  function handleRun() {
    if (
      !confirm(
        "현재 사이클의 월·화·목 배정을 모두 삭제하고 Hopcroft-Karp 알고리즘으로 다시 계산합니다. 계속할까요?"
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
          setErrorLine("배정 처리 중 오류가 발생했습니다.");
          return;
        }
        setResultLine(
          `배정 완료 — 월 ${data.mon.assigned}명 배정 / ${data.mon.eliminated}명 대기 · 화 ${data.tue.assigned}명 배정 / ${data.tue.eliminated}명 대기 · 목 ${data.thu.assigned}명 배정 / ${data.thu.eliminated}명 대기`
        );
        const next = await getAssignmentPreviewForAdmin();
        setPreview(next);
        router.refresh();
      } catch {
        setErrorLine("배정 처리 중 오류가 발생했습니다.");
      }
    });
  }

  const a = preview?.applicants;

  return (
    <div className="card border-2 border-amber-400 bg-amber-50 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">④ 배정 실행</h2>
        <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-[11px] font-bold text-white">
          R4+ only
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-700">
        예약 마감·스피드업 검증 후 실행하세요. 전체 신청자를 스피드업 순으로
        최적 배정합니다. 재실행 시 기존 배정이 초기화됩니다.
      </p>

      {preview && (
        <p className="mt-3 text-sm text-slate-600">
          사이클 <strong>#{preview.cycleId}</strong>
        </p>
      )}

      {a && (
        <p className="mt-2 text-sm font-medium text-slate-800">
          신청자: 월 {a.mon}명 · 화 {a.tue}명 · 목 {a.thu}명
        </p>
      )}
      <p className="mt-1 text-sm text-slate-600">
        {preview?.lastRun
          ? `마지막 실행: ${formatLastRun(preview.lastRun)}`
          : "배정 상태: 아직 실행 안 함"}
      </p>

      <button
        type="button"
        className="btn-gold mt-5 min-h-[48px] text-base"
        disabled={pending}
        onClick={handleRun}
      >
        {pending ? "배정 처리 중..." : "배정 실행"}
      </button>

      {pending && (
        <p className="mt-2 text-sm text-slate-500">잠시만 기다려 주세요...</p>
      )}

      {resultLine && (
        <p className="mt-4 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-900">
          {resultLine}
        </p>
      )}
      {errorLine && (
        <p className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
          {errorLine}
        </p>
      )}
    </div>
  );
}
