"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GuideSections, GuideTab } from "@/lib/admin-guide";

const TABS: { id: GuideTab; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "player", label: "Player" },
  { id: "technical", label: "Technical" },
];

interface GuideViewProps {
  sections?: GuideSections;
  initialTab?: GuideTab;
  html?: string;
  hideHeader?: boolean;
}

export function GuideView({
  sections,
  initialTab = "admin",
  html,
  hideHeader = false,
}: GuideViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const articleRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<GuideTab>(initialTab);

  const activeHtml = sections
    ? sections[activeTab]
    : html ?? "";

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = useCallback(
    (tab: GuideTab) => {
      setActiveTab(tab);
      if (sections && pathname) {
        router.replace(`${pathname}?tab=${tab}`, { scroll: false });
      }
    },
    [sections, pathname, router]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      const mermaid = (await import("mermaid")).default;
      if (cancelled || !articleRef.current) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        flowchart: { useMaxWidth: true, htmlLabels: true },
        er: { useMaxWidth: true },
      });

      const nodes = articleRef.current.querySelectorAll<HTMLElement>(".mermaid");
      if (nodes.length > 0) {
        await mermaid.run({ nodes: Array.from(nodes) });
      }
    }

    renderMermaid().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [activeHtml]);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {!hideHeader && sections && (
        <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="text-sm text-blue-600 underline">
              ← Back to Dashboard
            </Link>
            <span className="text-base font-semibold text-slate-800">
              How to use
            </span>
          </div>
          <nav
            className="mt-4 grid grid-cols-3 gap-2"
            role="tablist"
            aria-label="Guide sections"
          >
            {TABS.map(({ id, label }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(id)}
                  className={`min-h-[48px] rounded-xl px-2 py-3 text-base font-semibold transition-colors ${
                    selected
                      ? "bg-brand-600 text-white shadow-md"
                      : "border-2 border-slate-300 bg-white text-slate-700 active:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {!hideHeader && !sections && (
        <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <Link href="/admin/guide" className="text-sm text-blue-600 underline">
            ← English guide
          </Link>
        </div>
      )}

      {sections && activeTab === "technical" ? (
        <div role="tabpanel" className="flex flex-col gap-2">
          <iframe
            key="technical-embed"
            src="/admin/guide/mobile?embed=1"
            title="기술 문서"
            className="min-h-[calc(100vh-12rem)] w-full rounded-xl border border-slate-200 bg-white"
          />
          <a
            href="/admin/guide/mobile"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-sm text-blue-600 underline"
          >
            새 탭에서 기술 문서 열기
          </a>
        </div>
      ) : (
        <article
          key={sections ? activeTab : "single"}
          ref={articleRef}
          role={sections ? "tabpanel" : undefined}
          className="guide-prose text-slate-800"
          dangerouslySetInnerHTML={{ __html: activeHtml }}
        />
      )}
    </div>
  );
}
